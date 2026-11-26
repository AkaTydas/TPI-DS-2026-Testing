# ⚡ MACHETE DE COMANDOS TMUX (EJECUCIÓN PURA)

---

## 🖥️ SETUP INICIAL (3 PANELES)

* **Panel 1 (Izquierda):** Logs del Servidor en Vivo
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion && npm run start:dist
  ```
* **Panel 2 (Derecha Arriba):** Terminal de Disparo (cURL / Scripts)
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion && clear
  ```
* **Panel 3 (Derecha Abajo):** Terminal de Auditoría (`sqlite3 -table`)
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion && clear
  ```

---

## 🔍 CONSULTA COMPLETA DE CADA BASE DE DATOS (SIN FILTRADO)

Para mirar a ojo todas las filas de cada subsistema en el **Panel 3**:

### 1. Ver Base M9 Completa (Reservas y Auditoría)
```bash
sqlite3 data/m9_reservas.db "SELECT id, cliente_id, estado, tarifa_estimada, conductor_id FROM reservas;" -table
```
*(Historial inmutable completo):*
```bash
sqlite3 data/m9_reservas.db "SELECT id, reserva_id, tipo_evento, estado_nuevo, actor FROM historial_reservas;" -table
```

### 2. Ver Base M7 Completa (Transacciones Financieras y Saldos)
```bash
sqlite3 data/m7_pagos.db "SELECT id, reserva_id, monto, estado, fecha_hora FROM transacciones;" -table
```

### 3. Ver Base M5 Completa (Solicitudes de Despacho y Choferes)
```bash
sqlite3 data/m5_despacho.db "SELECT id, reserva_id, estado, conductor_nombre, vehiculo FROM solicitudes_despacho;" -table
```

---

## 🟢 INTEGRANTE 7 (MATEO LÓPEZ): FLUJO EXITOSO (HAPPY PATH)

### [Panel 2] Paso 1: Crear reserva válida
```bash
RES_7=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-demo","origen":"Av. Castelli 930","destino":"Aeropuerto","tarifaEstimada":3500}' | jq -r .reserva.id)
echo "Reserva creada: $RES_7"
```
*Qué hace:* Inserta reserva en `m9_reservas.db` en estado `CONFIRMADA`.

### [Panel 2] Paso 2: Activar Saga Exitosa
```bash
curl -s -X POST http://localhost:8090/reservas/$RES_7/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-exito-$RES_7" \
  -d '{"forzarFalloM5": false}' | jq .
```
*Qué hace:* Corre $T_1$ (M9) $\to$ $T_2$ (M7: retención \$3500) $\to$ $T_3$ (M5: asigna chofer) $\to$ $T_r$ (M8: push). Reserva pasa a `ACTIVADA`.

### [Panel 3] Paso 3: Verificar estado en las 3 bases de datos
```bash
sqlite3 data/m9_reservas.db "SELECT id, cliente_id, estado, conductor_id FROM reservas ORDER BY creado_en DESC LIMIT 3;" -table
sqlite3 data/m7_pagos.db "SELECT id, reserva_id, monto, estado FROM transacciones ORDER BY fecha_hora DESC LIMIT 3;" -table
sqlite3 data/m5_despacho.db "SELECT id, reserva_id, estado, conductor_nombre FROM solicitudes_despacho ORDER BY fecha_hora DESC LIMIT 3;" -table
```
*Qué hace:* Muestra en tablas las últimas filas de cada base física (`cli-demo` en `ACTIVADA`, `PRE_AUTORIZADO`, `Hernán Fernández`), sin depender de variables del Panel 2.

---

## 🟡 INTEGRANTE 8 (PABLO SANABRIA): FALLO EN PIVOTANTE Y ROLLBACK ($C_2 \to C_1$)

### [Panel 2] Paso 1: Crear reserva para provocar fallo
```bash
RES_8=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-falla","origen":"Barranqueras","destino":"UTN","tarifaEstimada":4200}' | jq -r .reserva.id)
echo "Reserva creada: $RES_8"
```
*Qué hace:* Crea reserva `CONFIRMADA` en M9 lista para activar.

### [Panel 2] Paso 2: Disparar Saga forzando fallo en M5
```bash
curl -s -X POST http://localhost:8090/reservas/$RES_8/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-falla-$RES_8" \
  -d '{"forzarFalloM5": true}' | jq .
