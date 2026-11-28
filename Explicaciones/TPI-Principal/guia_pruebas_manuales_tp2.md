# Guía de Pruebas Manuales — Auditoría Completa TP2 (Módulo 9)
**Objetivo:** Verificar en vivo y manualmente cada componente implementado en TP2 (Keycloak JWKS, OAuth2 M2M, Circuit Breaker, Redis, RabbitMQ, Scheduler RF-9.8/9.9/9.11, Concurrencia RNF-08, REST DS-04 y Observabilidad OpenTelemetry) usando el nuevo frontend minimalista en `http://localhost:8089/`.

---

## 0. Cómo levantar el entorno completo para probar

Tenés **2 modos** según qué quieras probar:

### Opción A — Stack Integrado Real (M2 y M7 reales desde GHCR + M4/M5/M8 OpenAPI mocks + Redis + RabbitMQ + Grafana)
**¡NO hace falta clonar ni compilar los repos de M2 ni M7!** El archivo `docker-compose.integrado.yml` ya baja y levanta automáticamente en tu compu:
* **M2 Clientes real** (Grupo 01, FastAPI + MongoDB en puerto `8082`)
* **M7 Tarifas real** (Grupo 11, FastAPI + MySQL en puerto `8087`, vía adaptador `openapi-mocks:8090`)
* **M4, M5 y M8** (mocks OpenAPI externos en `openapi-mocks:8090`)
* **Keycloak mock (`jwks-mock`)** en puerto `8080` (RS256 JWKS + OAuth2 `client_credentials` para M2M)
* **PostgreSQL 16 + Redis 7 + RabbitMQ 3 + Grafana/Loki/Tempo (`otel-lgtm` en `3005`)**

```bash
cd 2026-08-TPI
# 1. Si pusheaste el frontend a main, esperar ~1 min a que GHCR publique m9_g8:latest y luego:
docker compose -f docker-compose.integrado.yml pull m9-reservas
docker compose -f docker-compose.integrado.yml up -d
```

> **Paso obligatorio al usar M2 real (`USE_EXTERNAL_MOCKS=false`):**  
> M2 exige que el `clienteId` sea un **UUID** y que el cliente **esté dado de alta en MongoDB** antes de reservar (si no existe, M2 devuelve `404 Cliente no encontrado` y M9 te rechaza la creación con `404`).
>
> ```bash
> # 1. Elegir un UUID de cliente y pedir token RS256 para ese usuario en jwks-mock:
> CLIENTE_ID="11111111-1111-4111-8111-111111111111"
> TOKEN=$(curl -s "http://localhost:8080/token?sub=${CLIENTE_ID}&roles=CLIENTE" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)")
> echo "$TOKEN"
>
> # 2. Dar de alta el cliente en M2 real (puerto 8082):
> curl -i -X POST http://localhost:8082/api/v1/clientes \
>   -H "Authorization: Bearer $TOKEN" \
>   -H "Content-Type: application/json" \
>   -d "{\"clienteId\":\"${CLIENTE_ID}\",\"nombre\":\"Pablo Test\",\"email\":\"pablo@test.com\",\"telefono\":\"3624000000\"}"
> ```
>
> 3. Pegá ese `$TOKEN` en el frontend (`http://localhost:8089/`), poné `clienteId = 11111111-1111-4111-8111-111111111111` y tocá **`POST /reservas`**.
>    * M9 le va a pedir un token M2M a `jwks-mock`, consultar a **M2 real** en MongoDB, consultar a **M4 mock**, pedir la tarifa a **M7 real** en MySQL (vas a ver una tarifa real tipo `4965 ARS` con *"Tarifa calculada por M7 real"*), guardar en Postgres, cachear en Redis y publicar el evento en RabbitMQ.

> **Aviso importante al cancelar contra M7 real en `docker-compose.integrado.yml`:**  
> En `k6/openapi-mocks.js`, el proxy adaptó `/api/v1/tarifas/estimar` hacia M7 real (`/tarifas/estimar`) y manejó `/pagos/cancelar`, pero M9 llama a `POST /api/v1/tarifas/cancelacion`. Si al cancelar contra el stack integrado M7 real te responde `404` (porque M7 real no tiene `/tarifas/cancelacion`), es normal hasta que todos los grupos alineen el contrato definitivo de cancelación.

