# Registro de Correcciones y Mejoras — Grupo 8 (UTN FRRe 2026)

Este documento detalla todas las correcciones aplicadas sobre el prototipo **Patrón Saga Orquestado & Database per Service (Módulo 9 — Reservas Anticipadas)**, el motivo de cada cambio, los archivos modificados y el resultado de verificación.

---

## 1. Correcciones en la Lógica del Backend (`src/`)

### 1.1 Manejo correcto de fallos en T1 (OCC) y T2 (Pre-autorización M7)
- **Archivo:** `src/saga/activationSagaOrchestrator.ts`
- **Problema detectado:**
  1. Si `T1` fallaba por conflicto de Control de Concurrencia Optimista (`HTTP 409`), la excepción caía en el bloque `catch` de compensaciones y disparaba logs/intentos de compensación innecesarios sobre una reserva que nunca había adquirido `EN_PROCESO_DESPACHO`.
  2. Si `T2` (`M7Client.preAutorizarPago`) fallaba antes de retener fondos (`pagoPreAutorizado === false`), el bloque `catch` registraba el fallo como `"T3 - Falla en Matching de Conductor"`, marcaba `estadoCompensacionM7: "REQUIERE_RECONCILIACION_MANUAL"` en `historial_reservas` y devolvía `saldoRetenidoM7` distinto de `0`.
- **Corrección aplicada:**
  - Se incorporó la bandera `t1Completado`: si `T1` no llega a completarse, se libera la clave de idempotencia (`IdempotencyRepository.liberar`) y se relanza el error original sin ejecutar compensaciones.
  - Si `T2` falla (`!pagoPreAutorizado`), se registra explícitamente el paso fallido en `M7` (`T2 - Falla en Pre-autorización Financiera`), se omite `C2`, se compensa únicamente `C1` (`VENCIDA`), se audita `estadoCompensacionM7: "NO_APLICA"` y se retorna `saldoRetenidoM7: 0`.

### 1.2 Validación de antelación mínima de 2 horas (RF-9.6)
- **Archivo:** `src/controllers/reservationController.ts`
- **Problema detectado:** El requisito funcional RF-9.6 (ventana mínima de 2 horas de antelación para reservas programadas) figuraba en la documentación pero no tenía validación en el endpoint `POST /reservas`.
- **Corrección aplicada:**
  - Se agregó validación opcional sobre el campo `fechaHoraProgramada`: si el cliente lo envía y la fecha es inválida o tiene menos de 2 horas respecto a `Date.now()`, el endpoint responde `HTTP 422` (`Antelación insuficiente (RF-9.6)`) sin persistir en `m9_reservas.db`.
  - Se mantuvo compatibilidad total con las peticiones existentes que omiten `fechaHoraProgramada`.

---

## 2. Correcciones en la Suite de Tests (`scripts/`)

### 2.1 Limpieza común de bases de datos entre corridas
- **Archivos:** `scripts/test-helpers.js` (nuevo), `scripts/test-success.js`, `scripts/test-failure.js`, `scripts/test-hardening.js`
- **Problema detectado:** `test-success.js` y `test-failure.js` no limpiaban las bases SQLite antes de ejecutarse (a diferencia de `test-hardening.js` y `run-demo.js`), dejando estado residual entre ejecuciones.
- **Corrección aplicada:** Se extrajo la función compartida `limpiarBases()` en `scripts/test-helpers.js` y se invocó al inicio de todas las suites automatizadas.

### 2.2 Uso de aserciones estándar (`node:assert/strict`)
- **Archivos:** `scripts/test-success.js`, `scripts/test-failure.js`, `scripts/test-hardening.js`
- **Problema detectado:** Las validaciones eran manuales (`if (...) throw new Error(...)`).
- **Corrección aplicada:** Se migraron las aserciones al módulo nativo `node:assert/strict` (sin agregar dependencias externas).

