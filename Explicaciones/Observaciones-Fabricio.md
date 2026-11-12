# Observaciones Pendientes de Revisión — Módulo 9 (Reservas de Viajes)

> **Propósito:** Listado de puntos detectados al contrastar el código actual de M9 contra el README general de la cátedra (`FRRe-DS/2026-TPI`) y la arquitectura del grupo, para revisar con el líder de grupo antes de decidir si requieren cambios.

---

## 1. Consistencia en el formato de errores (RNF-03 / RFC 7807)
* **Qué se observó:**
  * [errorHandler.ts](file:///home/fabrialca/2026-08-TPI/src/middlewares/errorHandler.ts) devuelve los errores en formato `{ codigo, mensaje, detalle }` (`Content-Type: application/json`), acorde a [openapi.yaml](file:///home/fabrialca/2026-08-TPI/openapi.yaml).
  * Sin embargo, [README.md](file:///home/fabrialca/2026-08-TPI/README.md#L17) sigue indicando que el formato de errores es RFC 7807 (`application/problem+json`), y [healthController.ts](file:///home/fabrialca/2026-08-TPI/src/controllers/healthController.ts#L14-L21) en caso de error `503` todavía responde con `application/problem+json` (`{ type, title, status, detail, instance }`).
* **Qué consultar al líder:**
  * ¿Se mantiene `{ codigo, mensaje, detalle }` en todo M9 (y se actualiza `README.md` + `healthController.ts` para unificar), o las fallas externas `503` deben responder en formato RFC 7807?

---

## 2. Concurrencia en la activación hacia M5 (RNF-08 / RF-9.10)
* **Qué se observó:**
  * En [activationService.ts](file:///home/fabrialca/2026-08-TPI/src/services/activationService.ts#L35-L77), la verificación de `reserva.solicitudDespachoId` y la actualización posterior en PostgreSQL ocurren en dos consultas separadas sin bloqueo atómico en base de datos (por ejemplo, un `UPDATE ... WHERE id = $1 AND solicitud_despacho_id IS NULL` o `SELECT ... FOR UPDATE`).
  * Si bien enviar `Idempotency-Key` a M5 evita que M5 duplique la solicitud de despacho, dos peticiones simultáneas (`POST /reservas/:id/activar` concurrente con el scheduler) podrían disparar llamadas simultáneas antes de persistir el `solicitud_despacho_id`.
* **Qué consultar al líder:**
  * ¿Vale la pena reforzar esa transición con un bloqueo/update condicional transaccional en PostgreSQL (tal como describe [openapi.yaml](file:///home/fabrialca/2026-08-TPI/openapi.yaml#L326-L330)) para TP2/TP3?

---

## 3. Recordatorios previos al viaje (RF-9.8 / RF-8.2)
* **Qué se observó:**
  * En [reservation.ts](file:///home/fabrialca/2026-08-TPI/src/types/reservation.ts#L10) existe el tipo de evento `RESERVA_RECORDATORIO`.
  * Sin embargo, [schedulerService.ts](file:///home/fabrialca/2026-08-TPI/src/services/schedulerService.ts) actualmente solo busca reservas dentro de los 20 minutos previos para activarlas en M5, pero no tiene lógica para disparar notificaciones de recordatorio hacia M8 antes del viaje.
* **Qué consultar al líder:**
  * ¿Los recordatorios previos (RF-9.8) entran en el alcance de esta entrega o se dejan para una iteración posterior?

---

## 4. Documentación desactualizada en `openapi.yaml`
* **Qué se observó:**
  * En [openapi.yaml](file:///home/fabrialca/2026-08-TPI/openapi.yaml#L20-L21) todavía figura: *"Integraciones: M2 (cliente habilitado), M4 (cobertura y distancia), M7 (tarifa) y M5 (despacho) están simulados por ahora dentro del backend"*.
  * Además, en [openapi.yaml](file:///home/fabrialca/2026-08-TPI/openapi.yaml#L80-L81) se menciona soporte para direcciones en texto con geocodificación simulada, mientras que [reservationController.ts](file:///home/fabrialca/2026-08-TPI/src/controllers/reservationController.ts#L6-L13) exige coordenadas (`latitud` y `longitud`) obligatorias.
* **Qué consultar al líder:**
  * ¿Actualizamos esas descripciones de `openapi.yaml` para que reflejen exactamente el comportamiento actual del backend?

---

## 5. Falta de test de integración end-to-end para respuesta HTTP `503`
* **Qué se observó:**
  * Hay tests unitarios que verifican el lanzamiento de `AppError(503)` en `M2Client`, `M4Client`, `M5Client`, `M7Client` y el Circuit Breaker en `HttpClient`.
  * No existe todavía un test de integración en `tests/integration/` que valide la respuesta HTTP completa saliendo por Express (`errorHandler.ts`) cuando falla una dependencia externa con `USE_EXTERNAL_MOCKS=false`.
* **Qué consultar al líder:**
  * Una vez definido el punto 1 (formato de error definitivo), ¿agregamos ese test de integración en `tests/integration/`?

---

## 6. Externalización de umbrales del Circuit Breaker y timeout HTTP (RNF-06 / RNF-13 / RNF-18)
* **Qué se observó:**
  * En [httpClient.ts](file:///home/fabrialca/2026-08-TPI/src/clients/httpClient.ts#L14-L27), tanto el timeout por intento (`DEFAULT_TIMEOUT_MS = 2000`) como los parámetros de `opossum` (`errorThresholdPercentage: 50`, `volumeThreshold: 5`, `resetTimeout: 15000`, `rollingCountTimeout: 10000`) están definidos de forma fija en el código fuente en lugar de leerse desde [env.ts](file:///home/fabrialca/2026-08-TPI/src/config/env.ts) y documentarse en [.env.example](file:///home/fabrialca/2026-08-TPI/.env.example).
* **Por qué podría ser necesario corregirlo:**
  * Para cumplir con **RNF-06** (configuración externa) y **RNF-18** (portabilidad entre entornos sin modificar código), si durante la integración en Docker o en un despliegue en la nube alguno de los módulos colaboradores tiene mayor latencia o requiere ajustar la tolerancia/enfriamiento del Circuit Breaker, hoy habría que editar el código y recompilar la imagen.
* **Qué consultar al líder:**
  * ¿Dejamos estos umbrales fijos en `httpClient.ts` o los pasamos a variables de entorno opcionales en `env.ts` manteniendo sus valores actuales (`2000`, `50`, `5`, `15000`, `10000`) por defecto?

---

## 7. Política de reintentos en M4 y M7 (y límite en M2/M5) (RNF-09 / RNF-13 / RF-7.6)
* **Estado actual (ya implementado):**
  * [httpClient.ts](file:///home/fabrialca/2026-08-TPI/src/clients/httpClient.ts) ya implementa **backoff exponencial** (`150ms` → `300ms` → `600ms`) y evita reintentar errores `4xx`.
  * [m2Client.ts](file:///home/fabrialca/2026-08-TPI/src/clients/m2Client.ts) y [m5Client.ts](file:///home/fabrialca/2026-08-TPI/src/clients/m5Client.ts) quedaron configurados con `retries: 2` (seguros por ser `GET` en M2 y `POST` con `Idempotency-Key` en M5 según RF-9.10 / RNF-09).
* **Qué queda pendiente de revisar:**
  * [m4Client.ts](file:///home/fabrialca/2026-08-TPI/src/clients/m4Client.ts) (`POST /ubicaciones/validar-estimar`) y [m7Client.ts](file:///home/fabrialca/2026-08-TPI/src/clients/m7Client.ts) (`POST /tarifas/estimar` y `POST /tarifas/cancelacion`) se mantuvieron con `0` reintentos por defecto.
  * Aunque no perjudica dejarlos en `0`, `M4` y `M7 estimar` son cálculos sin efectos secundarios que podrían beneficiarse de `retries: 1` o `2`, mientras que `M7 cancelación` depende de que M7 garantice idempotencia por `reserva_id` (**RF-7.6**), considerando también que con timeouts de `2s` más reintentos aumenta el tiempo total antes del `503`.
* **Qué consultar al líder:**
  * ¿Confirmamos mantener `0` reintentos en `M4` y `M7`, o habilitamos backoff exponencial en `M4` y `M7 estimar` (editando solo 1 línea `retries` en cada cliente)?
  * ¿Confirmamos `retries: 2` como límite máximo en `M2` y `M5`?
