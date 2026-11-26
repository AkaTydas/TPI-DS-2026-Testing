# 🛠️ COMANDOS MANUALES PASO A PASO (SIN DEPENDER DE SCRIPTS DE TEST)
## Guía de Pruebas Manuales por Terminal con cURL, SQLite y API Inspector

Esta guía te permite probar y demostrar **a mano** cada flujo, caso de negocio, caso de borde y switch didáctico de los módulos **M9 (Reservas)**, **M7 (Pagos)** y **M5 (Despacho)** directamente desde la terminal, sin necesidad de ejecutar los scripts automatizados de testing.

---

## 📌 Preparación de la Terminal
Parado siempre en:
```bash
cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion
```

---

# 🟢 BLOQUE A: INTEGRANTE 7 — CASOS DE CREACIÓN Y FLUJO EXITOSO (HAPPY PATH)

### 1. Validación de Regla de Negocio RF-9.6: Rechazo por Antelación Insuficiente (< 2 horas)
Intentamos crear una reserva para dentro de 1 hora.
```bash
FECHA_1HORA=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ")

curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "cli-01",
    "origen": "Av. Castelli 930",
    "destino": "UTN FRRe",
    "tarifaEstimada": 3500,
    "fechaHoraProgramada": "'$FECHA_1HORA'"
  }' | jq .
```
* **Resultado esperado:** `HTTP 422 Unprocessable Entity`
  ```json
  {
    "error": "Antelación insuficiente (RF-9.6)",
    "detalle": "La reserva programada debe solicitarse con al menos 2 horas de antelación."
  }
  ```

---

### 2. Creación Exitosa de Reserva Programada con Antelación Válida (>= 2 horas)
```bash
FECHA_3HORAS=$(date -u -d "+3 hours" +"%Y-%m-%dT%H:%M:%SZ")

RES_EXITO=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "cli-01",
    "origen": "Av. Castelli 930",
    "destino": "Aeropuerto",
    "tarifaEstimada": 3500,
    "fechaHoraProgramada": "'$FECHA_3HORAS'"
  }' | jq -r .reserva.id)

echo "Reserva creada con éxito: $RES_EXITO"
```
* **Resultado esperado:** `HTTP 201 Created` en estado `CONFIRMADA`.

---

### 3. Disparo Manual de la Saga de Activación (Flujo Exitoso)
Ejecutamos la Saga para esa reserva con `forzarFalloM5: false`:
```bash
curl -s -X POST http://localhost:8090/reservas/$RES_EXITO/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-exito-$RES_EXITO" \
  -d '{"forzarFalloM5": false}' | jq .
```
* **Resultado esperado:** `HTTP 200 OK` con `estadoFinal: "ACTIVADA"` y los 4 pasos ejecutados ($T_1 \to T_2 \to T_3 \to T_r$).

---

### 4. Inspección Manual del Estado en las 3 Bases Físicamente Aisladas
```bash
# Ver en M9
sqlite3 data/m9_reservas.db "SELECT id, cliente_id, estado, conductor_id FROM reservas WHERE id = '$RES_EXITO';" -table

# Ver en M7
sqlite3 data/m7_pagos.db "SELECT id, reserva_id, monto, estado FROM transacciones WHERE reserva_id = '$RES_EXITO';" -table

# Ver en M5
sqlite3 data/m5_despacho.db "SELECT id, reserva_id, conductor_nombre, vehiculo, estado FROM solicitudes_despacho WHERE reserva_id = '$RES_EXITO';" -table
```
* **Qué verificar:**
  - M9: `ACTIVADA` (con el ID de chofer cargado).
  - M7: `PRE_AUTORIZADO` (monto: \$3500).
  - M5: Chofer asignado (`Hernán Fernández`).

---

# 🟡 BLOQUE B: INTEGRANTE 8 (PABLO) — FALLOS MANUALES, ROLLBACK Y COMPENSACIÓN DEFENSIVA

### 1. Crear una Reserva para Forzar el Fallo
```bash
RES_FALLO=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-falla","origen":"Barranqueras","destino":"UTN FRRe","tarifaEstimada":4200}' | jq -r .reserva.id)

echo "Reserva para fallo: $RES_FALLO"
```

---