---

### Matriz de Integración — Qué Necesita M9 de Cada Módulo y Viceversa

Si en algún momento levantás otro módulo de otro grupo en tu compu (sin Docker integrado), solo apuntás las URLs en `.env` con `USE_EXTERNAL_MOCKS=false`:

| Módulo | Dirección | Endpoint / Canal | Qué envía M9 | Qué espera M9 / qué prueba |
| :--- | :---: | :--- | :--- | :--- |
| **M1 (Keycloak)** | M9 ↔ M1 | `GET .../certs` y `POST .../token` | Valida JWT RS256 entrantes; pide token M2M `client_credentials` (`grupo-08`) | Clave pública JWKS y `access_token` para llamar a M2/M4/M5/M7 |
| **M2 (Clientes)** | M9 → M2 | `GET ${M2_CLIENTES_URL}/api/v1/clientes/:id/estado-cuenta` | `Authorization: Bearer <M2M>`, `X-Request-Id` | `{ estado: "ACTIVO" \| "BLOQUEADO" }` (`404` si no existe, `422` si está bloqueado) |
| **M4 (Ubicación)** | M9 → M4 | `POST ${M4_UBICACION_URL}/api/v1/ubicaciones/validar-estimar` | `{ origen, destino, tipo_vehiculo, fecha_hora }` | `{ origen_valido, destino_valido, motivo, distancia_km, tiempo_estimado_min }` |
| **M7 (Tarifas)** | M9 → M7 | `POST ${M7_TARIFAS_URL}/api/v1/tarifas/estimar` y `/api/v1/tarifas/cancelacion` | Distancia, tiempo, vehículo, fecha / datos de cancelación tardía | `{ tarifa_estimada, moneda, condiciones }` (cacheado 10 min en Redis) / `{ cargo_aplicado, estado_financiero }` |
| **M5 (Despacho)** | M9 → M5 | `POST ${M5_DESPACHO_URL}/api/v1/solicitudes` | Header `Idempotency-Key` + datos de la reserva | `{ solicitud_id }` (llamado desde `POST /activar` o Scheduler a 20 min) |
| **M5 (Webhook)** | M5 → M9 | `POST http://localhost:8089/reservas/:id/despacho` | Rol `solicitud-be` o `SERVICIO` + `{ solicitud_id, resultado: "CONFIRMADA"\|"VENCIDA", fecha }` | Pasa la reserva a `ACTIVADA` o `VENCIDA` (idempotente; rechaza `409` sobre `CANCELADA`) |
| **M8 (Notif.)** | M9 → RMQ → M8 | Exchange topic `reservas.events` (fallback HTTP `POST /api/v1/notificaciones/eventos`) | JSON con `evento_id` UUID y routing key `reserva.confirmada`, `.modificada`, `.recordatorio`, `.cancelada`, `.activada`, `.vencida` | No bloqueante: si M8 o RabbitMQ caen, la reserva sigue igual |

### Opción B — Tu código local en vivo (con Postgres + Redis + RabbitMQ en Docker + jwks-mock)
```bash
cd 2026-08-TPI
# 1. Levantar DB, Redis y RabbitMQ
docker compose up -d db redis rabbitmq

# 2. En otra terminal, levantar el mock de Keycloak JWKS (puerto 8080)
node k6/jwks-mock.js

# 3. En otra terminal, levantar tu backend + frontend en caliente (puerto 8089)
USE_EXTERNAL_MOCKS=true \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/m9_reservas \
REDIS_URL=redis://localhost:6379 \
RABBITMQ_URL=amqp://guest:guest@localhost:5672 \
KEYCLOAK_ISSUER=http://localhost:8080/realms/ds-2026-realm \
KEYCLOAK_JWKS_URI=http://localhost:8080/realms/ds-2026-realm/protocol/openid-connect/certs \
KEYCLOAK_TOKEN_URI=http://localhost:8080/realms/ds-2026-realm/protocol/openid-connect/token \
KEYCLOAK_CLIENT_SECRET=mock-secret \
npm run dev
```

