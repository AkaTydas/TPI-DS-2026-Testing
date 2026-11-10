# Explicación Técnica de la Implementación
## Demostración Práctica Integrada: Patrón Saga Orquestado y Database per Service
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo Asignado en el TPI:** M9 (Reservas de Viajes)  

---

## 1. Tecnologías Elegidas y Justificación

| Tecnología | Rol en la Solución | Justificación Técnica |
| :--- | :--- | :--- |
| **Node.js v24 (LTS)** | Runtime de ejecución | Permite alto rendimiento en operaciones de I/O asíncronas para orquestación de servicios y soporte nativo de `node:sqlite`. |
| **TypeScript 5** | Lenguaje tipado | Garantiza contratos inmutables (DTOs) y tipado estricto entre capas y clientes de integración. |
| **Express.js** | Framework Web | Arquitectura limpia basada en middleware, controladores y enrutamiento REST. |
| **SQLite Nativo (`node:sqlite`)** | Persistencia Aislada | Simula el aislamiento físico real mediante 3 archivos de base de datos independientes (`data/m9_reservas.db`, `data/m7_pagos.db`, `data/m5_despacho.db`), sin dependencias de red externas ni compiladores C++. |
| **Docker & Docker Compose** | Contenerización | Permite despliegue reproducible en cualquier entorno con persistencia vinculada a volumen. |

---

## 2. Jerarquía y Estructura de Carpetas

```text
demo-investigacion-grupo8/
├── data/                                 # Almacenamiento físico de las 3 bases de datos aisladas
│   ├── m9_reservas.db                    # Base de datos exclusiva de M9 (Reservas)
│   ├── m7_pagos.db                       # Base de datos exclusiva de M7 (Financiero)
│   └── m5_despacho.db                    # Base de datos exclusiva de M5 (Despacho / Conductores)
├── dist/                                 # Código compilado en JavaScript para ejecución
├── scripts/
│   ├── run-demo.js                       # CLI interactivo que ejecuta ambos escenarios con tablas visuales
│   ├── test-success.js                   # Prueba automatizada del Flujo Exitoso (Exit 0)
│   └── test-failure.js                   # Prueba automatizada del Flujo con Compensación (Exit 0)
├── postman/
│   └── Demo_Saga_Grupo8.postman_collection.json # Colección de pruebas para Postman
├── src/
│   ├── index.ts                          # Entrada y arranque del servidor HTTP (Puerto 8090)
│   ├── app.ts                            # Configuración de Express, middlewares y rutas
│   ├── config/
│   │   └── database.ts                   # Inicialización y conexiones independientes a SQLite
│   ├── domain/
│   │   ├── types.ts                      # Tipos de dominio, estados, DTOs y logs de Saga
│   │   └── errors.ts                     # Clases de error de negocio (AppError, NoDriversAvailableError)
│   ├── repositories/
│   │   ├── reservationRepository.ts      # Consultas y mutaciones exclusivas en db_m9.reservas
│   │   ├── historyRepository.ts          # Registro inmutable de auditoría en db_m9.historial_reservas
│   │   └── idempotencyRepository.ts      # Deduplicación en db_m9.idempotencia
│   ├── clients/
│   │   ├── m2Client.ts                   # Cliente desacoplado hacia M2 (Clientes)
│   │   ├── m7Client.ts                   # Cliente hacia M7 (Pagos: Pre-autorización y Liberación)
│   │   ├── m5Client.ts                   # Cliente hacia M5 (Despacho: Solicitud y Asignación)
│   │   └── m8Client.ts                   # Cliente hacia M8 (Notificaciones multicanal)
│   ├── saga/
│   │   └── activationSagaOrchestrator.ts # MÁQUINA DE ESTADOS Y ORQUESTADOR DE SAGA (T1, T2, T3, C2, C1)
│   ├── controllers/
│   │   ├── reservationController.ts      # Endpoints de creación y consulta de reservas
│   │   ├── sagaController.ts             # Endpoint de ejecución de la Saga
│   │   ├── webhookController.ts          # Webhook callback idempotente de M5
│   │   └── inspectorController.ts        # Endpoint didáctico de inspección multi-base (/inspeccionar-bases)
│   └── utils/
│       └── logger.ts                     # Logger formateador con colores y X-Request-Id
├── Dockerfile
├── docker-compose.yml
├── tsconfig.json
├── package.json
├── INSTRUCCIONES_EJECUCION.md
└── EXPLICACION_TECNICA.md
```

---

