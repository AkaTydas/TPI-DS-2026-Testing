# Plan de Distribución de Tareas — Entrega 2 (TP2)
## Módulo 9: Reservas de Viajes (Grupo 8) — UTN FRRe 2026

Este documento define la asignación formal de responsabilidades para la **Entrega 2 (TP2)** del Trabajo Práctico Integrador, basada en los requerimientos no funcionales (RNF) y funcionales (RF) establecidos en el `README.md` oficial de la cátedra.

---

### Resumen Ejecutivo de Asignación

| # | Integrante | Rol en TP2 | Requerimientos Clave | Área Técnica |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Gabilan** | Seguridad & Autenticación | **RNF-12 / RF-1.6** | Keycloak, OIDC, JWT con JWKS / RS256 |
| **2** | **Abril** | Observabilidad & Diagnóstico | **RNF-14 / RNF-19** | Logs estructurados JSON (Pino/Winston) y Métricas Prometheus |
| **3** | **Luna** | Persistencia & Base de Datos | **RNF-05 (TP2)** | Capa de ORM (TypeORM / Prisma) y Migraciones SQL |
| **4** | **Forge (Jorge)** | Resiliencia & Conectividad | **RNF-13** | Circuit Breakers (Opossum) y Backoff Exponencial en Clientes |
| **5** | **Kiara** | Performance & Estado Efímero | **RNF-11** | Caché Distribuido con Redis (Tarifas M7 y Lecturas con TTL) |
| **6** | **Prog. por Hobby** | Estándares API & REST | **DS-04 / RF-9.1** | Header `Location` (201) y Paginación `page`/`size` en `GET /reservas` |
| **7** | **Enana** | Mensajería Asíncrona | **RNF-10 / RF-8.8** | RabbitMQ (Productor de eventos de ciclo de vida hacia M8) |
| **8** | **Agustin 2** | Concurrencia Distribuida | **RNF-08 / RNF-09** | Locks Distribuidos en Redis (Redlock) para Scheduler Multirréplica |
| **—** | **Pablo (ArchTydas)** | Lead de Arquitectura & CI/CD | **RNF-03 / RNF-17** | Contratos OpenAPI 3.1.0, GitHub Actions CI/CD y Code Review |
| **—** | **Teo (tutuca lopez)**| QA Lead & Testing Distribuido | **RNF-07 (TP2)** | Suite de Pruebas de Integración con RabbitMQ y Redis en Docker |

---

## Detalle de Tareas por Integrante

### 1. Gabilan — Autenticación Centralizada con Keycloak (RNF-12 / RF-1.6)
* **Integración con Keycloak de la Cátedra:** Migrar la verificación de JWT en `src/middlewares/auth.ts` para validar tokens emitidos por el servidor oficial de Keycloak (M1) mediante claves públicas asimétricas RS256 / JWKS (reemplazando el secreto local simétrico `HS256`).
* **Variables de Entorno y Configuración OIDC:** Configurar en `env.ts` y `.env.example` los parámetros de conexión (`KEYCLOAK_URL`, `REALM`, `CLIENT_ID`) y lectura de JWKS remotos con caché de claves públicas.
* **Mapeo de Roles OIDC:** Adaptar la extracción de roles para interpretar tanto los claims estándar como las estructuras de Keycloak (`realm_access.roles` y `resource_access`).

---

### 2. Abril — Observabilidad, Logs Estructurados y Métricas (RNF-14 / RNF-19)
* **Logger Estructurado JSON:** Reemplazar los `console.log` por un logger estructurado en formato JSON (usando `pino` o `winston`) que inyecte automáticamente timestamp ISO, nivel de severidad y correlación con `X-Request-Id`.
* **Métricas para Prometheus:** Implementar el endpoint `GET /metrics` con la librería `prom-client` para exponer métricas de negocio (reservas creadas, confirmadas, activadas, canceladas) y métricas de infraestructura (latencia y códigos de estado HTTP).
* **Healthcheck Profundo:** Ampliar `GET /health` para que no solo verifique la base de datos, sino también la disponibilidad de Redis y RabbitMQ.

---

### 3. Luna — Persistencia, ORM y Migraciones (RNF-05 TP2)
* **Capa de ORM (Prisma o TypeORM):** Configurar el ORM en el proyecto para reemplazar las consultas SQL directas de `pg` por modelos fuertemente tipados.
* **Mapeo de Entidades:** Mapear las tablas existentes (`reservas`, `registro_idempotencia` e `historial_reservas`) con sus relaciones, índices y tipos de datos.
* **Migraciones Versionadas:** Crear el pipeline de migraciones automatizadas para que la base de datos se inicialice y actualice sin necesidad de ejecutar scripts SQL manuales.

