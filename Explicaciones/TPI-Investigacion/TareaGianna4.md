# Tarea Gianna 4: Suite de Verificación de Hardening y Switches Didácticos para Coloquio
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo:** M9 (Reservas de Viajes)  
**Temas:** Tema 11 (Consistencia: Saga) & Tema 12 (Persistencia: Database per Service)

---

## 1. Resumen de la Tarea

En esta tarea se integraron y consolidaron todas las medidas de resiliencia y seguridad desarrolladas en las Tareas 1, 2 y 3, creando dos herramientas fundamentales para el proyecto:

1. **Switches Didácticos Integrados en la API:**  
   Se añadieron banderas booleanas en el cuerpo JSON de `POST /reservas/:id/activar-saga` para poder **desactivar a demanda** cualquiera de las tres medidas de seguridad. Esto permite demostrar empíricamente en vivo frente a la mesa examinadora el "antes y después" (la falla original vs. la solución de ingeniería) sin modificar una sola línea de código fuente.
2. **Suite Automatizada de Hardening (`npm run test:hardening`):**  
   Se desarrolló el script [`scripts/test-hardening.js`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion/scripts/test-hardening.js) que valida de punta a punta:
   * Candado atómico anti-TOCTOU (Misma clave + latencia $\to$ HTTP 409).
   * Control de concurrencia optimista (Claves distintas sobre la misma reserva $\to$ HTTP 409 en $T_1$).
   * Compensación defensiva en $C_2$ (M7 caído $\to$ HTTP 200, reserva en `VENCIDA` y auditoría de reconciliación manual).
   * Funcionamiento de los switches de demostración.

---

## 2. Catálogo de Switches Didácticos para la Exposición

Al invocar `POST /reservas/:id/activar-saga`, se pueden enviar los siguientes flags opcionales en el body JSON:

| Switch Booleano | Valor por Defecto | Efecto cuando es `false` (Modo Seguro) | Efecto cuando es `true` (Modo Demostración de Falla) |
| :--- | :---: | :--- | :--- |
| **`desactivarCandadoIdempotencia`** | `false` | Inserta `'EN_PROCESO'` al inicio. Frena peticiones concurrentes con `HTTP 409`. | Vuelve al comportamiento original (guarda al final). Permite que la concurrencia duplique cobros en M7 por TOCTOU. |
| **`desactivarCompensacionDefensiva`** | `false` | Envuelve $C_2$ en `try/catch`. Si M7 falla, audita alerta y garantiza que la reserva pase a `VENCIDA`. | Llama directo a M7. Si M7 falla, el orquestador colapsa con `HTTP 500` y la reserva queda congelada en `EN_PROCESO_DESPACHO`. |
| **`desactivarControlOptimista`** | `false` | Exige `WHERE estado = 'CONFIRMADA'` en $T_1$. Si otra petición cambió el estado, arroja `HTTP 409`. | Actualiza a ciegas `WHERE id = ?`. Dos peticiones con distintas claves se pisan entre sí (*Lost Update*). |

### Ejemplo de Petición cURL usando Switches:
```bash
# Probar la falla original de compensación en vivo frente a los docentes:
curl -X POST http://localhost:8090/reservas/res-abc12345/activar-saga \
  -H "Content-Type: application/json" \
  -d '{
    "forzarFalloM5": true,
    "desactivarCompensacionDefensiva": true
  }'
```

---

## 3. Implementación Paso a Paso

### Paso A: Controlador en `src/controllers/sagaController.ts`
El controlador extrae los tres switches del cuerpo y los delega al orquestador:
```typescript
const {
  forzarFalloM5,
  desactivarCandadoIdempotencia,
  desactivarCompensacionDefensiva,
  desactivarControlOptimista
} = req.body;

const resultado = await ActivationSagaOrchestrator.ejecutarSaga(id, {
  forzarFalloM5: Boolean(forzarFalloM5),
  idempotencyKey,
  requestId,
  desactivarCandadoIdempotencia: Boolean(desactivarCandadoIdempotencia),
  desactivarCompensacionDefensiva: Boolean(desactivarCompensacionDefensiva),
  desactivarControlOptimista: Boolean(desactivarControlOptimista)
});
```

