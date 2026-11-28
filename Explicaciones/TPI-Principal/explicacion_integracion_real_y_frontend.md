# Explicación de Frontend de Pruebas (`e377a52`) e Integración Real con los 5 Módulos (`fcff932`)

**Fecha:** 28/11/2026  
**Módulo:** M9 — Reservas de Viajes (Grupo 8)  
**Ramas involucradas en `2026-08-TPI`:**
- `main` → commit `e377a52` (`frontend for integration testing`)
- `integracion/contratos-reales` → commit `fcff932` (`Adapt external module clients (M2, M4, M5, M7, M8) to real contracts`)

---

## 1. Estrategia de ramas (por qué se usó `integracion/contratos-reales`)

Los estudiantes de 5to año (DevOps) tienen su presentación el **lunes 30/11** usando `docker-compose.integrado.yml` (que baja la imagen publicada desde `main` y levanta `k6/openapi-mocks.js` con las rutas mock anteriores). Como nuestra entrega de 3ro pasó para el jueves de esa semana:

- **`main` queda 100% compatible** con el stack de 5to año (incluyendo el nuevo frontend de `e377a52`) para no romperles la defensa del 30/11.
- **`integracion/contratos-reales` tiene los 5 clientes externos ya adaptados y probados en vivo** contra los repos reales de los otros grupos. Apenas terminen los de 5to (o si les mueven la fecha), se hace un `merge` limpio hacia `main`.

### Comandos rápidos para el equipo
```bash
# Bajar y cambiar a la rama de integración real
git fetch origin
git checkout integracion/contratos-reales

# Volver a main cuando haga falta
git checkout main

# Mergear a main después del 30/11
git checkout main
git pull origin main
git merge integracion/contratos-reales
git push origin main
```

---

## 2. Commit `e377a52` (`main`) — Frontend minimalista de integración (`RNF-15`)

Se agregó una interfaz web liviana estilo consola oscura **sin dependencias externas** servida directamente por el backend de M9 en `GET /` (`http://localhost:8089/`).

### Archivos agregados / modificados
- `public/index.html`, `public/styles.css`, `public/app.js`: UI responsiva con manejo explícito de estados de carga, confirmación, error y botón **Reintentar** (`RNF-15`).
- `src/app.ts`: sirve `public/` mediante `express.static` en `/` (manteniendo `/docs`, `/health`, `/openapi.yaml` y `/reservas` intactos).
- `Dockerfile`: copia `public/` a la imagen OCI de producción.
- `tests/integration/health.test.ts`: verifica que `GET /` devuelva `200 text/html`.

### Capacidades clave para probar TP2 / integración
1. **Panel de Auth & JWT:** decodifica `sub`, `roles`, `iss` y `exp` en vivo, guarda el token en `localStorage` y genera el comando `curl` para pedir tokens al `jwks-mock`.
2. **Creación de reservas (`POST /reservas`):** presets de fechas (`+2h`, `+40m` tardía, `+15m` rechazo `422`, `-10m` pasado), presets de error (`origen = destino` → `400`, fuera de cobertura → `422`) y botón para reusar la última `claveIdempotencia` (`200` idempotente / `409` conflicto).
3. **Listado paginado y Redis (`GET /reservas`, `GET /reservas/:id`):** controles `page`/`size` mostrando headers `X-Total-Count`, `X-Page`, `X-Page-Size` y `X-Total-Pages` (`DS-04`).
4. **Ciclo de vida y Concurrencia (`RNF-08`):** `PATCH`, `POST /cancelar`, `POST /activar`, simulador de webhook `POST /despacho`, historial `GET /historial` y botones **`⚡ 2x Cancelar en paralelo`** y **`⚡ 2x Activar en paralelo`**.
5. **Inspector HTTP en vivo:** muestra status, latencia en ms, `X-Request-Id`, `Location` y el JSON completo de cada respuesta.

---

## 3. Auditoría de contratos OpenAPI entre pares de grupos

Antes de tocar ningún cliente, se compararon los archivos OpenAPI de ambos grupos responsables de cada módulo externo con el que interactúa M9:

