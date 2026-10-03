# Módulo 9: Reservas de Viajes (TPI 2026 - UTN FRRe)
## Grupo 8 - Entrega de Base de Datos y Contenedores

Este repositorio contiene la arquitectura de persistencia, scripts DDL, datos semilla, consultas de validación y la configuración de Docker Compose para el **Módulo 9 (Reservas de Viajes)** de la plataforma de movilidad bajo demanda.

---

## 1. ¿Qué herramientas necesitas tener instaladas?

Para trabajar con este proyecto y ejecutar la base de datos en Docker, necesitas:

1. **Docker Desktop para Windows**:
   - [Descargar Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - Durante la instalación, asegurarse de marcar la opción **"Use WSL 2 instead of Hyper-V"** (recomendado para Windows 10/11).
   - Una vez instalado, abrir Docker Desktop y verificar que la ballenita esté en verde ("Engine running").
2. **Cliente de Base de Datos (Opcional pero muy recomendado)**:
   - Para conectarte visualmente a PostgreSQL podes usar cualquiera de estos:
     - **DBeaver Community** (muy liviano y profesional): [dbeaver.io](https://dbeaver.io/)
     - **pgAdmin 4** (ya viene incluido en nuestro `docker-compose.yml` para abrirlo desde el navegador en `http://localhost:5050`).
     - **Visual Studio Code** con la extensión *"PostgreSQL"* (de Chris Kolkman).

> [!NOTE]
> **Detalle sobre tu computadora:**
> Detectamos que ya tenés el servicio de PostgreSQL 18 instalado y corriendo de forma nativa en tu Windows escuchando en el puerto `5432`.
> Por este motivo, **configuramos Docker para que se conecte al puerto `5433`** en tu máquina host. De esta manera, no habrá colisión de puertos entre tu PostgreSQL local y el contenedor Docker.

---

## 2. Estructura de Archivos del Proyecto

```text
tpi-modulo-9-reservas/
├── .env                # Variables de entorno (puertos, usuarios, contraseñas)
├── docker-compose.yml  # Configuración del contenedor PostgreSQL y pgAdmin
├── 01-schema.sql       # DDL: Creación de tablas, ENUMs, índices y triggers
├── 02-seed.sql         # Datos de prueba con reservas en todos los estados del ciclo de vida
├── 03-queries.sql      # Consultas SQL clave para verificar y demostrar requerimientos
└── README.md           # Explicación completa técnica y funcional
```

---

## 3. ¿Cómo levantar el proyecto con Docker?

Una vez instalado Docker Desktop, abrí una terminal (PowerShell o CMD) en esta carpeta y ejecutá:

```powershell
docker compose up -d
```

### ¿Qué hace este comando automáticamente?
1. Descarga la imagen oficial de **PostgreSQL 16 Alpine** (ultraliviana y rápida).
2. Ejecuta automáticamente los scripts en orden:
   - `01-schema.sql` (crea la estructura).
   - `02-seed.sql` (inserta datos de demostración).
3. Levanta **pgAdmin 4** en la web.

### Credenciales de Conexión a la Base de Datos:
* **Host:** `localhost`
* **Puerto:** `5433` *(mapeado al 5432 interno del contenedor)*
* **Database:** `reservations_db`
* **Usuario:** `reservations_user`
* **Contraseña:** `reservations_pass`

### Acceso a pgAdmin Web:
* **URL:** [http://localhost:5050](http://localhost:5050)
* **Email:** `admin@frre.utn.edu.ar`
* **Password:** `admin`

Para detener los contenedores:
```powershell
docker compose down
```

---

## 4. Arquitectura de la Base de Datos y Decisiones de Diseño

### Cumplimiento del Principio de Microservicios (RNF-05 - Propiedad de Datos)
El enunciado estipula:
> *"Cada servicio controlará su persistencia. Quedará prohibido consultar directamente tablas de otro módulo."*

Por esta razón:
- La tabla `reservations` guarda `customer_id UUID`, pero **NO tiene una Foreign Key (FK)** hacia una supuesta tabla de clientes. La identidad del cliente pertenece a **M2 (Clientes)**.
- El campo `dispatch_request_id UUID` guarda la referencia devuelta por **M5 (Solicitud y Despacho)** sin FK cruzada.

---

### Tablas y Mapeo con Requerimientos Funcionales

| Tabla | Responsabilidad | Requerimientos cubiertos |
|---|---|---|
| **`reservations`** | Almacena los viajes planificados, coordenadas, estados, tarifas y metadatos de despacho. | **RF-9.1** (Crear reserva)<br>**RF-9.2** (Ventana de anticipación)<br>**RF-9.3** (Validación de datos)<br>**RF-9.4** (Estimación y condiciones)<br>**RF-9.5** (Confirmación)<br>**RF-9.6** (Modificación)<br>**RF-9.7** (Cancelación)<br>**RF-9.9** (Activación en despacho)<br>**RF-9.10** (Idempotencia)<br>**RF-9.11** (Expiración) |
| **`reservation_status_history`** | Historial **no destructivo** que audita cada transición de estado con fecha, rol del actor y motivo. | **RF-9.12** (Historial y trazabilidad) |
| **`reservation_reminders`** | Agenda los recordatorios que deben enviarse al cliente vía M8 (Notificaciones) antes del viaje. | **RF-9.8** (Recordatorios configurables) |
| **`system_parameters`** | Parámetros globales del módulo (anticipación mínima/máxima, ventana de activación, tiempo de cancelación gratuita). | **RF-9.2, RF-9.4, RF-9.9** (Reglas de negocio desacopladas del código) |

---

### Detalles Técnicos Destacados

1. **Tipos Enumerados (`ENUM`):**
   - `reservation_status_enum`: Maneja el ciclo de vida (`PENDING`, `CONFIRMED`, `ACTIVATING`, `ACTIVATED`, `COMPLETED`, `CANCELLED_BY_CLIENT`, `CANCELLED_BY_OPERATOR`, `EXPIRED_NO_DRIVERS`, `REJECTED`).
   - `vehicle_type_enum`: `AUTO`, `MOTO`.
   - `actor_role_enum`: `CUSTOMER`, `OPERATOR`, `SYSTEM`.

2. **Idempotencia Garantizada (RF-9.10 / RNF-08 / RNF-09):**
   - El campo `activation_idempotency_key UUID UNIQUE` asegura que, ante caídas de red, reinicios del cron o reintentos, **nunca se envíe una doble orden de despacho a M5**.

3. **Índices Parciales (Performance RNF-16):**
   - En lugar de indexar toda la tabla para el scheduler, creamos un índice parcial:
     ```sql
     CREATE INDEX idx_reservations_pending_activation ON reservations(scheduled_at) 
     WHERE status = 'CONFIRMED';
     ```
     Esto hace que el cron que consulta las reservas cada 30 segundos solo revise las filas confirmadas pendientes, sin degradar la base de datos a medida que crezca el historial.

4. **Triggers Automáticos de Auditoría:**
   - Cada vez que una reserva cambia de estado (`status`), la función `fn_log_reservation_status()` inserta automáticamente un registro en `reservation_status_history` sin necesidad de que el programador backend tenga que recordarlo manualmente en su código.

---

## 5. Datos Semilla y Consultas de Demostración

El archivo `02-seed.sql` precarga casos reales:
1. **Reserva para mañana (`CONFIRMED`):** viaje UTN FRRe ➔ Aeropuerto de Resistencia en AUTO.
2. **Reserva lista para activar en 10 min (`CONFIRMED`):** Plaza 25 de Mayo ➔ Shopping en MOTO.
3. **Reserva ya activada (`ACTIVATED`):** Viaje con `dispatch_request_id` vinculado a M5.
4. **Reserva cancelada (`CANCELLED_BY_CLIENT`):** Con motivo de cancelación y penalidad aplicada.
5. **Reserva expirada (`EXPIRED_NO_DRIVERS`):** M5 no encontró conductores a tiempo.

En `03-queries.sql` podes probar:
- **Consulta 1:** Simula el Scheduler que busca las reservas que deben despacharse en los próximos 15 minutos.
- **Consulta 2:** Trae los recordatorios pendientes de envío.
- **Consulta 3:** Muestra la línea de tiempo de auditoría de un viaje.
- **Consulta 4:** Muestra el historial de reservas de un cliente.
- **Consulta 5:** Métricas para tablero de control de operadores.

---

## 6. ¿Cómo ejecutarlo en tu PostgreSQL Local si no tenés Docker aún?

Si querés probarlo de inmediato antes de instalar Docker:
1. Abrí tu cliente SQL (pgAdmin, DBeaver o consola `psql`).
2. Conectate a tu PostgreSQL local (puerto `5432`).
3. Creá una base de datos vacía:
   ```sql
   CREATE DATABASE reservations_db;
   ```
4. Ejecutá en esa base de datos el contenido de `01-schema.sql` y luego `02-seed.sql`.
5. Ejecutá las consultas de `03-queries.sql` para comprobar el funcionamiento.

---

## 7. Reparto de los 10 Integrantes del Grupo 8 para esta Entrega

Para la defensa de esta entrega ante la cátedra, cada integrante debe dominar su parte:

* **Dupla 1 (Diagrama ER y Diccionario):** Explica el modelo relacional, tipos de datos y justificación de RNF-05 (por qué no hay FK a otros módulos).
* **Dupla 2 (Script DDL y Constraints):** Explica las claves primarias (UUIDs), ENUMs y constraints de chequeo (`CHECK` de coordenadas y coherencia de fechas).
* **Dupla 3 (Triggers e Idempotencia):** Explica el trigger de auditoría automática y la clave de idempotencia (`activation_idempotency_key`) para evitar dobles viajes.
* **Dupla 4 (Datos Semilla y Casos de Uso):** Corre en vivo las consultas de `03-queries.sql` demostrando que el esquema soporta el ciclo de vida completo.
* **Dupla 5 (Docker y Despliegue):** Muestra cómo levantar los contenedores con `docker compose up` y la conexión con pgAdmin.