### 2. Disparar Falla en Pivotante ($T_3$ M5) y Ejecutar Rollback Compensatorio
```bash
curl -s -X POST http://localhost:8090/reservas/$RES_FALLO/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-falla-$RES_FALLO" \
  -d '{"forzarFalloM5": true}' | jq .
```
* **Resultado esperado:** `HTTP 200 OK` (respuesta estructurada de fallo compensado):
  ```json
  {
    "exito": false,
    "reservaId": "...",
    "estadoFinal": "VENCIDA",
    "mensaje": "La reserva falló y se aplicó rollback lógico: M5: No se encontraron conductores disponibles en la zona en el tiempo límite.",
    "saldoRetenidoM7": 0,
    "conductorAsignadoM5": null
  }
  ```

---

### 3. Verificar la Consistencia Eventual Lograda en las 3 Bases
```bash
# 1. En M7: Verificar que la plata NO quedó retenida (estado LIBERADO)
sqlite3 data/m7_pagos.db "SELECT id, reserva_id, monto, estado FROM transacciones WHERE reserva_id = '$RES_FALLO';" -table

# 2. En M9: Verificar que la reserva pasó a VENCIDA
sqlite3 data/m9_reservas.db "SELECT id, estado, conductor_id FROM reservas WHERE id = '$RES_FALLO';" -table

# 3. En M5: Verificar que se registró el intento fallido
sqlite3 data/m5_despacho.db "SELECT id, reserva_id, estado FROM solicitudes_despacho WHERE reserva_id = '$RES_FALLO';" -table
```

---

### 4. Consultar el Historial Inmutable de Auditoría en M9 (Evento $C_1$)
```bash
curl -s http://localhost:8090/reservas/$RES_FALLO/historial | jq '.historial[-1]'
```
* **Qué verificar:**
  - `actor`: `"SAGA_COMPENSATION_C1"`
  - `estadoAnterior`: `"EN_PROCESO_DESPACHO"`
  - `nuevoEstado`: `"VENCIDA"`
  - `detalles`: `"motivo": "M5: No se encontraron conductores disponibles en la zona..."`, `"estadoCompensacionM7": "LIBERADO"`.

---

### 5. Switch Didáctico: Demostración de Compensación Defensiva
¿Qué pasa si el servicio de Pagos (M7) se cae al momento de devolver el dinero?

* **Modo Seguro (Por Defecto):** M9 captura el error de red en $C_2$, marca `REQUIERE_RECONCILIACION_MANUAL` en el historial y garantiza que la reserva pase a `VENCIDA`.
* **Modo Vulnerable (Switch `desactivarCompensacionDefensiva: true`):**
  Llamada directa sin captura. Si M7 falla, el servidor crashearía con `HTTP 500` dejando la reserva congelada en `EN_PROCESO_DESPACHO`.

```bash
# Prueba del switch didáctico en una reserva:
RES_DEF=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-def","origen":"Resistencia","destino":"Corrientes","tarifaEstimada":6000}' | jq -r .reserva.id)

curl -s -X POST http://localhost:8090/reservas/$RES_DEF/activar-saga \
  -H "Content-Type: application/json" \
  -d '{
    "forzarFalloM5": true,
    "desactivarCompensacionDefensiva": false
  }' | jq .
```

---

# 🔴 BLOQUE C: INTEGRANTE 9 — PRUEBAS MANUALES DE HARDENING Y CONCURRENCIA

### 1. Idempotencia de Transporte (Misma Clave Repetida)
Enviamos una segunda petición idéntica con la misma `Idempotency-Key` a una reserva ya procesada:
```bash
curl -s -X POST http://localhost:8090/reservas/$RES_EXITO/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-exito-$RES_EXITO" \
  -d '{"forzarFalloM5": false}' | jq .
```
* **Resultado:** Devuelve `HTTP 200 OK` con la respuesta cacheada sin re-ejecutar transacciones.
* **Comprobación en M7:**
  ```bash
  sqlite3 data/m7_pagos.db "SELECT count(*) AS total_transacciones FROM transacciones WHERE reserva_id = '$RES_EXITO';" -table
  ```
  *(Sigue habiendo exactamente **1 sola transacción**. Evitó el doble cobro).*

---

