# Explicación Detallada de Commits — Cierre y Auditoría TP2 (Módulo 9)
**Repositorio:** `FRRe-DS/2026-08-TPI` (rama `main`)  
**Módulo:** M9 — Reservas de Viajes (Grupo 8) — UTN FRRe 2026  
**Fecha:** 21/11/2026  
**Resultado final de validación:** `npm run build` sin errores · **16/16 suites de Jest pasando (115/115 tests en verde)**.

---

## Resumen Ejecutivo de la Cadena de Commits

| Orden | Commit | Mensaje | Área / Requerimientos |
| :---: | :---: | :--- | :--- |
| 0 | `1d5ad1a` | `Finish TP2 with redis and rabbit integration` | DS-04 (`Location` y paginación), RNF-11 (Redis), RNF-10 (RabbitMQ), Docker Compose base |
| 1 | `21557ef` | `Fix JWT role override, enforce service RBAC least privilege, and remove hardcoded secrets` | RNF-06, RNF-12 (Seguridad JWT, RBAC y secretos) |
| 2 | `6a0393c` | `Implement OAuth2 client_credentials service tokens, fix HTTP body timeout, and preserve upstream 4xx errors` | RNF-12 (Keycloak M2M), RNF-13 (Resiliencia HTTP) |
| 3 | `1138a71` | `Restrict PostgreSQL in-memory fallback to test connection errors, fix history mapping, and add conditional repository queries` | RNF-05, RNF-08, RF-9.12 (Persistencia y auditoría) |
| 4 | `52c7589` | `Add structured JSON logger, distributed Redis locks, and fix RabbitMQ double-send and shutdown lifecycle` | RNF-08, RNF-09, RNF-10, RNF-11, RNF-14 |
| 5 | `b04f18b` | `Fix authorization bypass, PATCH bugs, UUID and route validations, and add write concurrency locks` | RF-9.1, RF-9.6, RF-9.7, RNF-08, RNF-09, RNF-12 |
| 6 | `14b7e89` | `Implement RF-9.8 reminders, RF-9.11 auto-expiration, and harden activation concurrency and webhook state machine` | RF-9.8, RF-9.9, RF-9.10, RF-9.11, RNF-08 |
| 7 | `f8acf9e` | `Fix Docker Compose Keycloak env, add Redis and RabbitMQ to CI, add concurrency and security integration tests, and update TP2 docs` | RNF-04, RNF-07, RNF-17, RNF-20 |
| 8 | `f344c89` | `Restore DevOps CI workflow file to original state until real integration tests` | RNF-17 (Preservar workflow de DevOps sin cambios) |

> **Alcance preservado intencionalmente:**
> * No se modificaron los endpoints/DTOs de clientes HTTP hacia otros módulos (Sección 2 de contratos inter-módulo), para ajustarlos de una sola vez cuando todos los grupos publiquen sus contratos definitivos.
> * Se mantuvo `ANTICIPACION_MINIMA_MINUTOS=30` como default configurable para no romper la ventana entre creación (`30m`) y cancelación sin cargo (`60m`) validada en los tests de RF-9.7.
> * Se mantuvo la idempotencia `200` y estado `CONFIRMADA` (hasta webhook M5) en `POST /reservas/:id/activar`, blindando su concurrencia interna.

---

## Detalle Commit por Commit

### Commit 0 — `1d5ad1a`
**`Finish TP2 with redis and rabbit integration`**

Implementación base de los 3 requisitos restantes de TP2:
* **DS-04 (`src/controllers/reservationController.ts`):** Se agregó el header `Location: /reservas/{id}` en respuestas `201 Created` y soporte de paginación `page`/`size` en `GET /reservas` emitiendo headers `X-Total-Count`, `X-Page`, `X-Page-Size` y `X-Total-Pages` (manteniendo el array en el body por retrocompatibilidad).
* **RNF-11 (`src/config/redis.ts`, `src/clients/m7Client.ts`, `src/services/reservationService.ts`, `src/services/activationService.ts`):** Integración con `ioredis` para cachear cotizaciones de tarifas de M7 (TTL 10 min) y lecturas de reservas por ID (TTL 60s), con invalidación automática al modificar, cancelar o activar.
* **RNF-10 (`src/config/rabbitmq.ts`, `src/clients/m8Client.ts`):** Integración con `amqplib` declarando el exchange topic durable `reservas.events` para publicar eventos del ciclo de vida hacia M8.
* **Infraestructura (`docker-compose.yml`, `src/controllers/healthController.ts`):** Se sumaron contenedores de `redis` y `rabbitmq` y se amplió `GET /health` para reportar el estado de PostgreSQL, Redis y RabbitMQ.

