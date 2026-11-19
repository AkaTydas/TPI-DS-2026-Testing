# 🎹 GUÍA DEFINITIVA DE EJECUCIÓN EN TMUX — COLOQUIO GRUPO 8
## Partitura de Comandos Sincronizada con la Presentación (Integrantes 7 al 10)

---

## 🖥️ 1. SETUP DE TU PANTALLA EN TMUX (3 Paneles)

Recomendamos **exactamente 3 paneles**. En un proyector o pantalla de notebook, 3 paneles es el número perfecto: se lee todo grande, claro y sin amontonar.

```
+-----------------------------+-----------------------------+
|                             |  PANEL 2 (Derecha Arriba)   |
|   PANEL 1 (Izquierda 50%)   |  Terminal de Disparo        |
|   LOGS DEL SERVIDOR EN VIVO |  (cURL y Scripts de Node)   |
|   npm run start:dist        +-----------------------------+
|                             |  PANEL 3 (Derecha Abajo)    |
|   Muestra [T1], [Tc], [Tp], |  Terminal de Auditoría      |
|   [C2], [C1], [Tr] coloreado|  (Consultas con jq)         |
+-----------------------------+-----------------------------+
```

### Comandos de preparación previa (antes de que llamen al grupo):

* **En Panel 1:**
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion
  npm run start:dist
  ```
* **En Panel 2:**
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion
  clear
  ```
* **En Panel 3:**
  ```bash
  cd ~/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion
  clear
  ```

---

## 🗺️ 2. MAPA DE RESPONSABILIDADES: ¿DE QUIÉN ES CADA PRUEBA?

| Integrante | Slide PPTX | Tema Principal | Comandos que ejecuta Pablo en la máquina |
| :--- | :---: | :--- | :--- |
| **Int. 7** | **16 y 17** | **Flujo Exitoso (Happy Path)** | Crear reserva normal + Activar Saga exitosa ($T_1 \to T_2 \to T_3 \to T_r$). Mostrar bases comiteadas. |
| **Int. 8 (¡VOS!)** | **18** | **Fallo y Rollback Compensatorio** | Disparar Saga con `forzarFalloM5: true`. Mostrar traza $C_2 \to C_1$, saldo \$0 en M7 y auditoría inmutable en M9. Explicar **Compensación Defensiva**. |
| **Int. 9** | **19** | **Hardening: Concurrencia, Idempotencia y Webhooks** | Ejecutar `node scripts/test-hardening.js` (HTTP 409 Anti-TOCTOU y OCC). Disparar Webhooks asíncronos (`VIAJE_INICIADO` y `VIAJE_FINALIZADO`). |
| **Int. 10** | **20 y 24** | **Testing Automatizado, Trade-offs y Cierre** | Ejecutar `npm run test:all`. Mostrar los 4 scripts pasando en verde (6/6 tests, 100% blindado). |

---

# 🚀 3. LA PARTITURA EN VIVO PASO A PASO

---

### 🟢 BLOQUE 1: Habla INTEGRANTE 7 — Flujo Exitoso (Min 12:00 a 14:00)
**Diapositivas:** Slide 16 (*Activación Exitosa*) y Slide 17 (*El Orquestador*)

#### 1. Cuando el Int. 7 dice:
> *"Vamos a ver el circuito en tiempo real con nuestra implementación. En la ventana de activación de 15 a 30 minutos, el orquestador dispara la Saga coordinando M9, M7 y M5..."*

#### 2. Vos pegás en el PANEL 2:
```bash
# 1. Creamos la reserva para el Happy Path
RES_7=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-demo","origen":"Av. Castelli 930","destino":"Aeropuerto","tarifaEstimada":3500}' | jq -r .reserva.id)
echo "Reserva creada: $RES_7"

# 2. Disparamos la activación exitosa
curl -s -X POST http://localhost:8090/reservas/$RES_7/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-exito-$RES_7" \
  -d '{"forzarFalloM5": false}' | jq .
```

#### 3. Vos mostrás en el PANEL 1 y pegás en el PANEL 3:
* **Panel 1 (Logs):** Señalás la traza verde:
  `T1 (M9) -> Tc (M7: $3500) -> Tp (M5: Chofer Hernán Fernández) -> Tr (M8: Notificación) -> SAGA FINALIZADA`.