### 2.3 Correcciones específicas en `scripts/test-hardening.js`
- **TEST 1 (Idempotencia atómica anti-TOCTOU) y TEST 2 (OCC) a prueba de orden de carrera:**
  - *Antes:* Exigía `p1.status === 200 && p2.status === 409`, asumiendo que siempre ganaba la primera petición en `Promise.all`, lo que podía generar fallos intermitentes.
  - *Ahora:* Ordena los códigos devueltos y verifica `[200, 409]` independientemente de qué petición gane la carrera, junto con exactamente `1` transacción en `m7_pagos.db`.
- **TEST 4 (Switch didáctico `desactivarCompensacionDefensiva`):**
  - *Antes:* Tenía un `if (resSwitchVuln.status === 500)` sin rama `else`, por lo que nunca podía fallar aunque el servidor devolviera otro código.
  - *Ahora:* Valida estrictamente con `assert.strictEqual(resSwitchVuln.status, 500, ...)`.
- **Limpieza de comentarios y texto de salida:**
  - Se reemplazaron las referencias internas `"Tarea Gianna 1/2/3"` por los nombres técnicos de cada mecanismo (*Idempotencia atómica anti-TOCTOU*, *Control de Concurrencia Optimista (OCC)*, *Compensación defensiva en C2*).
  - Se cambió el banner final `"100% BLINDADO"` por **`"HARDENING VERIFICADO"`** para reflejar con precisión el alcance del prototipo (consistente con la sección de límites).
- **Restauración segura de stubs:** Los métodos interceptados (`M7Client.preAutorizarPago` y `M7Client.liberarPreAutorizacion`) se restauran siempre en el bloque `finally`.

---

## 3. Nueva Cobertura Automatizada (`scripts/test-coverage.js`)

Se creó la suite `scripts/test-coverage.js` utilizando el runner nativo **`node:test`** y **`node:assert/strict`**, cubriendo 6 escenarios que antes no estaban automatizados:

| # | Escenario cubierto | Qué verifica |
|---|---|---|
| 1 | **Reintento tras finalizar con misma `Idempotency-Key`** | Devuelve `HTTP 200` con la misma respuesta cacheada, sin duplicar transacciones en `m7_pagos.db` ni eventos en `historial_reservas`. |
| 2 | **Webhook duplicado de M5 (`POST /webhooks/despacho`)** | Un segundo aviso idéntico sobre una reserva ya `ACTIVADA` responde `HTTP 200` sin duplicar registros en `historial_reservas`. |
| 3 | **Fallo en T2 (M7 rechaza pre-autorización)** | Compensa solo `C1` (`VENCIDA`), no invoca `C2`, deja `0` transacciones retenidas en `m7_pagos.db` y registra `estadoCompensacionM7: "NO_APLICA"`. |
| 4 | **Rechazo de M2 (`cliente-bloqueado`)** | Responde `HTTP 422` y garantiza `0` reservas persistidas en `m9_reservas.db`. |
| 5 | **Validación RF-9.6 (< 2 horas vs. >= 2 horas)** | Rechaza con `HTTP 422` una reserva a 30 minutos y acepta con `HTTP 201` una reserva a 3 horas. |
| 6 | **Evolución independiente de esquema en `m5_despacho.db`** | Agrega y renombra una columna interna en `conductores`, ejecuta una saga completa en M9 sin errores ni cambios de código, y limpia la columna temporal al finalizar. |

---

## 4. Mejoras en `package.json`

- **Compilación automática previa (`pre*`):** Se agregaron los hooks `predemo`, `pretest:success`, `pretest:failure`, `pretest:hardening`, `pretest:coverage` y `pretest:all` ejecutando `npm run build`, garantizando que cualquier comando funcione en una máquina recién clonada sin paso manual previo.
- **Suite unificada (`npm run test:all`):** Ahora ejecuta de corrido las 4 suites:
  ```bash
  node scripts/test-success.js && node scripts/test-failure.js && node scripts/test-hardening.js && node --test scripts/test-coverage.js
  ```

---

## 5. Verificación Final

- **`npm run test:all`:** PASS (`test-success.js`, `test-failure.js`, `test-hardening.js` y `6/6` tests de `test-coverage.js` en verde).
- **`npm run demo`:** PASS (escenarios 1 y 2, auditoría inmutable e idempotencia verificados).