---

### 4. Forge (Jorge) — Resiliencia y Circuit Breakers (RNF-13)
* **Patrón Circuit Breaker:** Implementar Circuit Breakers utilizando la librería `opossum` en el cliente HTTP central (`src/clients/httpClient.ts`) para proteger las llamadas a M2, M4, M5 y M7.
* **Configuración de Umbrales:** Definir tiempos de timeout (2s), umbral de porcentaje de fallos para abrir el circuito y período de enfriamiento para reintentos en estado semiabierto.
* **Reintentos con Backoff Exponencial:** Implementar reintentos progresivos ante errores transitorios de red antes de declarar el servicio no disponible (`503`).

---

### 5. Kiara — Caché Distribuido con Redis (RNF-11)
* **Cliente de Caché Redis:** Integrar la librería `ioredis` y configurar la conexión al contenedor de Redis con manejo de reconexiones automáticas.
* **Caché de Cotizaciones de Tarifas:** Cachear las respuestas de estimación de M7 con TTL configurable (ej. 10 minutos) para evitar llamadas redundantes ante mismos orígenes y destinos.
* **Invalidación y Caché de Reservas:** Cachear las consultas frecuentes de reservas (`GET /reservas/:id`), asegurando su invalidación inmediata cuando la reserva cambie de estado (modificación, cancelación o activación).

---

### 6. Programador por Hobby — Buenas Prácticas REST y Paginación (DS-04 / RF-9.1)
* **Header `Location` (DS-04):** Agregar la cabecera `Location: /reservas/{id}` en las respuestas HTTP `201 Created` en `ReservationController.crear`.
* **Paginación en `GET /reservas`:** Implementar los parámetros de consulta `page` y `size` en el controlador y repositorio, devolviendo la estructura estándar de paginación (`total`, `page`, `pageSize`, `totalPages`, `data`).
* **Documentación y Esquemas Zod:** Actualizar los esquemas Zod y el contrato `openapi.yaml` para reflejar los nuevos parámetros de paginación.

---

### 7. Enana — Mensajería Asíncrona con RabbitMQ (RNF-10 / RF-8.8 / RF-9.8)
* **Integración con RabbitMQ:** Integrar la librería `amqplib` y configurar la conexión al broker de mensajería (RabbitMQ) con reintentos.
* **Productor de Eventos de Ciclo de Vida:** Publicar los eventos (`RESERVA_CREADA`, `RESERVA_CONFIRMADA`, `RESERVA_CANCELADA`, `RESERVA_ACTIVADA`) al exchange correspondiente de la cátedra para desacoplar el envío de avisos hacia M8.
* **Recordatorios M8 (RF-9.8):** Apenas la cátedra confirme el formato de M8, implementar la ruta `POST /reservas/:id/recordatorio` y disparar el evento `RESERVA_RECORDATORIO` a la cola.

---

### 8. Agustin 2 — Concurrencia Distribuida y Bloqueos en Redis (RNF-08 / RNF-09 / RF-9.9)
* **Bloqueos Distribuidos (Redlock):** Implementar cerrojos distribuidos con Redis (`SETNX` / `redlock`) en la activación de reservas y en el `ReservationScheduler`.
* **Scheduler Multicontenedor Seguro:** Garantizar que si M9 corre escalado en 2 o más réplicas en Docker, solo una instancia adquiera el lock y dispare la orden de despacho a M5 a los 20 minutos.
* **Idempotencia Atómica en Caché:** Validar las claves de idempotencia en Redis antes de golpear la base de datos relacional para evitar condiciones de carrera simultáneas en el mismo milisegundo.

---

## Roles de Coordinación, Calidad y CI/CD

### Pablo (ArchTydas) — Lead de Arquitectura & Integrador
* Mantenimiento de la especificación OpenAPI 3.1.0 e interoperabilidad con Grupo 9 y el consorcio.
* Configuración del pipeline de CI/CD en GitHub Actions (`.github/workflows/ci.yml`) para ejecutar compilación y pruebas automatizadas en cada Pull Request.
* Orquestación de `docker-compose.yml` para levantar en conjunto M9, PostgreSQL, Redis y RabbitMQ.
* Code Review de los Pull Requests y merges a la rama `main`.

### Teo (tutuca lopez) — QA Lead & Testing Distribuido (RNF-07)
* Mantenimiento de la suite base de Jest (mantener los 49 tests existentes en verde).
* Creación de la suite de pruebas de integración para TP2 simulando RabbitMQ y Redis levantados en Docker.
* Validación del entorno multicontenedor local antes de cada hito de entrega.