* **Panel 3 (Auditoría):** Corrés para mostrar las 3 bases actualizadas:
  ```bash
  curl -s http://localhost:8090/inspeccionar-bases | jq '{
    reserva_M9: .base_datos_M9_reservas.reservas[-1].estado,
    pago_M7: .base_datos_M7_pagos.transacciones[-1].estado,
    chofer_M5: .base_datos_M5_despacho.solicitudes[-1].conductor_nombre
  }'
  ```
  *(Salida en pantalla: `reserva_M9: "ACTIVADA"`, `pago_M7: "PRE_AUTORIZADO"`, `chofer_M5: "Hernán Fernández"`).*

#### 4. Int. 7 hace el pase:
> *"Ahora mi compañero Pablo mostrará qué ocurre cuando las cosas fallan en el mundo real."*

---

### 🟡 BLOQUE 2: ¡HABLAS VOS! INTEGRANTE 8 — Fallo y Rollback ($C_2 \to C_1$) (Min 14:00 a 16:00)
**Diapositiva:** Slide 18 (*Falla la Pivotante · Rollback Lógico en Orden Inverso: C2 → C1*)

#### 1. Tu Guión Hablado:
> *"El caso exitoso es sencillo, pero el verdadero valor del Patrón Saga aparece cuando las cosas fallan.
> 
> Supongamos que un pasajero pide un viaje en hora pico y M5 no encuentra ningún chofer disponible en la zona.
> 
> Como cada microservicio tiene su propia base de datos física, no existe un ROLLBACK de SQL distribuido. Si la transacción pivotante falla, el orquestador ejecuta un **Rollback Lógico mediante Transacciones Compensatorias en orden estrictamente inverso**:
> 
> 1. **Compensación C2 sobre M7 Pagos:** Se libera la pre-autorización financiera. El dinero retenido vuelve a \$0.
> 2. **Compensación C1 sobre M9 Reservas:** La reserva se marca como `VENCIDA` y se graba un evento inmutable en el historial.
> 
> Además, implementamos **Compensación Defensiva**: si M7 llegara a estar caído justo cuando devolvemos el dinero, la saga no crashea con 500 dejando la reserva congelada; captura el error, marca en la auditoría `REQUIERE_RECONCILIACION_MANUAL` y garantiza que la reserva pase a `VENCIDA`."*

#### 2. Mientras decís esto, pegás en el PANEL 2:
```bash
# 1. Crear reserva para romperla
RES_8=$(curl -s -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-falla","origen":"Barranqueras","destino":"UTN","tarifaEstimada":4200}' | jq -r .reserva.id)

# 2. Disparar forzando el fallo en M5
curl -s -X POST http://localhost:8090/reservas/$RES_8/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-falla-$RES_8" \
  -d '{"forzarFalloM5": true}' | jq .
```

#### 3. Mostrás en pantalla y pegás en el PANEL 3:
* **Panel 1 (Logs):** Apuntás la traza:
  `Tp (M5: FALLO) -> [SAGA ALERT] -> C2 (M7: Fondos liberados) -> C1 (M9: Reserva VENCIDA) -> SAGA COMPENSADA`.
* **Panel 3 (Historial de Auditoría):**
  ```bash
  curl -s http://localhost:8090/reservas/$RES_8/historial | jq '.historial[-1]'
  ```
  *(Se lee clarito: `actor: "SAGA_COMPENSATION_C1"`, `nuevoEstado: "VENCIDA"`, `estadoCompensacionM7: "LIBERADO"`).*
* **Panel 3 (Verificar saldo \$0 en M7):**
  ```bash
  curl -s http://localhost:8090/inspeccionar-bases | jq '.base_datos_M7_pagos.transacciones[] | select(.reserva_id=="'$RES_8'")'
  ```
  *(Se lee: `estado: "LIBERADO"`, `monto: 4200`).*

#### 4. Tu pase al siguiente compañero:
> *"Para explicar cómo blindamos esta arquitectura contra condiciones de carrera, reintentos de red y webhooks, le doy la palabra a mi compañero [Nombre Int. 9]."*

---

### 🔴 BLOQUE 3: Habla INTEGRANTE 9 — Hardening, Concurrencia y Webhooks (Min 16:00 a 18:00)
**Diapositiva:** Slide 19 (*Hardening · Resiliencia y Consistencia Operativa*)

