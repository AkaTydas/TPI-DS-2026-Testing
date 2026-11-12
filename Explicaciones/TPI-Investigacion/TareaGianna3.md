# Tarea Gianna 3: Control de Concurrencia Optimista (OCC) y Atomicidad Local en M9
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo:** M9 (Reservas de Viajes)  
**Temas:** Tema 11 (Consistencia: Saga) & Tema 12 (Persistencia: Database per Service)

---

## 1. Resumen de la Tarea

En esta tarea se resolvieron dos vulnerabilidades de persistencia y concurrencia en la base de datos de M9 (`m9_reservas.db`):

1. **Control de Concurrencia Optimista (*Optimistic Concurrency Control - OCC*):**  
   Antes, `ReservationRepository.actualizarEstado` hacía un `UPDATE reservas SET estado = ? WHERE id = ?` a ciegas. Si dos operadores o procesos intentaban activar o modificar la misma reserva usando **claves de idempotencia distintas**, ambas peticiones pisaban el estado en disco sin validar si la reserva seguía en estado `CONFIRMADA`.  
   Ahora, la actualización exige condicionalmente `WHERE id = ? AND estado = estadoEsperado`. Si otra transacción ya modificó el estado en el mismo milisegundo, SQLite reporta `changes === 0` y se arroja un error `HTTP 409 Conflict` antes de realizar llamadas externas a M7 o M5.

2. **Atomicidad Local en M9 (Transacción SQLite):**  
   Se creó el método `transicionarConHistorial`, el cual envuelve la mutación de la tabla `reservas` y la inserción inmutable en `historial_reservas` bajo un bloque transaccional atómico (`BEGIN IMMEDIATE ... COMMIT`). Si ocurre una caída o error entre ambas sentencias, se ejecuta `ROLLBACK` completo en `db_m9`, garantizando que **jamás exista una reserva cuyo cambio de estado no quede auditado**.

---

## 2. Fundamentación Teórica (Auditoría de Gianna)

