# Tarea Gianna 2: Compensación Defensiva en C2 (Resiliencia ante Caídas de Pasarela de Pagos)
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo:** M9 (Reservas de Viajes)  
**Temas:** Tema 11 (Consistencia: Saga) & Tema 12 (Persistencia: Database per Service)

---

## 1. Resumen de la Tarea

En esta tarea se resolvió una de las fallas más severas en el diseño de Sagas: **¿Qué ocurre si la transacción compensatoria ($C_2$) falla o la pasarela de pagos no responde?**

Antes de esta mejora:
* Si el servicio financiero (M7) arrojaba un *timeout* o error al intentar liberar la pre-autorización, el bloque `catch` del orquestador sufría una excepción no controlada.
* El servidor devolvía un error `HTTP 500`.
* La transacción compensatoria local en M9 ($C_1$) **nunca se ejecutaba**, dejando la reserva congelada indefinidamente en `EN_PROCESO_DESPACHO` (estado sucio/inconsistente).

Con la solución implementada:
1. La llamada compensatoria a M7 ($C_2$) queda encapsulada en un bloque defensivo.
2. Si M7 falla, el error se captura y se genera una alerta inmutable de auditoría (`REQUIERE_RECONCILIACION_MANUAL`).
3. **Se garantiza que $C_1$ siempre se ejecute:** la reserva transiciona limpiamente a `VENCIDA`.
4. El cliente recibe una respuesta `HTTP 200` con la explicación clara de que el viaje fue cancelado y que la pasarela financiera será conciliada.

---

## 2. Fundamentación Teórica (Auditoría de Gianna)

En el documento [`Investigacion/InvestigaciónTpp.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Investigacion/Investigaci%C3%B3nTpp.md) (Sección 4.2: *Compensaciones Idempotentes y Resilientes*), se establece que las transacciones compensatorias en sistemas distribuidos deben asumir que la red fallará.

Según la literatura de Chris Richardson (*Microservices Patterns*) y Garcia-Molina (1987):
> *"Una Saga no puede abortar el proceso de rollback por una falla transitoria en una compensación intermedia. Debe avanzar en el flujo compensatorio inverso para garantizar la consistencia eventual y aislar el fallo para conciliación o Dead Letter Queue (DLQ)."*

---

## 3. Implementación Paso a Paso de la Solución

### Paso A: Blindaje de Rutas Relativas en `src/config/database.ts`
Se modificó la resolución del directorio de datos para que sea relativa al archivo físico mediante `import.meta.url` en vez de `process.cwd()`:
```typescript
import { fileURLToPath } from 'node:url';

// dataDir apuntará siempre a Implementacion/data sin importar desde dónde se invoque Node
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');
```

### Paso B: Bloque Compensatorio Defensivo en `src/saga/activationSagaOrchestrator.ts`
En el bloque `catch` de la Saga, se protegió la ejecución de $C_2$ y se aseguró la ejecución de $C_1$:

```typescript
// C2 (Acción Compensatoria M7): Liberar pre-autorización monetaria de forma defensiva
let compensacionM7Exitosa = false;
let errorCompensacionM7: string | null = null;

if (pagoPreAutorizado) {
  try {
    await M7Client.liberarPreAutorizacion({ reservaId }, requestId);
    compensacionM7Exitosa = true;
    pasos.push({
      paso: 'C2 - Compensación Financiera',
      tipo: 'C2',
      servicio: 'M7',
      descripcion: 'Pre-autorización cancelada. Saldo retenido = $0 en db_pagos.',
      resultado: 'COMPENSADO'
    });
  } catch (errC2: unknown) {
    errorCompensacionM7 = errC2 instanceof Error ? errC2.message : 'Error en M7';
    Logger.error(`[SAGA CRITICAL] Falló la compensación C2 en M7: ${errorCompensacionM7}. Registrando alerta para reconciliación.`, requestId);
    pasos.push({
      paso: 'C2 - Fallo en Compensación Financiera',
      tipo: 'C2',
      servicio: 'M7',
      descripcion: `No se pudo liberar el pago automáticamente: ${errorCompensacionM7}. Requiere reconciliación manual.`,
      resultado: 'FALLO'
    });
  }
}

// C1 (Acción Compensatoria M9): Transición a VENCIDA (¡Garantizada!)
ReservationRepository.actualizarEstado(reservaId, 'VENCIDA');
HistoryRepository.registrar({
  reservaId,
  tipoEvento: 'RESERVA_VENCIDA',
  estadoAnterior: 'EN_PROCESO_DESPACHO',
  estadoNuevo: 'VENCIDA',
  actor: 'SAGA_COMPENSATION_C1',
  detalles: {
    motivo: errorMsg,
    estadoCompensacionM7: compensacionM7Exitosa ? 'LIBERADO' : 'REQUIERE_RECONCILIACION_MANUAL',
    errorM7: errorCompensacionM7
  },
  fechaHora: new Date().toISOString()
});
```

---

## 4. Evidencia Técnica y Verificación Empírica

Al ejecutar el script de auditoría [`Implementacion/scripts/test-reproducir-fallas.js`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion/scripts/test-reproducir-fallas.js), simulamos una caída de red fatal en M7 durante la compensación:

### Antes del arreglo:
* Servidor crasheaba con `HTTP 500`.
* En `m9_reservas.db`: La reserva quedaba en `EN_PROCESO_DESPACHO`. ❌

### Después del arreglo (Logs Reales):
```text
[ERROR] [SAGA CRITICAL] Falló la compensación C2 en M7: FATAL: M7_PAYMENTS_SERVICE_TIMEOUT (Pasarela inaccesible). 
                        Registrando alerta para reconciliación.
[SAGA]  [req-0ecf] [C1 | M9] Reserva transicionada a VENCIDA en db_m9 -> COMPENSADO
[SAGA]  [req-0ecf] [Tr | M8] Notificación multicanal enviada a cliente -> OK
[WARN]  ========== SAGA COMPENSADA (Consistencia Eventual Lograda) ==========

HTTP Status devuelto por la API: 200 OK
Respuesta: {
  exito: false,
  estadoFinal: "VENCIDA",
  mensaje: "La reserva falló y pasó a VENCIDA, pero la pasarela M7 requiere reconciliación manual: FATAL: M7_PAYMENTS_SERVICE_TIMEOUT"
}

🔎 Estado en m9_reservas.db tras el fallo:
  Estado esperado: "VENCIDA"
  Estado REAL obtenido: "VENCIDA"  ✅
```

---

## 5. Demostración en Vivo para el Coloquio

Pregunta típica de examen de sistemas distribuidos:
> *"¿Qué pasa si la pasarela de pagos se cae justo cuando le piden devolver la plata?"*

**Respuesta respaldada en este código:**
> *"En nuestra implementación, las compensaciones se ejecutan de manera defensiva y desacoplada. Si M7 no responde al rollback de $C_2$, el orquestador captura el fallo, genera un registro inmutable de auditoría con la bandera `REQUIERE_RECONCILIACION_MANUAL` y continúa con $C_1$, asegurando que la reserva en M9 se cierre en `VENCIDA`. El sistema nunca queda bloqueado en un estado intermedio."*