Luego abrí en tu navegador:
* **Frontend M9 (consola de pruebas):** `http://localhost:8089/`
* **Swagger UI:** `http://localhost:8089/docs`
* **Panel web de RabbitMQ:** `http://localhost:15672` (usuario `guest` / clave `guest`)
* **Grafana (si levantaste `docker-compose.otel.yml` o `docker-compose.integrado.yml`):** `http://localhost:3005` (`admin` / `admin`)

---

## 1. Checklist de Qué Tenés que Probar del TP2 (Paso a Paso)

### Bloque A — Salud e Infraestructura (`RNF-04`, `RNF-14`)
1. Abrí `http://localhost:8089/` y tocá **`GET /health`**.
2. **Qué verificar:**
   * HTTP `200 OK`
   * `database: "connected"`
   * `redis: "connected"` (si tirás `docker stop m9-redis` y volvés a consultar, debe pasar a `memory-fallback` sin tumbar la API).
   * `rabbitmq: "connected"` (si tirás `docker stop m9-rabbitmq`, pasa a `offline` y las reservas siguen creándose igual).
   * Aparece el header `X-Request-Id` en el inspector inferior.

---

### Bloque B — Seguridad Keycloak JWKS RS256, RBAC y Anti-IDOR (`RNF-12`, código de Gabi + nuestros fixes)
Generá tokens RS256 reales desde la terminal usando el helper del panel 1 (o con `curl`):
```bash
# Token de CLIENTE (cliente-prueba-01)
curl -s "http://localhost:8080/token?sub=cliente-prueba-01&roles=CLIENTE" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)"

# Token de otro CLIENTE (cliente-intruso)
curl -s "http://localhost:8080/token?sub=cliente-intruso&roles=CLIENTE" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)"

# Token de OPERADOR
curl -s "http://localhost:8080/token?sub=f47ac10b-58cc-4372-a567-0e02b2c3d479&roles=OPERADOR" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)"

# Token de CONDUCTOR
curl -s "http://localhost:8080/token?sub=conductor-01&roles=CONDUCTOR" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)"

# Token de M5 (solicitud-be) y de otro servicio no autorizado (tarifas-be)
curl -s "http://localhost:8080/token?sub=m5-svc&roles=solicitud-be" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)"
curl -s "http://localhost:8080/token?sub=m7-svc&roles=tarifas-be" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)"
```

**Pruebas a ejecutar en el frontend:**
1. **Sin token (`401`):** Tocá *Limpiar token* -> intentá `POST /reservas` -> debe responder `401 NO_AUTENTICADO`.
2. **Token adulterado (`401`):** Pegá un token válido y cambiá 1 letra de la firma final -> debe responder `401` (prueba verificación criptográfica RS256 contra JWKS).
3. **Bypass de idempotencia cerrado (`403`):**
   * Creá una reserva con `cliente-prueba-01` (guardá la `claveIdempotencia`).
   * Cambiá al token de `cliente-intruso` -> tocá *Reusar última clave* -> `POST /reservas` -> debe devolver **`403`** (NO la reserva del otro cliente).
4. **Anti-IDOR en `CONDUCTOR` (`403` -> `200`):**
   * Con token de `CONDUCTOR`, hacé `GET /reservas/:id` sobre una reserva `CONFIRMADA` (sin despacho) -> debe dar **`403`**.
   * Activá esa reserva con token de `OPERADOR` (`POST /activar`).
   * Volvé al token de `CONDUCTOR` y repetí `GET /reservas/:id` -> ahora sí devuelve **`200`**.
5. **Mínimo privilegio en Webhook M5 (`403` vs `200`):**
   * Con token `tarifas-be`, dispará `POST /despacho` -> debe dar **`403`** (solo `solicitud-be`, `reservas-be` o `SERVICIO` pueden).
   * Con token `solicitud-be`, dispará `POST /despacho` (`CONFIRMADA`) -> debe dar **`200`** y pasar a `ACTIVADA`.

