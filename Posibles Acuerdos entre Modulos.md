# Acuerdos y Convenciones de Integración - Módulo 9: Reservas de Viajes
**Grupo 8 (M9) - Cátedra Desarrollo de Software 2026 (UTN FRRe)**

---

## 1. Respuesta al Grupo 17 (M2 Clientes)
*(Texto listo para copiar y pegar en su Pull Request o canal de comunicación)*

---

> **Hola Grupo 17 (M2 Clientes). Les respondemos desde el Grupo 8 (M9 - Reservas de Viajes):**
>
> ### 1. Validación de cliente habilitado (RF-9.3)
> **Sí, nos sirve perfectamente el endpoint `GET /api/v1/clientes/{clienteId}/estado-cuenta`.**
> - Cuando un cliente intenta crear una reserva (`RF-9.1`) o reprogramarla (`RF-9.6`), M9 llamará a este endpoint.
> - Si el estado es `ACTIVO`, permitimos avanzar con el flujo.
> - Si devuelve `BLOQUEADO`, M9 rechaza la solicitud de reserva devolviendo un error semántico `422 Unprocessable Entity` con RFC 7807 (`code: CLIENT_STATUS_BLOCKED`).
>
> ### 2. Direcciones frecuentes del cliente
> **No, M9 no consume las direcciones frecuentes de M2 en el backend.**
> - Por el principio de **Propiedad de Datos (RNF-05)** y separación de responsabilidades, la selección de direcciones favoritas es una funcionalidad puramente de experiencia de usuario en el Frontend/App del cliente.
> - La App consulta las direcciones a M2 y, al momento de emitir la reserva a M9 (`POST /api/v1/reservas`), nos envía directamente el texto descriptivo de la dirección y las coordenadas geográficas (`pickup_latitude`, `pickup_longitude`, `dropoff_latitude`, `dropoff_longitude`). De este modo, M9 se mantiene desacoplado de las tablas internas de M2.
>
> ### 3. Credenciales para la activación programada (Worker / Scheduler)
> - **Aclaración de arquitectura:** Al momento de la activación (`RF-9.9`), M9 **no necesita llamar a M2**, sino a **M5 (Solicitud y Despacho)** para enviar la solicitud de viaje y a **M8 (Notificaciones)** para emitir el aviso al cliente. La validación del cliente contra M2 ya se realizó previamente al crear o confirmar la reserva.
> - **Credencial M2M:** Coincidimos 100% con la propuesta común: para cualquier llamada en segundo plano (workers, schedulers, cron jobs) donde no haya un usuario interactivo, utilizaremos un token JWT con rol **`SERVICIO`** (Machine-to-Machine) con `sub: "modulo-reservas-m9"`.
>
> ### 4. Aceptación de convenciones generales:
> - **Puerto de M9:** Confirmamos el puerto **`8089`** (siguiendo la regla `8080 + 9`).
> - **Healthcheck:** Implementamos `GET /health` sin token (200 UP / 503 DOWN).
> - **Errores:** Adherimos a RFC 7807 `application/problem+json`.
> - **Trazabilidad:** Recibimos, propagamos y devolvemos el header **`X-Request-Id`**.
> - **Tipos de vehículo:** Unificamos en **`AUTO`** y **`MOTO`** (definidos de idéntica forma en nuestra base de datos).
> - **Timeouts y resiliencia:** Aceptamos el timeout de 2 s por intento con 1 reintento para consultas GET idempotentes.

---

## 2. Lo que M9 necesita de los demás módulos

Para cumplir con los requerimientos funcionales de M9, definimos formalmente lo que necesitamos de cada módulo colaborador:

### A. De M2 (Clientes)
- **`GET /api/v1/clientes/{clienteId}/estado-cuenta`**:
  - Necesario para **RF-9.3** (validar cliente habilitado antes de reservar).
  - Esperamos: `{ "estado": "ACTIVO" | "BLOQUEADO", "motivos_bloqueo": [...] }`.