| Módulo | Grupos comparados | Paridad de contrato | Grupo elegido para pruebas reales | Observaciones clave |
| :--- | :--- | :--- | :--- | :--- |
| **M2 (Clientes)** | G1 vs G17 | **100%** (idénticos byte a byte) | **Grupo 1** (`2026-01-TPI`) | `GET /api/v1/clientes/{clienteId}/estado-cuenta`. Devuelve `{ clienteId, estado: "ACTIVO" \| "BLOQUEADO", bloqueosVigentes }`. |
| **M4 (Ubicación)** | G3 vs G14 | **95.6%** (**100%** en los endpoints que usa M9) | **Grupo 14** (`2026-14-TPI`) | `GET /api/v1/rutas/estimacion` con query params `origen_latitud`, `origen_longitud`, `destino_latitud`, `destino_longitud`, `tipo_vehiculo`. |
| **M5 (Despacho)** | G4 vs G13 | **2.9%** (no sincronizados) | **Grupo 4** (`2026-04-TPI`) | **G4 es el único compatible**: implementa `POST /solicitudes/desde-reserva` y el callback `POST /reservas/{id}/despacho` hacia M9. G13 es un stub de 3 endpoints sin reservas. |
| **M7 (Tarifas)** | G6 vs G11 | Contrato común en **G6** (`openapi-g6.yml`) | **Grupo 6** (`2026-06-TPI`) | La imagen GHCR de G11 usada por 5to año es vieja (rutas sin `/api/v1` que obligaron a usar un proxy traductor). G6 implementa el contrato oficial `POST /api/v1/tarifas/estimaciones`. |
| **M8 (Notificaciones)** | G7 vs G10 | **100%** (idénticos byte a byte) | **Grupo 10** (`2026-10-TPI`) | `POST /api/v1/eventos` (`202 Accepted`) con esquema camelCase estricto `EventoEntrada` + Mailpit para ver los emails reales. |

---

## 4. Commit `fcff932` (`integracion/contratos-reales`) — Adaptación de clientes

**Principio aplicado:** no se tocó el OpenAPI de M9, ni sus rutas, ni el esquema de base de datos, ni los repositorios de los otros grupos. Solo se adaptó la capa de clientes salientes (`src/clients/`) y sus pruebas unitarias.

### Cambios exactos por cliente
1. **`src/clients/m2Client.ts`**
   - Se actualizó la interfaz `M2EstadoCuentaResponse` para reflejar `clienteId` (camelCase) y `bloqueosVigentes`, manteniendo compatibilidad con `estado: 'ACTIVO' | 'BLOQUEADO'`.
2. **`src/clients/m4Client.ts`**
   - Antes: `POST /api/v1/ubicaciones/validar-estimar`.
   - Ahora: `GET /api/v1/rutas/estimacion?origen_latitud=...&origen_longitud=...&destino_latitud=...&destino_longitud=...&tipo_vehiculo=...`.
   - Mapea `distancia_estimada_km` → `distancia_km` y `eta_minutos` → `tiempo_estimado_min`.
3. **`src/clients/m5Client.ts`**
   - Antes: `POST /api/v1/solicitudes` con `origen`/`destino` anidados.
   - Ahora: `POST /solicitudes/desde-reserva` con cuerpo plano `{ reserva_id, cliente_id, origen_latitud, origen_longitud, destino_latitud, destino_longitud, tipo_vehiculo, tarifa_estimada: { moneda: 'ARS', total_estimado } }` y header `Idempotency-Key`.
   - El callback de retorno que ya tenía M5-G4 (`POST /reservas/:id/despacho` con `{ solicitud_id, resultado, fecha }`) **ya coincidía 100% con nuestro endpoint existente**.
4. **`src/clients/m7Client.ts` y `src/services/reservationService.ts`**
   - Estimación: `POST /api/v1/tarifas/estimaciones` con `tipo_vehiculo` en **minúsculas** (`auto`/`moto`), `distancia_km`, `duracion_estimada_min` y `fecha_hora` (`extra="forbid"` en Pydantic de M7-G6). Lee el total desde `desglose.total`.
   - Cancelación: según el contrato oficial de M7 (`openapi-g6.yml`), `POST /api/v1/cargos-cancelacion` solo se invoca cuando corresponde cobrar cargo (**cancelación tardía**). Si no es tardía devuelve `SIN_CARGO` localmente; si es tardía envía `POST /api/v1/cargos-cancelacion` con `Idempotency-Key: cancelacion-{reserva_id}`, `tipo_vehiculo` en minúsculas, `metodo: 'tarjeta'` y `motivo`.