### Paso B: Orquestador en `src/saga/activationSagaOrchestrator.ts`
Cada switch gobierna la activación de la contramedida correspondiente:
```typescript
// 1. Candado Anti-TOCTOU
if (!opciones.desactivarCandadoIdempotencia) {
  const candado = IdempotencyRepository.intentarReservar(idempotencyKey);
  if (!candado.exito) throw new AppError(409, 'Operación en proceso', ...);
}

// 2. Control Optimista
ReservationRepository.transicionarConHistorial(
  reservaId,
  'EN_PROCESO_DESPACHO',
  evento,
  { estadoEsperado: opciones.desactivarControlOptimista ? undefined : 'CONFIRMADA' }
);

// 3. Compensación Defensiva
if (opciones.desactivarCompensacionDefensiva) {
  await M7Client.liberarPreAutorizacion({ reservaId }); // Modo vulnerable
} else {
  try {
    await M7Client.liberarPreAutorizacion({ reservaId }); // Modo defensivo
  } catch (err) {
    Logger.error('M7 no disponible. Derivando a reconciliación...');
  }
}
```

### Paso C: Comando npm en `package.json`
Se agregó el script directo para la suite:
```json
"scripts": {
  "test:hardening": "node scripts/test-hardening.js"
}
```

---

## 4. Evidencia Técnica de la Suite Automatizada

Al ejecutar `npm run test:hardening`, la terminal muestra:

```text
======================================================================
  SUITE DE VERIFICACIÓN DE HARDENING - GRUPO 8
======================================================================

📌 TEST 1: Candado Atómico de Idempotencia (Misma Clave + Latencia)
  ✔ Petición 1: HTTP 200 (Éxito)
  ✔ Petición 2: HTTP 409 (Rechazada por Candado Atómico)
  ✔ Transacciones en M7: 1 sola transacción ($3000) - CERO DOBLE COBRO

📌 TEST 2: Control de Concurrencia Optimista (Claves Distintas sobre Misma Reserva)
  ✔ Primera petición: Entró en T1 y avanzó
  ✔ Segunda petición: Bloqueada en T1 por OCC (HTTP 409: Estado ya no era CONFIRMADA)
  ✔ Transacciones en M7: 1 sola transacción ($4500) - Evitó doble cobro sin misma clave

📌 TEST 3: Compensación Defensiva (M7 caído al devolver fondos)
  ✔ Servidor respondió: HTTP 200 (No crasheó con 500)
  ✔ Estado en m9_reservas.db: VENCIDA (C1 garantizado)
  ✔ Auditoría inmutable: Registró alerta REQUIERE_RECONCILIACION_MANUAL

📌 TEST 4: Verificación de Switches Didácticos de Coloquio
  ✔ Switch 'desactivarCompensacionDefensiva: true' funcionando:
     Permite demostrar en vivo el crash original HTTP 500 ante los docentes.

======================================================================
  🎉 TODAS LAS PRUEBAS DE HARDENING PASARON EN VERDE (100% BLINDADO)
======================================================================
```

---

## 5. Resumen de las 4 Tareas Gianna Concluidas

| Tarea | Archivo de Explicación | Vulnerabilidad Mitigada | Estado |
| :---: | :--- | :--- | :---: |
| **TareaGianna1** | [`TareaGianna1.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Explicaciones/TareaGianna1.md) | Carrera de concurrencia e idempotencia pasiva (TOCTOU). | ✅ 100% Resuelta |
| **TareaGianna2** | [`TareaGianna2.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Explicaciones/TareaGianna2.md) | Caída de pasarela de pagos durante el rollback ($C_2$). | ✅ 100% Resuelta |
| **TareaGianna3** | [`TareaGianna3.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Explicaciones/TareaGianna3.md) | Actualización perdida (*Lost Update*) y falta de atomicidad local en M9. | ✅ 100% Resuelta |
| **TareaGianna4** | [`TareaGianna4.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Explicaciones/TareaGianna4.md) | Suite de pruebas `npm run test:hardening` y switches didácticos de coloquio. | ✅ 100% Resuelta |

