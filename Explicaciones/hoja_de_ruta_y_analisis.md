# Guía Estratégica: Hoja de Ruta, Análisis de API y Estudio Previo (M9 - Reservas)

Documento resumen para entender la arquitectura actual, los contratos entre grupos y el plan de trabajo paso a paso para completar el Módulo 9.

---

## 1. El Contexto General del TPI: TP1 vs. TP2

Para no mezclar alcances, es fundamental tener clara la división de la cátedra:

* **TP1 (Donde estamos ahora):**
  * Arquitectura base y modularidad (Node.js + TypeScript + Express + PostgreSQL).
  * Contrato OpenAPI consensuado con el grupo gemelo (Grupo 9).
  * Dockerización básica (`Dockerfile` y `docker-compose.yml`).
  * Validación de reglas de negocio (`RF-9.1` a `RF-9.12`) y tests automatizados locales (Jest).
* **TP2 (Siguiente entrega — NO se programa ahora):**
  * Integración con **RabbitMQ** para mensajería asíncrona (reemplaza llamadas HTTP directas a M8).
  * Integración con **Redis** para caché de idempotencia con TTL y bloqueos de concurrencia.
  * Pruebas de integración distribuida entre contenedores reales de distintos grupos.
  * Pipeline de CI/CD en GitHub Actions.

> **Objetivo actual:** Estabilizar y alinear la API de TP1 para que cuando arranque el TP2 no arrastremos deuda técnica ni incompatibilidades.

---

## 2. Radiografía de APIs: Grupo 8 vs. Grupo Gemelo (Grupo 9)

Ambos módulos deben ser **100% intercambiables**. Al comparar nuestro contrato con el de Grupo 9 (`Contexto/openapi.yaml`), encontramos los mismos endpoints base pero con diferencias de formato:

| Aspecto | Nuestro Código (Grupo 8) | Grupo Gemelo (Grupo 9) | Cómo se resuelve |
| :--- | :--- | :--- | :--- |
| **Formato de Errores** | RFC 7807 (`{ type, title, status, detail }`) | `{ codigo, mensaje, detalle }` (ej: `codigo: "NO_ENCONTRADA"`) | **Vía Middleware:** Modificar únicamente `errorHandler.ts` para que transforme cualquier error saliente al formato de G9 sin tocar el resto del código. |
| **Respuesta de `POST /reservas`** | Retorna la entidad `Reserva` directa. | Retorna un wrapper `RespuestaCreacion`: `{ mensaje, motivo, reserva, condiciones }` | **En Controlador:** Ajustar 5 líneas en `reservationController.ts` al responder `201`. |
| **Respuesta de `POST /reservas/:id/activar`** | Retorna resumen: `{ reservaId, solicitudId, estado, mensaje }` | Retorna la `Reserva` completa con `solicitudDespachoId`. | **En Controlador:** Ajustar la respuesta en `activationController.ts`. |
| **Nombres de Atributos** | Masculinos: `creadoEn`, `actualizadoEn`. | Femeninos: `creadaEn`, `modificadaEn`. | **En DTO / Mapper:** Mapear los nombres al armar el JSON de salida sin alterar la base de datos PostgreSQL. |
| **Ubicación de Entrada** | Objeto estructurado obligatorio: `{ direccion, latitud, longitud }`. | Admite objeto `Direccion` O un texto simple (ej: `"UTN"` con geocodificación simulada). | **En Schema Zod:** Flexibilizar la validación en el controller para aceptar strings. |
| **Historial (`GET /reservas/:id/historial`)** | Eventos genéricos con JSONB (`detalles`). | Campos específicos: `tipoCambio`, `campoModificado`, `valorAnterior`, `valorNuevo`, `actorId`, `rolActor`, `fechaCambio`. | **En Mapper:** Adaptar la transformación de datos en `historyRepository.ts`. |

---

## 3. Hoja de Ruta de Trabajo en 3 Fases

Estimación total de trabajo: **2 a 3 horas** trabajando tranquilos y verificando cada cambio.