```
*Qué hace:* Corre $T_1$ $\to$ $T_2$ $\to$ Falla en $T_3$ (M5 sin choferes). Orquestador atrapa error y ejecuta $C_2$ (libera pago en M7) y $C_1$ (marca `VENCIDA` en M9). Devuelve `HTTP 200` con `exito: false` y `estadoFinal: "VENCIDA"`.

### [Panel 3] Paso 3: Verificar Auditoría Inmutable en M9 (Historial + Reserva)
```bash
sqlite3 data/m9_reservas.db "SELECT id, cliente_id, estado, conductor_id FROM reservas ORDER BY creado_en DESC LIMIT 3;" -table
sqlite3 data/m9_reservas.db "SELECT id, reserva_id, tipo_evento, estado_nuevo, actor FROM historial_reservas ORDER BY id DESC LIMIT 4;" -table
```
*Qué hace:* Mostrás la fila de `cli-falla` en estado `VENCIDA` y su traza en `historial_reservas` (`RESERVA_CREADA` $\to$ `ACTIVACION_INICIADA` $\to$ `RESERVA_VENCIDA` con `actor: SAGA_COMPENSATION_C1`).

### [Panel 3] Paso 4: Verificar Saldo \$0 en M7 (Pagos) y Fallo en M5
```bash
sqlite3 data/m7_pagos.db "SELECT id, reserva_id, monto, estado FROM transacciones ORDER BY fecha_hora DESC LIMIT 3;" -table
sqlite3 data/m5_despacho.db "SELECT id, reserva_id, estado, conductor_nombre FROM solicitudes_despacho ORDER BY fecha_hora DESC LIMIT 3;" -table
```
*Qué hace:* Confirma que la transacción de esa reserva en M7 pasó a `LIBERADO` (cero dinero retenido) y en M5 quedó registrada como `SIN_CONDUCTOR`.

---

## 🔴 INTEGRANTE 9 (AVRIL MACHUCA): HARDENING Y CONCURRENCIA

### [Panel 2] Paso 1: Suite de Hardening y Concurrencia Real
```bash
node scripts/test-hardening.js
```
*Qué hace:* Corre en verde los 4 tests de hardening:
- Candado Atómico Anti-TOCTOU: ráfaga paralela con misma clave $\to$ HTTP 200 y HTTP 409 Conflict.
- OCC: ráfaga paralela con claves distintas a la misma reserva $\to$ HTTP 200 y HTTP 409 Conflict.
- Compensación Defensiva: M7 caído durante $C_2$ $\to$ garantiza $C_1$ (`VENCIDA`) y marca `REQUIERE_RECONCILIACION_MANUAL`.
- Switch didáctico `desactivarCompensacionDefensiva: true` $\to$ demuestra el crash HTTP 500 sin protección.

*(Nota: Los webhooks idempotentes y el caché de idempotencia los cubre automáticamente `npm run test:coverage` dentro de `npm run test:all` en el turno del Int. 10; si necesitás tirarlos a mano como Plan B, están en `COMANDOS_MANUALES_PASO_A_PASO.md`).*

---

## 🔵 INTEGRANTE 10 (GUSTAVO LÓPEZ): TESTING AUTOMATIZADO Y CIERRE

### [Panel 2] Paso 1: Ejecución de toda la suite de tests
```bash
npm run test:all
```
*Qué hace:* Compila con `tsc` y corre en fila:
1. `test-success.js` $\to$ Happy Path
2. `test-failure.js` $\to$ Rollback $C_2 \to C_1$
3. `test-hardening.js` $\to$ Concurrencia, TOCTOU, OCC y Compensación defensiva
4. `test-coverage.js` $\to$ 6/6 tests pasando (100% blindado).