## 3. Implementación de los Conceptos Asignados

### A. Tema 12: Base de Datos por Servicio & Propiedad de Datos (*Data Ownership*)
1. **Aislamiento Físico:** En `src/config/database.ts`, existen 3 instancias separadas de `DatabaseSync` que abren tres archivos de base de datos físicamente distintos en el directorio `data/`:
   - `m9_reservas.db`: contiene las tablas `reservas`, `historial_reservas` e `idempotencia`.
   - `m7_pagos.db`: contiene la tabla `transacciones`.
   - `m5_despacho.db`: contiene las tablas `solicitudes_despacho` y `conductores`.
2. **Prohibición de Acoplamiento Relacional:**
   - La tabla `reservas` en M9 posee el campo `cliente_id TEXT NOT NULL` y `conductor_id TEXT`. **No existe ninguna Foreign Key (`REFERENCES`) hacia tablas externas.**
   - M9 **nunca** ejecuta sentencias `SELECT`, `INSERT` o `JOIN` hacia `m7_pagos.db` ni `m5_despacho.db`.
3. **Acceso Exclusivo por Contrato:** Cuando M9 necesita validar al pasajero o asignar un auto, lo hace invocando a `M2Client.verificarCliente()` y `M5Client.solicitarDespacho()` mediante DTOs tipados.

### B. Tema 11: Patrón Saga Orquestado (*Consistencia Eventual*)
El orquestador reside en `src/saga/activationSagaOrchestrator.ts` y modela formalmente la clasificación de transacciones según Chris Richardson y Garcia-Molina:

```text
Flujo Exitoso:
[T1: M9 Bloqueo Local] ──> [T2: M7 Pre-autorización] ──> [T3: M5 Asignación Chofer (Pivotante)] ──> [Tr: M8 Notificación]

Flujo con Fallo en T3 (Compensación Inversa):
[T1: M9] ──> [T2: M7] ──> [T3: M5 ❌ FALLO]
                                  │
                                  ▼ (Rollback Lógico)
[C1: M9 Cancela Reserva] <── [C2: M7 Libera Fondos]
         │
         ▼
[Tr: M8 Notifica Cancelación]
```

#### Clasificación Formal de Transacciones en el Código:
1. **$T_1$ (Transacción Local M9):** La reserva pasa de `CONFIRMADA` a `EN_PROCESO_DESPACHO` en `db_m9`. Se audita en `historial_reservas`.
2. **$T_2$ (Transacción Compensable $T_c$ en M7):** Se realiza una pre-autorización monetaria por el monto estimado en `db_pagos` (Estado: `PRE_AUTORIZADO`). Es compensable porque una llamada inversa puede anularla.
3. **$T_3$ (Transacción Pivotante $T_p$ en M5):** Es el **punto de no retorno**. Si M5 asigna un conductor, la Saga se completa con éxito (`ACTIVADA`). Si M5 falla (porque no hay choferes en el radio), la transacción pivotante falla y se disparan obligatoriamente las acciones compensatorias:
   - **$C_2$ (Compensación M7):** Invoca `M7Client.liberarPreAutorizacion()`. En `db_pagos`, la transacción pasa a estado `LIBERADO` y el saldo retenido vuelve a $0.
   - **$C_1$ (Compensación M9):** M9 transiciona la reserva a `VENCIDA` y registra en `historial_reservas` un evento inmutable con el motivo del fallo.
4. **$T_r$ (Transacción Reintentable en M8):** Notificación multicanal al usuario comunicando el chofer asignado o la cancelación sin cargo.

---

## 4. Resiliencia, Idempotencia y Trazabilidad

1. **Idempotencia de Entrada (RF-9.10):** Cada llamada a `POST /reservas/:id/activar-saga` lee la cabecera `Idempotency-Key`. El orquestador consulta `IdempotencyRepository`: si la clave ya fue procesada, retorna la respuesta cacheada sin duplicar transacciones ni generar nuevos registros de auditoría.
2. **Idempotencia de Webhook Callback:** En `src/controllers/webhookController.ts`, si M5 envía dos veces el resultado de un despacho (ej. reintentos de red), M9 detecta que el estado actual ya coincide y retorna `HTTP 200` inmediatamente sin efectos secundarios.
3. **Trazabilidad Distribuida:** El middleware en `src/app.ts` asegura la generación o propagación de la cabecera `X-Request-Id` (UUID v4), la cual se estampa en cada log de consola permitiendo reconstruir la secuencia completa de la Saga.