### 2. Idempotencia de Dominio (Distinta Clave sobre Misma Reserva Ya Activada)
Simulamos que un segundo operador desde otra máquina intenta activar la reserva que ya fue activada:
```bash
curl -s -X POST http://localhost:8090/reservas/$RES_EXITO/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: clave-otro-operador-xyz" \
  -d '{"forzarFalloM5": false}' | jq .
```
* **Resultado esperado:**
  ```json
  {
    "exito": true,
    "reservaId": "...",
    "estadoFinal": "ACTIVADA",
    "mensaje": "La reserva ya fue activada con anterioridad.",
    "pasosEjecutados": []
  }
  ```
  *(Informa que ya estaba activada y `pasosEjecutados: []` confirma que no hubo cobros redundantes).*

---

### 3. Nota sobre los Switches Didácticos (`desactivarCandadoIdempotencia` / `desactivarControlOptimista`)
Los switches didácticos se envían en el body de `POST /reservas/:id/activar-saga`, pero pensados para reservas que **aún estén en `CONFIRMADA`** (si usás `$RES_EXITO`, la idempotencia de dominio corta antes porque ya está `ACTIVADA`).
* `desactivarCandadoIdempotencia: true`: omite el candado `EN_PROCESO` anti-TOCTOU y solo consulta caché al final.
* `desactivarControlOptimista: true`: omite `WHERE estado = 'CONFIRMADA'` en el `UPDATE` de `T1`.
* `desactivarCompensacionDefensiva: true`: se verifica con mock de caída en M7 ejecutando `node scripts/test-hardening.js` (Test 4 $\to$ devuelve `HTTP 500`).

---

### 4. Webhooks Idempotentes Manuales de Despacho (`/webhooks/despacho`)
Endpoint real implementado en `WebhookController.ts` para recibir callbacks de M5 (`resultado: "CONFIRMADA"` o `"VENCIDA"`).

#### A. Crear una reserva en `CONFIRMADA` para probar el Webhook
```bash
RES_WH=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-wh","origen":"Centro","destino":"Terminal","tarifaEstimada":3500}' | jq -r .reserva.id)
echo "Reserva para Webhook: $RES_WH"
```

#### B. Webhook 1: M5 confirma chofer (`resultado: "CONFIRMADA"`)
```bash
curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{
    "reservaId": "'$RES_WH'",
    "resultado": "CONFIRMADA",
    "conductorId": "cond-001",
    "conductorNombre": "Hernán Fernández"
  }' | jq .
```
* **Resultado esperado:** `HTTP 200 OK` con `"estado": "ACTIVADA"`.
* **Verificar estado e historial en M9:**
  ```bash
  sqlite3 data/m9_reservas.db "SELECT id, estado, conductor_id FROM reservas WHERE id = '$RES_WH';" -table
  curl -s http://localhost:8090/reservas/$RES_WH/historial | jq '.totalEventos'
  ```

#### C. Idempotencia en Webhooks: Reenvío duplicado por fallo de red
Volvemos a enviar **exactamente el mismo webhook** de arriba:
```bash
curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{
    "reservaId": "'$RES_WH'",
    "resultado": "CONFIRMADA",
    "conductorId": "cond-001",
    "conductorNombre": "Hernán Fernández"
  }' | jq .
```
* **Resultado esperado:** Responde `HTTP 200 OK` con `"mensaje": "Aviso ya procesado previamente (Idempotente)."` y `"estadoActual": "ACTIVADA"`.
* **Comprobar que NO duplicó eventos en auditoría:**
  ```bash
  curl -s http://localhost:8090/reservas/$RES_WH/historial | jq '.totalEventos'
  ```
  *(El número de eventos se mantiene exactamente igual).*

#### D. Webhook de rechazo (`resultado: "VENCIDA"`) sobre otra reserva
```bash
RES_WH_FAIL=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-wh-fail","origen":"Centro","destino":"Campus","tarifaEstimada":3000}' | jq -r .reserva.id)

curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{
    "reservaId": "'$RES_WH_FAIL'",
    "resultado": "VENCIDA"
  }' | jq .
```
* **Resultado esperado:** Marca la reserva como `VENCIDA` en M9 con `actor: "M5_DESPACHO_WEBHOOK"`.