---

### Bloque C — Estándares REST, Validaciones y Ciclo de Vida (`DS-04`, `RF-9.1` a `RF-9.7`, `RF-9.12`)
1. **Header `Location` (`201`):** Creá una reserva -> en el Inspector HTTP (abajo) verificá `location: /reservas/<uuid>`.
2. **Idempotencia (`200` y `409`):**
   * Tocá *Reusar última clave* y enviá de nuevo sin cambiar datos -> debe responder **`200`** con el mismo ID.
   * Sin cambiar la clave, cambiá `tipoVehiculo` a `MOTO` y enviá -> debe responder **`409 CONFLICTO_IDEMPOTENCIA`**.
3. **Validaciones de negocio:**
   * Preset *origen=destino* -> **`400 ORIGEN_DESTINO_IGUALES`**.
   * Preset *fuera cobertura* -> **`422`**.
   * Preset *+15 min* -> **`422`** (anticipación insuficiente).
   * En *Consultar por ID*, escribí `hola123` -> **`400 ID_INVALIDO`**.
4. **Paginación (`DS-04`):** Creá 3 reservas, poné `page=1`, `size=2` y tocá `GET /reservas` -> verificá 2 resultados y los headers `x-total-count`, `x-page: 1`, `x-page-size: 2`, `x-total-pages: 2`. Probá `size=999` -> **`400`**.
5. **PATCH y Historial real (`RF-9.6`, `RF-9.12`):**
   * Tocá *Probar PATCH vacío {}* -> **`400`**.
   * Con token de `OPERADOR` (sub UUID), modificá **solo** `zonaHoraria` a `America/Argentina/Cordoba` -> **`200`** y cambia la zona.
   * Andá a la pestaña *GET Historial* -> verificá `rolActor: OPERADOR`, `valorAnterior` con `Buenos_Aires` y `valorNuevo` con `Cordoba`.
6. **Cancelación tardía (`RF-9.7`):** Creá una reserva con el preset **`+40 min`**, cancelala -> mirá en el historial que registró `cancelacionTardia: true` y `cargoAplicado > 0`.
7. **Máquina de estados del Webhook (`RF-9.11`):** Sobre una reserva ya **`CANCELADA`**, mandá `POST /despacho` con token `solicitud-be` -> debe rechazar con **`409 ESTADO_INVALIDO`** (no pisa la cancelación).

---

### Bloque D — Concurrencia y Locks Distribuidos (`RNF-08`)
1. **Doble cancelación simultánea (evitar doble cobro en M7):**
   * Creá una reserva nueva, andá a *POST Cancelar* y tocá **`⚡ 2x Cancelar en paralelo (RNF-08)`**.
   * **Esperado:** Una responde **`200`** y la otra **`409`**. En los logs del backend / historial aparece 1 sola cancelación y 1 solo cobro en M7.
2. **Doble activación simultánea (evitar doble despacho en M5):**
   * Creá otra reserva, cambiá a token `OPERADOR`, andá a *Activar & Webhook M5* y tocá **`⚡ 2x Activar en paralelo (RNF-08)`**.
   * **Esperado:** Ambas devuelven el **mismo** `solicitudDespachoId` (o una `200` y la otra `409` en vuelo), llamando a M5 1 sola vez.

---

### Bloque E — Redis Caché (`RNF-11`)
Con `docker compose up -d redis` levantado:
1. Hacé `GET /reservas/:id` desde el frontend y mirá las claves reales dentro de Redis:
   ```bash
   docker exec -it m9-redis redis-cli KEYS "*"
   ```
   **Esperado:** Vas a ver claves `cache:m7:tarifa:AUTO:...` (TTL ~600s) y `cache:reserva:<uuid>` (TTL ~60s).
2. Hacé un `PATCH` o `POST /cancelar` sobre esa reserva y volvé a correr `KEYS "*"` (o `GET cache:reserva:<uuid>`):
   **Esperado:** La clave `cache:reserva:<uuid>` desapareció inmediatamente (invalidación verificada).

---