5. **`src/clients/m8Client.ts`**
   - Arma el payload oficial `EventoEntrada` en camelCase (`eventoId`, `tipo`, `origen: 'M9'`, `ocurridoEn`, `reservaId`, `destinatarios: [{ usuarioId, rol: 'CLIENTE' }]`, `detalle: { origen, destino, fechaProgramada, zonaHoraria, tipoVehiculo, motivo, importe }`).
   - Publica en RabbitMQ (`reservas.events`, `RNF-10`) **y** entrega el evento a `POST /api/v1/eventos` (con idempotencia por `eventoId`), ya que el consumer AMQP actual de M8-G10 solo escucha `trip.completed` de M6. Ante cualquier fallo de M8, el error se registra como warning y la reserva continúa normalmente.
6. **Tests unitarios actualizados:** `m4Client.test.ts`, `m5Client.test.ts`, `m7Client.test.ts`, `rabbitPublisher.test.ts` y `httpClient.test.ts`.
   - **Resultado:** `npm run build` sin errores y **`16/16` suites, `117/117` tests en verde**.

---

## 5. Prueba real de integración en local (6 módulos reales juntos)

En una carpeta local fuera del repositorio (`Pruebas-Integracion/`, sin modificar ninguna línea de los 5 repos ajenos) se levantaron **15 contenedores simultáneos** con `docker-compose.pruebas.yml`:
- **6 servicios reales:** M2-G1 (`:8082`), M4-G14 (`:8084`), M5-G4 (`:8085`), M7-G6 (`:8087`), M8-G10 (`:8088`), M9-G8 (`:8089`).
- **Infraestructura real:** 4x PostgreSQL (M4, M7, M8, M9), MongoDB 7 (M2), MySQL 8 (M5), Redis 7, RabbitMQ 3 (`:15672`), Mailpit (`:8025`) y `jwks-mock` (`:8080`).

### Evidencia obtenida en vivo (28/11/2026)
1. **Salud de los 6 módulos + Auth:** todos respondieron `HTTP 200` (`/health` y `/health/ready`).
2. **Seeds reales:**
   - Cliente activo (`11111111-1111-4111-8111-111111111111`) y cliente bloqueado (`22222222-2222-4222-8222-222222222222`) creados en M2-G1 (`HTTP 201`).
   - Reglas activas de tarifa `auto` y `moto` creadas en M7-G6 (`HTTP 201`).
3. **Flujo completo `POST /reservas` (`M9 → M2 + M4 + M7 + M8`):**
   - Respuesta: **`HTTP 201` en `215 ms`** con `Location: /reservas/045fb63a-b7fb-4458-8960-a0952b841d23`, `estado: "CONFIRMADA"` y `tarifaEstimada: 5120 ARS` (calculada realmente por M7-G6 a partir de los `6.8 km / 18 min` devueltos por M4-G14).
   - **M8-G10 + Mailpit:** llegó el email HTML real *"Reserva de viaje confirmada"* a `http://localhost:8025/` con el trayecto (`French 414, Resistencia, Chaco -> Terminal de Ómnibus, Resistencia`) e importe `ARS 5120`.
4. **Activación real e idempotencia (`M9 → M5 → M2/M4`):**
   - 1er `POST /reservas/045fb63a-.../activar` (con JWT `OPERADOR`): **`HTTP 200` en `151 ms`**, M5-G4 persistió la solicitud en su MySQL y devolvió `solicitudDespachoId: "22c5b159-3558-4f73-a81f-ace67f39e602"`.
   - 2do `POST /reservas/045fb63a-.../activar` repetido: **`HTTP 200` en `39 ms`**, devolviendo exactamente el mismo `solicitudDespachoId` y sin duplicar la solicitud en M5 (`RF-9.10` / `RNF-08`).

### Notas importantes para la integración final de la cátedra (Keycloak M1 + módulos ajenos)
- **Orden de roles para M8-G10:** su utilidad `parseAndAuthorizeJwt` lee únicamente `payload.roles[0]` y exige `SERVICIO`. Al emitir tokens M2M en Keycloak M1, conviene asegurar que `SERVICIO` figure como rol principal (o avisar a G10 para que busque en todo el array de roles).
- **Cancelación tardía en M7-G6:** hasta el commit probado hoy (`2026-06-TPI`), M7-G6 implementó el router de `tarifas` (`/api/v1/tarifas/estimaciones` anda 100%), pero todavía no subió el router de `POST /api/v1/cargos-cancelacion` (por lo que una cancelación tardía recibe `404` de M7 hasta que G6 lo publique). Nuestro cliente M7 ya está listo para ese endpoint tal cual figura en `openapi-g6.yml`.
- **Issuer compartido en M5-G4:** M5 valida `iss` igual a `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` y exige que el token de M9 traiga el rol `SERVICIO` o `reservas-be`.