#### 1. Cuando el Int. 9 dice:
> *"En producción pueden ocurrir reintentos por cortes de red o dos operadores intentando despachar la misma reserva al mismo tiempo. Implementamos tres mecanismos de alta ingeniería:
> 
> 1. **Candado Atómico Anti-TOCTOU:** bloquea la clave antes de procesar y rechaza peticiones simultáneas con HTTP 409 Conflict.
> 2. **Control de Concurrencia Optimista (OCC):** frena con HTTP 409 si dos claves distintas intentan pisar el estado.
> 3. **Compensación Defensiva:** protege el flujo si M7 se cae durante el rollback.
> 4. **Webhooks Idempotentes:** M5 nos notifica el ciclo de vida del viaje de forma asíncrona sin duplicar auditoría..."*

#### 2. Vos ejecutás en el PANEL 2 (Prueba de Concurrencia Real):
```bash
node scripts/test-hardening.js
```
*(Se ven los checks verdes en vivo: los dos HTTP 409 por TOCTOU y OCC, y la compensación defensiva pasando).*

#### 3. (Opcional) Demostración del Webhook de Ciclo de Vida:
Si el compañero menciona los webhooks asíncronos (RF-9.7 / RF-9.8), en el **PANEL 2** ejecutás el ciclo de viaje sobre la reserva exitosa `$RES_7`:
```bash
# Simular que el chofer inició el viaje (RF-9.7)
curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{"evento":"VIAJE_INICIADO","reservaId":"'$RES_7'","detalles":{"horaInicio":"2026-11-19T20:00:00Z"}}' | jq .

# Simular que el chofer finalizó el viaje (RF-9.8)
curl -s -X POST http://localhost:8090/webhooks/despacho \
  -H "Content-Type: application/json" \
  -d '{"evento":"VIAJE_FINALIZADO","reservaId":"'$RES_7'","detalles":{"horaFin":"2026-11-19T20:25:00Z","distanciaKm":8.4}}' | jq .
```
* **En Panel 1 (Logs):** Se ve cómo M9 actualiza la reserva y registra el evento sin romper la consistencia.

#### 4. Int. 9 hace el pase:
> *"Para cerrar con la verificación integral y las conclusiones, le doy la palabra a mi compañero [Nombre Int. 10]."*

---

### 🔵 BLOQUE 4: Habla INTEGRANTE 10 — Testing Automatizado y Cierre (Min 18:00 a 20:00)
**Diapositivas:** Slide 20 (*Evidencias*) y Slide 24 (*Límites y Próximos Pasos*)

#### 1. Cuando el Int. 10 dice:
> *"Para garantizar que ninguna modificación rompa la consistencia eventual, implementamos una suite integral automatizada que compila TypeScript y corre los 4 suites de prueba..."*

#### 2. Vos ejecutás en el PANEL 2:
```bash
npm run test:all
```

#### 3. Qué se ve en pantalla:
Aparece la cascada completa en verde:
1. `test-success.js` $\to$ **PASÓ (Flujo exitoso)**
2. `test-failure.js` $\to$ **PASÓ (Rollback compensatorio)**
3. `test-hardening.js` $\to$ **PASÓ (Concurrencia, TOCTOU, OCC y Compensación defensiva)**
4. `test-coverage.js` $\to$ **6/6 TESTS PASADOS (100% BLINDADO)**

El Int. 10 cierra con los trade-offs de la Slide 24 (*Límites y Próximos Pasos*) y pasan a la Slide 25 (*Gracias*).

---

## 🏆 RÚBRICA Y TIPS PARA PREGUNTAS TRAMPA DE LOS PROFESORES

De acuerdo con la rúbrica oficial de la cátedra (**Coloquio y defensa técnica: 30 pts**, **Implementación práctica: 20 pts**):

* **Si preguntan: "¿Por qué no usaron un bus como RabbitMQ o Kafka para la Saga?"**
  * *Respuesta:* "Por los trade-offs analizados en la Slide 15: para un flujo con compensaciones estrictas y una máquina de estados de negocio centralizada (M9), la Orquestación ofrece visibilidad total y depuración determinística. La coreografía en este caso dispersaría la lógica en eventos difíciles de trazar. Para escalar a millones de viajes, la evolución natural sería usar RabbitMQ con el patrón Transactional Outbox."

* **Si preguntan: "¿Por qué ambas bases tienen SQLite en vez de PostgreSQL?"**
  * *Respuesta:* "Para cumplir estrictamente con el patrón Database per Service a nivel prototipo sin requerir una infraestructura pesada. Lo fundamental del patrón no es el motor, sino el **aislamiento físico de archivos (`data/m9_reservas.db`, `data/m7_pagos.db`, `data/m5_despacho.db`)**: ningún servicio tiene credenciales ni permisos para hacer JOINs o consultas SQL sobre la base del otro. Cada interacción es 100% a través de APIs de dominio."