```
┌────────────────────────────────────────────────────────┐
│  FASE 1: Lógica Interna Previa (20-30 min)             │
│  (No toca la API externa, no genera conflictos)        │
├────────────────────────────────────────────────────────┤
│  FASE 2: Transición de Contrato y Formatos (1-2 hs)    │
│  (Middleware de errores, wrapper de creación y DTOs)   │
├────────────────────────────────────────────────────────┤
│  FASE 3: Automatización y Verificación (30-45 min)     │
│  (Scheduler en background y validación con Jest)       │
└────────────────────────────────────────────────────────┘
```

### Fase 1: Lógica Interna Previa (Se puede hacer ya, no interfiere con la API)
1. **Permiso de Rol `CONDUCTOR` en `GET /reservas/:id`:**
   * *Problema:* La ruta admite el rol pero `reservationService.ts` lanza `403` si no es admin o el cliente dueño.
   * *Solución:* Sumar `user.roles.includes('CONDUCTOR')` a la condición de acceso permitido.
2. **Fallback silencioso en Clientes HTTP (`m2Client`, `m4Client`, `m5Client`, `m7Client`):**
   * *Problema:* Cuando `USE_EXTERNAL_MOCKS=false` y un servicio externo falla o da timeout, el `catch` devuelve mocks simulados en lugar de fallar explícitamente.
   * *Solución:* Lanzar `AppError(503)` cumpliendo la regla de dominio "sin bloqueos ni fallas silenciosas".

### Fase 2: Transición de Contrato y Formatos (La adaptación al Grupo 9)
1. **Middleware de Errores:** Actualizar `src/middlewares/errorHandler.ts` para responder siempre con `{ codigo, mensaje, detalle }`.
2. **Wrapper de Creación:** Modificar `ReservationController.crear` para devolver `{ mensaje, motivo, reserva, condiciones }`.
3. **Mappers de Salida:** Ajustar los nombres de fecha a `creadaEn` / `modificadaEn` y el formato del historial.
4. **Reemplazo del `.yaml`:** Adoptar formalmente el `openapi.yaml` de Grupo 9 en la raíz.

### Fase 3: Automatización y Verificación
1. **Scheduler de Activación Automática (`RF-9.9`):** Crear `ReservationScheduler` que revise periódicamente reservas confirmadas próximas a su hora y llame a activación sin requerir un trigger manual.
2. **Verificación de Tests:** Actualizar las aserciones en los 35 tests de Jest para que validen contra los nuevos formatos de respuesta y vuelvan a quedar todos en verde (`npm test`).

---

## 4. Dónde Estudiar y Leer el Código ("La ArchWiki del Proyecto")

Para entender la base antes de programar, los recursos clave dentro del repositorio son:

### A. Documentación Local (Nivel "Wiki")
1. **`Contexto/analisis_grupo8_m9.html` (Abrir en navegador):**
   * *Pestaña 2:* Máquina de estados (PENDIENTE, CONFIRMADA, ACTIVADA, CANCELADA, VENCIDA) y los 12 RF.
   * *Pestaña 3:* Explicación carpeta por carpeta de los 33 archivos del proyecto.
   * *Pestaña 4:* Estructura de la base de datos PostgreSQL (tablas `reservas`, `historial_reservas`, `registro_idempotencia`).
   * *Pestaña 5:* Los 10 endpoints con ejemplos de JSON de entrada y salida.
   * *Pestaña 6:* Integración con los otros módulos (M2, M4, M5, M7, M8).
   * *Pestaña 7:* Explicación de los 35 tests automatizados.
2. **`Contexto/plan_accion_grupo8_m9.html`:**
   * Lista detallada de tareas con fragmentos de código "antes vs. después".
3. **`Contexto/README.md`:**
   * La consigna oficial completa de la cátedra con los 20 RNF transversales.

### B. Código Fuente Esencial para Leer Primero
1. **Lógica de negocio principal:** `2026-08-TPI/src/services/reservationService.ts`
2. **Controlador HTTP:** `2026-08-TPI/src/controllers/reservationController.ts`
3. **Manejo de Errores actual:** `2026-08-TPI/src/middlewares/errorHandler.ts`
4. **Consultas SQL:** `2026-08-TPI/src/repositories/reservationRepository.ts`
5. **Esquema de Base de Datos:** `2026-08-TPI/sql/01_init_schema.sql`