### B. De M4 (Ubicación y Disponibilidad)
- **`POST /api/v1/ubicacion/cobertura`** o **`GET /api/v1/ubicacion/distancia-tiempo`**:
  - Necesario para **RF-9.3** y **RF-4.6**: Validar si el origen y destino se encuentran dentro del área de cobertura operativa.
  - Calcular la distancia en kilómetros y el tiempo estimado (ETA) entre origen y destino, datos requeridos para calcular la tarifa en M7.

### C. De M7 (Tarifas, Pagos y Liquidaciones)
- **`POST /api/v1/tarifas/estimar`**:
  - Necesario para **RF-9.4**: Obtener la estimación de tarifa con base en: `vehicle_type` (AUTO/MOTO), `distancia_km`, `duracion_minutos` y horario programado.
- **`POST /api/v1/tarifas/cargo-cancelacion`**:
  - Necesario para **RF-9.7** y **RF-7.4**: Calcular y registrar si aplica cargo al cliente ante una cancelación fuera de la ventana gratuita.

### D. De M5 (Solicitud y Despacho)
- **`POST /api/v1/despacho/solicitudes`** (Activación de Reserva - **RF-9.9** y **RF-5.2**):
  - M9 llama a M5 cuando faltan `X` minutos para el viaje (parámetro configurable `activation_window_minutes = 15`).
  - **Parámetros enviados:**
    - `reserva_id`: UUID de la reserva en M9.
    - `idempotency_key`: Clave de idempotencia única para garantizar que **como máximo una solicitud de despacho sea creada** ante reintentos de red (**RF-9.10, RF-5.2**).
    - `customer_id`, `vehicle_type`, origen y destino con coordenadas.
  - **Respuesta esperada:**
    - `dispatch_request_id`: UUID de la solicitud creada en M5 para enlazarla con la reserva.
- **Evento / Callback de Despacho (RF-9.11, RF-5.8):**
  - M5 debe notificar si no hubo conductores disponibles (`EXPIRED_NO_DRIVERS`) para que M9 actualice el estado a expirado.

### E. De M8 (Notificaciones, Documentos y Soporte)
- **`POST /api/v1/notificaciones/recordatorios`** (o vía cola de mensajería RabbitMQ en TP2):
  - Necesario para **RF-9.8** y **RF-8.2**: Notificar al cliente al crearse la reserva, al modificarse, al cancelarse y al emitir recordatorios (60 minutos y 15 minutos antes).
  - Parámetros: `customer_id`, `tipo_evento` (`RESERVA_CONFIRMADA`, `RECORDATORIO_VIAJE`, `RESERVA_ACTIVADA`, `RESERVA_CANCELADA`), datos del viaje.

---

## 3. Matriz de Convenciones Técnicas de M9

| Concepto | Convención Acordada | Justificación |
|---|---|---|
| **Puerto del Servicio** | `8089` | Regla del consorcio: `8080 + número_modulo` |
| **Formato de Contrato** | OpenAPI 3.0.3 (`openapi.yaml`) | RNF-03 |
| **Base de Datos** | PostgreSQL 16 (puerto `5432` / `5433`) | RNF-05 (persistencia propia aislada) |
| **Identificadores** | UUID v4 | RNF-05 y consistencia distribuida |
| **Formato de Errores** | RFC 7807 (`application/problem+json`) | Estándar de la industria adoptado por el consorcio |
| **Trazabilidad** | `X-Request-Id` | RNF-14 (logs estructurados y correlación) |
| **Tipos de Vehículo** | `AUTO`, `MOTO` | Definición de dominio unificada |
| **Manejo de Tiempos** | ISO 8601 con zona horaria (`TIMESTAMPTZ`) | Evitar discrepancias horarias en reservas futuras |
| **Idempotencia** | `activation_idempotency_key` | RNF-08, RNF-09, RF-9.10 (evitar doble despacho) |
