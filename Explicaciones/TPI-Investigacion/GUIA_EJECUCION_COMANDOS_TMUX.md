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
* **Panel 3 (Derecha Abajo):** Terminal de Auditoría (Consultas con jq)
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion && clear
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
curl -s http://localhost:8090/inspeccionar-bases | jq '{
  reserva_M9: .base_datos_M9_reservas.reservas[-1].estado,
  pago_M7: .base_datos_M7_pagos.transacciones[-1].estado,
  chofer_M5: .base_datos_M5_despacho.solicitudes[-1].conductor_nombre
}'
```
*Qué hace:* Muestra que las 3 bases físicas se comitearon (`ACTIVADA`, `PRE_AUTORIZADO`, `Hernán Fernández`).

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
*Qué hace:* Corre $T_1$ $\to$ $T_2$ $\to$ Falla en $T_3$ (M5 sin choferes). Orquestador atrapa error y ejecuta $C_2$ (libera pago en M7) y $C_1$ (marca `VENCIDA` en M9). Devuelve HTTP 422.

### [Panel 3] Paso 3: Verificar Auditoría Inmutable en M9
```bash
curl -s http://localhost:8090/reservas/$RES_8/historial | jq '.historial[-1]'
```
*Qué hace:* Muestra el último evento: `actor: "SAGA_COMPENSATION_C1"`, `nuevoEstado: "VENCIDA"`, `estadoCompensacionM7: "LIBERADO"`.

### [Panel 3] Paso 4: Verificar Saldo \$0 en M7 (Pagos)
```bash
curl -s http://localhost:8090/inspeccionar-bases | jq '.base_datos_M7_pagos.transacciones[] | select(.reserva_id=="'$RES_8'")'
```
*Qué hace:* Confirma que la transacción en M7 pasó a `LIBERADO` (cero dinero retenido).

---

## 🔴 INTEGRANTE 9 (AVRIL MACHUCA): HARDENING, CONCURRENCIA Y WEBHOOKS

### [Panel 2] Paso 1: Suite de Concurrencia Real con Latencia
```bash
node scripts/test-hardening.js
```
*Qué hace:* Corre en verde los tests de concurrencia:
- Candado Atómico Anti-TOCTOU: ráfaga paralela con misma clave $\to$ HTTP 200 y HTTP 409 Conflict.
- OCC: ráfaga paralela con claves distintas a la misma reserva $\to$ HTTP 200 y HTTP 409 Conflict.
- Compensación Defensiva: M7 caído durante $C_2$ $\to$ garantiza $C_1$ y marca `REQUIERE_RECONCILIACION_MANUAL`.

### [Panel 2] Paso 2: Webhook de Viaje Iniciado (RF-9.7)
```bash
curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{"evento":"VIAJE_INICIADO","reservaId":"'$RES_7'","detalles":{"horaInicio":"2026-11-19T20:00:00Z"}}' | jq .
```
*Qué hace:* Simula callback de M5 avisando que el chofer recogió al pasajero. M9 transiciona la reserva a `EN_CURSO`.

### [Panel 2] Paso 3: Webhook de Viaje Finalizado (RF-9.8)
```bash
curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{"evento":"VIAJE_FINALIZADO","reservaId":"'$RES_7'","detalles":{"horaFin":"2026-11-19T20:25:00Z","distanciaKm":8.4}}' | jq .
```
*Qué hace:* Simula callback de M5 avisando que el viaje terminó. M9 transiciona a `FINALIZADA`.

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