En el documento [`Investigacion/InvestigaciónTpp.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Investigacion/Investigaci%C3%B3nTpp.md) (Sección 2.2: *Contramedidas de Diseño ante Pérdida de Aislamiento*), se detalla:

> *"Dado que en una Saga no hay aislamiento global de base de datos (las transacciones locales confirman sus cambios de inmediato), el sistema debe blindarse mediante **Control de Concurrencia Optimista (Version Check / Status Check)**. El servicio debe verificar que el registro no haya sido mutado concurrentemente antes de aplicar una transición de estado o una compensación."*

Asimismo, dentro de la frontera de un microservicio (*Bounded Context*), las actualizaciones compuestas sobre su propio almacén deben mantener las propiedades **ACID locales**, encapsulando la entidad de negocio y su tabla de auditoría en una única unidad de trabajo atómica.

---

## 3. Implementación Paso a Paso de la Solución

### Paso A: Control de Concurrencia Optimista en `src/repositories/reservationRepository.ts`
Se incorporó el parámetro opcional `estadoEsperado?: EstadoReserva`. Si se especifica, el `UPDATE` se condiciona:
```typescript
public static actualizarEstado(
  id: string,
  estado: EstadoReserva,
  extras?: { solicitudDespachoId?: string | null; conductorId?: string | null },
  estadoEsperado?: EstadoReserva
): void {
  const ahora = new Date().toISOString();
  
  const sql = estadoEsperado
    ? `UPDATE reservas SET estado = ?, actualizado_en = ? WHERE id = ? AND estado = ?`
    : `UPDATE reservas SET estado = ?, actualizado_en = ? WHERE id = ?`;

  const stmt = dbM9.prepare(sql);
  const res = (estadoEsperado
    ? stmt.run(estado, ahora, id, estadoEsperado)
    : stmt.run(estado, ahora, id)) as { changes: number };

  // Si ninguna fila fue afectada, significa que el estado cambió concurrentemente
  if (estadoEsperado && res.changes === 0) {
    throw new AppError(
      409,
      'Conflicto de concurrencia optimista',
      `La reserva ${id} no pudo ser actualizada a ${estado} porque no se encuentra en el estado esperado (${estadoEsperado}). Fue modificada por otra operación concurrente.`
    );
  }
}
```

### Paso B: Método Atómico `transicionarConHistorial`
Se implementó la unidad transaccional en `ReservationRepository`:
```typescript
public static transicionarConHistorial(
  id: string,
  nuevoEstado: EstadoReserva,
  evento: {
    tipoEvento: string;
    estadoAnterior: string;
    actor: string;
    detalles: Record<string, unknown>;
  },
  opciones?: {
    extras?: { solicitudDespachoId?: string | null; conductorId?: string | null };
    estadoEsperado?: EstadoReserva;
  }
): void {
  dbM9.exec('BEGIN IMMEDIATE');
  try {
    this.actualizarEstado(id, nuevoEstado, opciones?.extras, opciones?.estadoEsperado);
    HistoryRepository.registrar({
      reservaId: id,
      tipoEvento: evento.tipoEvento,
      estadoAnterior: evento.estadoAnterior,
      estadoNuevo: nuevoEstado,
      actor: evento.actor,
      detalles: evento.detalles,
      fechaHora: new Date().toISOString()
    });
    dbM9.exec('COMMIT');
  } catch (err) {
    dbM9.exec('ROLLBACK');
    throw err;
  }
}
```

### Paso C: Integración en el Orquestador (`src/saga/activationSagaOrchestrator.ts`)
Se reemplazaron las llamadas sueltas por la invocación atómica con validación de estado:

1. **En $T_1$ (Bloqueo Local):** Exige que la reserva esté estrictamente en `CONFIRMADA`:
   ```typescript
   ReservationRepository.transicionarConHistorial(
     reservaId,
     'EN_PROCESO_DESPACHO',
     { tipoEvento: 'ACTIVACION_INICIADA', estadoAnterior: reserva.estado, ... },
     { estadoEsperado: 'CONFIRMADA' }
   );
   ```
2. **En la Confirmación de $T_3$ (Éxito):** Exige que esté en `EN_PROCESO_DESPACHO`:
   ```typescript
   ReservationRepository.transicionarConHistorial(
     reservaId,
     'ACTIVADA',
     { tipoEvento: 'RESERVA_ACTIVADA', ... },
     { extras: { solicitudDespachoId, conductorId }, estadoEsperado: 'EN_PROCESO_DESPACHO' }
   );
   ```
3. **En la Compensación $C_1$ (Rollback):** Exige que esté en `EN_PROCESO_DESPACHO`:
   ```typescript
   ReservationRepository.transicionarConHistorial(
     reservaId,
     'VENCIDA',
     { tipoEvento: 'RESERVA_VENCIDA', ... },
     { estadoEsperado: 'EN_PROCESO_DESPACHO' }
   );
   ```

---

## 4. Evidencia Técnica y Verificación Empírica

* **Protección ante Doble Activación con distintas claves:**  
  Si dos peticiones con diferentes identificadores intentan activar la misma reserva, la primera hace `UPDATE reservas SET estado = 'EN_PROCESO_DESPACHO' WHERE id = ? AND estado = 'CONFIRMADA'` con éxito.  
  La segunda petición ejecuta el mismo query, pero como el estado en disco ya no es `'CONFIRMADA'`, `changes === 0` y arroja de inmediato:
  ```json
  {
    "error": "Conflicto de concurrencia optimista",
    "detalle": "La reserva res-123 no pudo ser actualizada a EN_PROCESO_DESPACHO porque no se encuentra en el estado esperado (CONFIRMADA)."
  }
  ```
  La segunda petición es abortada **antes de generar retenciones en M7 ni solicitudes en M5**.
* **Pruebas de Regresión:**
  * `npm run test:all`: ✅ 100% de aserciones superadas.
  * `npm run demo`: ✅ Ambos escenarios y evidencias de auditoría e idempotencia funcionando.
  * `node scripts/test-reproducir-fallas.js`: ✅ 100% verde.

---

## 5. Demostración en Vivo para el Coloquio

Si los docentes consultan:
> *"¿Cómo evitan la anomalía de Actualización Perdida (Lost Update) si dos personas tocan la misma reserva al mismo tiempo?"*

**Respuesta respaldada en el código:**
> *"Aplicamos Control de Concurrencia Optimista (OCC) en el repositorio de M9. Cada mutación de estado exige que la fila en base de datos coincida con el estado esperado (`WHERE id = ? AND estado = 'CONFIRMADA'`). Si otra transacción cambió el estado una milésima de segundo antes, la sentencia afecta 0 filas y el sistema rechaza la operación con `HTTP 409 Conflict`, evitando cobros o asignaciones duplicadas."*