### Bloque F — RabbitMQ Mensajería Asíncrona (`RNF-10`)
Con `docker compose up -d rabbitmq` levantado:
1. Entrá al panel web **`http://localhost:15672`** (`guest` / `guest`).
2. Andá a **Exchanges** -> verificá que existe el exchange topic durable **`reservas.events`**.
3. *(Para ver los mensajes en vivo sin M8 conectado)*:
   * En **Queues**, creá una cola temporal llamada `debug-m8`.
   * Hacé clic en `debug-m8` -> **Bindings** -> bindeala al exchange `reservas.events` con routing key **`reserva.#`**.
4. Desde el frontend creá, modificá, activá y cancelá una reserva.
5. Volvé a `debug-m8` -> **Get messages** -> vas a ver los JSON publicados con `evento_id` (UUID), `tipo_evento`, `reserva_id`, `requestId` y sus routing keys (`reserva.confirmada`, `reserva.modificada`, `reserva.cancelada`, `reserva.activada`).

---

### Bloque G — Circuit Breaker y Backoff Exponencial (`RNF-13`, código de Fabri)
Para probarlo en vivo sin mocks:
1. Levantá el backend con `USE_EXTERNAL_MOCKS=false` y apuntando `M2_CLIENTES_URL=http://localhost:9999` (un puerto muerto).
2. Desde el frontend dispará `POST /reservas` **5 veces seguidas**:
   * **Intentos 1 a 5:** Tardan ~500ms-1s (porque hace reintentos con backoff exponencial `150ms -> 300ms`) y responden **`503 Dependencia no disponible`**.
   * En la terminal del backend vas a ver el log `[CircuitBreaker] Circuito ABIERTO para http://localhost:9999`.
   * **Intento 6:** Falla en **< 5 ms** (modo *fail-fast*, sin intentar conectar por red).
   * Esperá **15 segundos** (`resetTimeout`) -> pasa a `SEMI-ABIERTO` y vuelve a probar recuperación.

---

### Bloque H — Scheduler Automático (`RF-9.8` Recordatorios, `RF-9.9` Activación, `RF-9.11` Vencimiento)
Para probarlo rápido sin esperar 1 hora, levantá el backend con ventanas aceleradas:
```bash
SCHEDULER_INTERVAL_MS=5000 \
RECORDATORIO_VENTANA_MINUTOS=180 \
ACTIVACION_VENTANA_MINUTOS=120 \
npm run dev
```
1. Creá una reserva con `+2 hs` (`120 min`) o `+40 min`.
2. Esperá 5-10 segundos y mirá los logs JSON del backend + el historial de la reserva (`GET /historial`) + la cola `debug-m8` en RabbitMQ:
   * Vas a ver emitirse automáticamente **`RESERVA_RECORDATORIO`** (`reserva.recordatorio`) una sola vez y marcarse `recordatorioEnviadoEn`.
   * Cuando entra en ventana de activación, el scheduler llama automáticamente a `activarReserva` hacia M5.
   * Si insertás en Postgres una reserva `CONFIRMADA` con `fecha_hora = NOW() - INTERVAL '5 minutes'` y `solicitud_despacho_id IS NULL`, en 5 segundos el scheduler la pasa sola a **`VENCIDA`** y publica `reserva.vencida` en RabbitMQ.

---

### Bloque I — Observabilidad & Logs Estructurados (`RNF-14`, OpenTelemetry + Loki + Grafana)
1. En el frontend poné un `X-Request-Id` manual (ej: `mi-prueba-pablo-01`) y creá una reserva.
2. En la consola del backend verificá que los logs salen en **JSON estructurado** con `timestamp`, `level`, `service`, `requestId` y `reservaId`.
3. Si levantaste `docker-compose.otel.yml` o `docker-compose.integrado.yml`, abrí **`http://localhost:3005`** (`admin` / `admin`) -> Dashboard **`M9 - Reservas de Viajes`** y buscá `mi-prueba-pablo-01` en Tempo/Loki para ver las trazas, métricas de negocio (`reservas_creadas_total`, `reservas_cancelaciones_total`) y logs en vivo.