---

### Commit 1 — `21557ef`
**`Fix JWT role override, enforce service RBAC least privilege, and remove hardcoded secrets`**

* **Qué estaba mal:**
  1. En `src/middlewares/auth.ts`, el objeto `payload` tenía `...decoded` al **final**. Cuando un token real de Keycloak incluía el claim raíz `roles`, sobrescribía y borraba los roles unificados de `realm_access` y `resource_access['grupo-08']` (y tiraba `500 TypeError` si `decoded.roles` llegaba como `string`).
  2. En `requireRoles()`, cualquier rol terminado en `-be` (por ejemplo `tarifas-be`) pasaba el filtro en rutas que solo debían admitir servicios específicos como `POST /reservas/:id/despacho`.
  3. Había secretos reales hardcodeados en `src/config/env.ts` y `.env.example` (`KEYCLOAK_CLIENT_SECRET` real de `grupo-08` y `JWT_SECRET` fijo), además de código muerto HS256 (`generateDevToken`).
  4. Faltaban controles web básicos (`helmet`/headers de seguridad, límite de tamaño del JSON body, validación de formato/longitud de `X-Request-Id`).
* **Cambios aplicados:**
  * `src/middlewares/auth.ts`: Se movió `...decoded` al principio del objeto `payload` para preservar siempre `roles` normalizados y `sub`; se restringió `requireRoles` para aplicar mínimo privilegio cuando una ruta declara roles `*-be` concretos; se eliminó `generateDevToken`.
  * `src/config/env.ts` y `.env.example`: Se quitaron los secretos hardcodeados, se agregaron variables configurables para `CORS_ORIGIN`, `KEYCLOAK_TOKEN_URI` y ventanas del scheduler (`SCHEDULER_INTERVAL_MS`, `ACTIVACION_VENTANA_MINUTOS`, `RECORDATORIO_VENTANA_MINUTOS`), y se corrigió `useExternalMocks` para respetar `USE_EXTERNAL_MOCKS=false` explícito en `test`.
  * `src/app.ts` y `src/middlewares/requestId.ts`: Se desactivó `x-powered-by`, se agregaron headers HTTP de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection`), límite `100kb` en `express.json()`, CORS configurable y regex de sanitización para `X-Request-Id` (máx. 128 chars).
  * `tests/unit/authMiddleware.test.ts`: Se agregaron 3 tests verificando preservación de roles con `...decoded`, normalización de `roles` como string y mínimo privilegio en rutas `*-be`.

---

### Commit 2 — `6a0393c`
**`Implement OAuth2 client_credentials service tokens, fix HTTP body timeout, and preserve upstream 4xx errors`**

* **Qué estaba mal:**
  1. `src/clients/serviceToken.ts` generaba tokens salientes con `HS256` local, lo que provocaba `401 Unauthorized` al invocar módulos protegidos por Keycloak RS256.
  2. En `src/clients/httpClient.ts`, `clearTimeout(timeoutId)` corría antes de leer el body (`response.json()`), dejando colgadas respuestas con body lento.
  3. `m4Client.ts`, `m5Client.ts` y `m7Client.ts` tapaban cualquier error HTTP (incluso `400`/`422`) devolviendo siempre `503 Dependencia no disponible`.
* **Cambios aplicados:**
  * `src/clients/serviceToken.ts`: Se reescribió `getServiceToken()` como `async` usando el flujo OAuth2 `grant_type=client_credentials` contra `KEYCLOAK_TOKEN_URI`, con caché en memoria hasta 30s antes de expirar, timeout de 2s y fallback limpio en desarrollo/tests sin `clientSecret`.
  * `src/clients/httpClient.ts`: Se integró `await getServiceToken()` y se movió `clearTimeout(timeoutId)` a un bloque `finally` para cubrir toda la lectura del body.
  * `src/clients/m4Client.ts`, `src/clients/m5Client.ts`, `src/clients/m7Client.ts`: Se propagan errores HTTP `4xx` del upstream manteniendo `503` para caídas de red, timeouts, `5xx` y circuit breaker abierto.
  * `tests/unit/serviceToken.test.ts`: Nueva suite de 3 tests unitarios validando `client_credentials`, caché de token, fallback local y error en producción.

---

### Commit 3 — `1138a71`
**`Restrict PostgreSQL in-memory fallback to test connection errors, fix history mapping, and add conditional repository queries`**

* **Qué estaba mal:**
  1. Los 3 repositorios (`reservationRepository.ts`, `historyRepository.ts`, `idempotencyRepository.ts`) atrapaban **cualquier** error de PostgreSQL y caían a `Map`/arrays en RAM incluso en producción o ante errores de negocio (`23505` UNIQUE o `22P02` UUID inválido).
  2. En `database.ts`, un error SQL en tests podía apagar `dbAvailable = false` para el resto de la corrida aunque PostgreSQL estuviera levantado (como en GitHub Actions).
  3. En `historyRepository.ts`, `RESERVA_MODIFICADA` guardaba los valores **nuevos** en `valorAnterior`, y `rolActor` se adivinaba buscando substrings en `user.sub` (rompiéndose con UUIDs reales de Keycloak).
  4. Faltaban métodos atómicos condicionales para concurrencia (`RNF-08`), recordatorios (`RF-9.8`) y expiración automática (`RF-9.11`).
* **Cambios aplicados:**
  * `src/config/database.ts`: Se implementaron `isDbConnectionError()`, `shouldUseInMemoryFallback()` (activo **solo** en `NODE_ENV=test` ante fallos de conectividad, nunca ante errores SQLSTATE) y `mapDatabaseError()` (`22P02` -> `400 ID_INVALIDO`, `23505` -> `409 CONFLICTO`, conexión caída en prod -> `503`).
  * `sql/01_init_schema.sql` y `src/types/reservation.ts`: Se agregó la columna `recordatorio_enviado_en TIMESTAMPTZ` (con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), índice de recordatorios y el tipo `'RECORDATORIO'` en `TipoCambioHistorial`.
  * `src/repositories/reservationRepository.ts`: Se restringió el fallback en RAM, se corrigió `obtenerPendientesDeActivacion` agregando `AND fecha_hora > NOW()` (evita loop infinito en vencidas), y se crearon `actualizarCondicional`, `obtenerPendientesDeRecordatorio`, `marcarRecordatorioEnviado` y `obtenerVencidasParaExpirar`.
  * `src/repositories/historyRepository.ts` y `idempotencyRepository.ts`: Se corrigió el fallback, se agregó `case 'RESERVA_RECORDATORIO'`, se mapeó `valorAnterior`/`valorNuevo` correctamente y se priorizó `detalles.rolActor` explícito.

---

### Commit 4 — `52c7589`
**`Add structured JSON logger, distributed Redis locks, and fix RabbitMQ double-send and shutdown lifecycle`**

* **Qué estaba mal:**
  1. Todo el backend usaba `console.log` plano sin formato JSON ni correlación `requestId`/`reservaId` (RNF-14).
  2. `m8Client.ts` publicaba en RabbitMQ y luego enviaba *también* el `POST` HTTP (doble envío), no incluía `evento_id` UUID para deduplicación y provocaba el warning `Cannot log after tests are done` en Jest.
  3. `redis.ts` tenía `retryStrategy: () => null` (no reconectaba ante microcortes) y no ofrecía locks distribuidos; `m7Client.ts` usaba `fecha_hora` con milisegundos en la clave de caché (anulando cache hits).
  4. `src/index.ts` nunca conectaba RabbitMQ al iniciar (haciendo que `/health` reportara `offline`) ni cerraba Redis/RabbitMQ en `gracefulShutdown`.
* **Cambios aplicados:**
  * `src/config/logger.ts`: Nuevo logger JSON estructurado (`timestamp`, `level`, `service`, `requestId`, `reservaId`, `message`).
  * `src/config/redis.ts`: Se agregó `retryStrategy` con backoff exponencial acotado en producción y locks distribuidos atómicos `acquireLock` (`SET NX EX`) + `releaseLock` (script Lua atómico) con equivalente en memoria para tests.
  * `src/config/rabbitmq.ts`: Se agregó timeout de 2s en `amqp.connect`, se evitó abrir sockets TCP en `test` (eliminando el warning de Jest) y se integró el logger estructurado.
  * `src/clients/m8Client.ts`: Se agregó `evento_id` UUID, routing key `reserva.recordatorio` y se cortó el flujo cuando RabbitMQ publica exitosamente (`if (publishedToBroker) return;`) para evitar doble envío.
  * `src/clients/m7Client.ts`: Se creó `buildTarifaCacheKey()` normalizando la fecha a franja horaria (`YYYY-MM-DDTHH`) y redondeando distancia/tiempo.
  * `src/index.ts`, `src/middlewares/errorHandler.ts`, `src/controllers/healthController.ts`: Conexión inicial de RabbitMQ, cierre ordenado de Postgres + Redis + RabbitMQ + OTel en `gracefulShutdown`, logging estructurado con `req.id` en `errorHandler` y limpieza de import sin usar.
  * `tests/unit/rabbitPublisher.test.ts` y `redisCache.test.ts`: Tests ampliados cubriendo `RESERVA_RECORDATORIO`, no doble envío HTTP, `evento_id` y prueba directa de `RabbitMQManager` con `amqplib` mockeado.

---

### Commit 5 — `b04f18b`
**`Fix authorization bypass, PATCH bugs, UUID and route validations, and add write concurrency locks`**

* **Qué estaba mal:**
  1. En `crearReserva()`, la idempotencia se verificaba **antes** del control `user.sub !== data.clienteId`, permitiendo a otro cliente sondear o recuperar reservas ajenas (`IDOR`/bypass).
  2. Un usuario `CONDUCTOR` podía consultar cualquier reserva de cualquier cliente aunque no estuviera en despacho ni activada (`IDOR`).
  3. En `modificarReserva()`: cambiar solo `zonaHoraria` sin `fechaHora` se ignoraba por estar anidado en un `if`; faltaba validar el límite temporal de la fecha actual; `ModificarReservaSchema` aceptaba body vacío `{}` y campos prohibidos; no revalidaba M2; y no guardaba los valores anteriores reales.
  4. `modificarReserva()` y `cancelarReserva()` leían desde caché Redis (stale reads) y no tenían lock distribuido ni `UPDATE` condicional, permitiendo doble cobro en M7 ante cancelaciones paralelas.
  5. Faltaban validaciones de UUID en `:id`, `origen !== destino`, formato ISO 8601 con zona/offset, tope máximo de paginación (`size <= 100`) y comparación completa en `validarCoincidenciaIdempotencia`.
* **Cambios aplicados:**
  * `src/controllers/reservationController.ts` y `activationController.ts`: Se exportaron los esquemas Zod reales, se agregó `assertValidUuid()` en todas las rutas con `:id`, regex ISO 8601 con zona/offset, `.strict()` + `minProperties >= 1` en `ModificarReservaSchema`, y validación de `page`/`size` con `MAX_PAGE_SIZE = 100`.
  * `src/services/reservationService.ts`: Se movió el chequeo de autorización al principio de `crearReserva` + validación adicional de ownership en idempotencia; se agregó lock de idempotencia; se validó `origen !== destino`; se restringió `CONDUCTOR` a reservas en despacho o `ACTIVADA`; se blindaron `modificarReserva` y `cancelarReserva` con locks distribuidos en Redis, lectura directa de PostgreSQL (sin stale reads) y `actualizarCondicional`; se arregló `zonaHoraria` independiente, límite temporal en `PATCH`, revalidación en M2, `valoresAnteriores` reales y `rolActor` real del JWT.
  * `tests/unit/reservationValidation.test.ts`: Ahora importa y testea los esquemas Zod reales exportados desde `reservationController.ts`.

---

### Commit 6 — `14b7e89`
**`Implement RF-9.8 reminders, RF-9.11 auto-expiration, and harden activation concurrency and webhook state machine`**

* **Qué estaba mal:**
  1. **RF-9.8 (Recordatorios)** no estaba implementado en el scheduler.
  2. **RF-9.11 (Vencimiento automático)** no expiraba reservas cuya `fecha_hora` ya había pasado sin despacho.
  3. `activarReserva()` tenía race condition ante dos llamadas concurrentes (podía duplicar llamadas a M5).
  4. `procesarWebhookDespacho()` no validaba estados finales, permitiendo que un webhook tardío sobrescribiera una reserva `CANCELADA` o `VENCIDA` a `ACTIVADA`.
* **Cambios aplicados:**
  * `src/services/activationService.ts`: Se agregaron locks distribuidos en Redis y `actualizarCondicional` tanto en `activarReserva()` como en `procesarWebhookDespacho()`, además de una guarda estricta de máquina de estados que rechaza con `409 ESTADO_INVALIDO` cualquier intento de pisar una reserva `CANCELADA` o `VENCIDA`.
  * `src/services/schedulerService.ts`: Se parametrizaron todas las ventanas desde `config.scheduler` y se estructuró `ejecutarCiclo()` en 3 fases ordenadas:
    1. `procesarVencimientos()` (RF-9.11): expira reservas vencidas sin despacho, invalida caché, registra historial `RESERVA_VENCIDA` y notifica a M8.
    2. `procesarRecordatorios()` (RF-9.8): marca atómicamente `recordatorio_enviado_en`, registra historial `RESERVA_RECORDATORIO` y publica `reserva.recordatorio` hacia M8 una sola vez.
    3. Activación en ventana hacia M5 (RF-9.9) únicamente sobre reservas vigentes (`fecha_hora > NOW()`).
  * `tests/unit/schedulerService.test.ts`: Se agregaron tests completos para RF-9.8 (recordatorios) y RF-9.11 (vencimiento automático).

---

### Commit 7 — `f8acf9e`
**`Fix Docker Compose Keycloak env, add Redis and RabbitMQ to CI, add concurrency and security integration tests, and update TP2 docs`**

* **Qué estaba mal:**
  1. `docker-compose.yml` no pasaba ninguna variable `KEYCLOAK_*` al contenedor `m9-reservas`, haciendo fallar todas las requests con `401` dentro de Docker; además faltaba `HEALTHCHECK` en `Dockerfile` y `docker-compose.yml`.
  2. `.github/workflows/ci.yml` solo levantaba PostgreSQL, sin contenedores de Redis ni RabbitMQ.
  3. Faltaban pruebas de integración específicas para concurrencia paralela, anti-IDOR, máquina de estados del webhook y los fixes de seguridad/validación.
  4. `README.md` y `package.json` seguían documentando el estado de TP1 (HS256, 35 tests).
* **Cambios aplicados:**
  * `docker-compose.yml` y `Dockerfile`: Se agregaron todas las variables `KEYCLOAK_*`, `REDIS_TTL_*` y `SCHEDULER_*` usando expansión `${VAR:-default}` sin secretos hardcodeados, y se incorporaron `healthcheck`/`HEALTHCHECK` en `/health`.
  * `.github/workflows/ci.yml`: Se sumaron los servicios `redis:7-alpine` y `rabbitmq:3-management-alpine` con healthchecks y variables `REDIS_URL`/`RABBITMQ_URL`.
  * `tests/integration/concurrencyAndSecurity.test.ts`: Nueva suite de 9 tests de integración verificando bypass de idempotencia (`403`), validación UUID (`400`), `origen === destino` (`400`), límites de paginación (`400`), `PATCH` de `zonaHoraria` + `valorAnterior`/`rolActor`, anti-IDOR en `CONDUCTOR`, rechazo de webhook desde `tarifas-be` (`403`) y sobre `CANCELADA` (`409`), activación paralela (M5 llamado 1 sola vez) y cancelación paralela (M7 llamado 1 sola vez, `200` + `409`).
  * `README.md` y `package.json`: Documentación actualizada integralmente a TP1 + TP2 con diagrama de arquitectura Mermaid, tabla completa de endpoints, guías de Docker/k6/OTel y cobertura de pruebas.

---

### Commit 8 — `f344c89`
**`Restore DevOps CI workflow file to original state until real integration tests`**

* **Motivo:** En `NODE_ENV=test` los tests actuales corren con fallback en memoria para Redis y RabbitMQ (sin requerir servicios reales levantados en GitHub Actions). Se restauró `.github/workflows/ci.yml` exactamente al estado dejado por el equipo de DevOps (5to año) para no interferir con su pipeline; cuando se activen pruebas de integración distribuida reales (`TEST_REAL_REDIS=true` / `TEST_REAL_RABBITMQ=true`), se volverán a sumar ambos servicios al CI.
