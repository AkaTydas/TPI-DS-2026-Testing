# 📘 Manual Maestro: Implementación Práctica de Saga Orquestada y Database per Service
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo Base Asignado:** Módulo 9 (M9 - Reservas de Viajes)  
**Temas de Investigación:** Tema 11 (Consistencia: Patrón Saga) & Tema 12 (Persistencia: Base de Datos por Servicio)

---

## 📑 Índice de Contenidos

1. [Contexto del Proyecto y Escenario de Investigación](#1-contexto-del-proyecto-y-escenario-de-investigación)
2. [Mapa de Arquitectura del Sistema Implementado](#2-mapa-de-arquitectura-del-sistema-implementado)
3. [Eje de Persistencia: Database per Service y Data Ownership](#3-eje-de-persistencia-database-per-service-y-data-ownership)
4. [Eje de Consistencia: Patrón Saga Orquestado y Máquina de Estados](#4-eje-de-consistencia-patrón-saga-orquestado-y-máquina-de-estados)
5. [Diagramas de Secuencia: Flujos de Ejecución](#5-diagramas-de-secuencia-flujos-de-ejecución)
   - 5.1. Flujo Exitoso (Happy Path)
   - 5.2. Flujo con Falla y Compensación Inversa (Rollback Lógico y Compensación Defensiva)
6. [Resiliencia, Trazabilidad, Idempotencia y Blindaje Concurrente](#6-resiliencia-trazabilidad-idempotencia-y-blindaje-concurrente)
   - 6.1. Candado Atómico de Idempotencia Anti-TOCTOU (`Idempotency-Key`)
   - 6.2. Control de Concurrencia Optimista (OCC) y Bloqueo Semántico en M9
   - 6.3. Compensación Defensiva ante Fallos en $C_2$ (M7 Pagos)
   - 6.4. Webhook Callback Idempotente
   - 6.5. Trazabilidad Distribuida (`X-Request-Id`)
   - 6.6. Switches Didácticos de Inyección de Fallas
7. [Desglose Técnico Archivo por Archivo de `Implementacion/`](#7-desglose-técnico-archivo-por-archivo-de-implementacion)
8. [Guía de Puesta en Marcha, Pruebas y Verificación](#8-guía-de-puesta-en-marcha-pruebas-y-verificación)
9. [Matriz Comparativa de Estados en las 3 Bases de Datos](#9-matriz-comparativa-de-estados-en-las-3-bases-de-datos)
10. [Guía Rápida para Defensa en Coloquio](#10-guía-rápida-para-defensa-en-coloquio)

---

## 1. Contexto del Proyecto y Escenario de Investigación

En el marco del Trabajo Práctico Integrador (TPI) de Desarrollo de Software (UTN FRRe 2026), se diseña y construye una **Plataforma Distribuida de Movilidad Urbana** compuesta por 9 microservicios:
* **M1:** Autenticación y Autorización.
* **M2:** Gestión de Clientes.
* **M3:** Gestión de Conductores.
* **M4:** Ubicación y Cobertura Geoespacial.
* **M5:** Solicitud y Despacho de Viajes.
* **M6:** Ejecución y Telemetría de Viajes.
* **M7:** Tarifas y Cobros.
* **M8:** Notificaciones Multicanal.
* **M9:** Reservas Programadas de Viajes (Módulo asignado al **Grupo 8**).

### El Problema de Fondo
* **El Antipatrón de la Base de Datos Compartida (*Shared Database*):** En arquitecturas distribuidas, compartir una base de datos única anula la autonomía de los equipos, acopla los esquemas relacionales, genera contención y bloqueos por concurrencia, e imposibilita la persistencia políglota.
* **La Imposibilidad del Bloqueo Global (*2-Phase Commit / 2PC*):** En microservicios no se pueden utilizar transacciones ACID globales distribuidas (protocolo 2PC/XA) debido a que bloquean recursos de red, introducen un Punto Único de Falla (SPOF) y son incompatibles con servicios externos como pasarelas de pago.

### La Solución Implementada en `Implementacion/`
Se desarrolló una **Prueba de Concepto (PoC) integral y ejecutable en TypeScript y Node.js** que combina ambos temas:
1. **Base de Datos por Servicio (Tema 12):** Se crearon 3 bases de datos SQLite físicamente aisladas en disco (`m9_reservas.db`, `m7_pagos.db`, `m5_despacho.db`), garantizando la propiedad absoluta de datos sin sentencias SQL cruzadas ni claves foráneas foráneas.
2. **Saga Orquestada (Tema 11):** Un orquestador centralizado (`ActivationSagaOrchestrator`) coordina el proceso crítico de activación de una reserva, gestionando transacciones locales y ejecutando **transacciones compensatorias semánticas en orden inverso** ante eventuales fallos de despacho.

---

## 2. Mapa de Arquitectura del Sistema Implementado

El siguiente diagrama ilustra la arquitectura por capas, los límites de servicio y el aislamiento estricto de persistencia:

```mermaid
flowchart TD
    subgraph S_API ["Capa Externa / Clientes"]
        CLIENTE["Cliente / Pasajero<br/>(cURL / Postman / CLI)"]
        CRON["Scheduler / Activador<br/>(POST /reservas/:id/activar-saga)"]
    end

    subgraph S_APP ["Servidor HTTP Express (Puerto 8090)"]
        MID_TRAC["Middleware Trazabilidad<br/>(X-Request-Id UUID v4)"]
        ROUTER["Enrutador REST<br/>(/reservas, /webhooks, /inspeccionar-bases)"]
        
        subgraph S_CTRL ["Controladores"]
            C_RES["ReservationController"]
            C_SAGA["SagaController"]
            C_WHK["WebhookController"]
            C_INSP["InspectorController"]
        end
    end

    subgraph S_CORE ["Módulo 9: Reservas (Núcleo)"]
        ORCH["ActivationSagaOrchestrator<br/>(Máquina de Estados de la Saga)"]
        REPO_RES["ReservationRepository"]
        REPO_HIST["HistoryRepository (Auditoría)"]
        REPO_IDEM["IdempotencyRepository"]
    end

    subgraph S_CLIENTS ["Clientes de Integración (Fronteras de Dominio)"]
        CLI_M2["M2Client<br/>(Verificar Pasajero)"]
        CLI_M7["M7Client<br/>(Pre-autorizar / Liberar Pago)"]
        CLI_M5["M5Client<br/>(Solicitud de Chofer / Matching)"]
        CLI_M8["M8Client<br/>(Notificaciones Multicanal)"]
    end

    subgraph S_PERSISTENCIA ["Aislamiento Físico: Database per Service"]
        DB_M9[("📁 data/m9_reservas.db<br/>• reservas<br/>• historial_reservas<br/>• idempotencia")]
        DB_M7[("📁 data/m7_pagos.db<br/>• transacciones")]
        DB_M5[("📁 data/m5_despacho.db<br/>• solicitudes_despacho<br/>• conductores")]
    end

    %% Relaciones
    CLIENTE --> MID_TRAC
    CRON --> MID_TRAC
    MID_TRAC --> ROUTER
    ROUTER --> C_RES
    ROUTER --> C_SAGA
    ROUTER --> C_WHK
    ROUTER --> C_INSP

    C_RES --> CLI_M2
    C_RES --> REPO_RES
    C_RES --> REPO_HIST

    C_SAGA --> ORCH
    ORCH --> REPO_IDEM
    ORCH --> REPO_RES
    ORCH --> REPO_HIST
    ORCH --> CLI_M7
    ORCH --> CLI_M5
    ORCH --> CLI_M8

    C_INSP -.->|Inspección Didáctica| DB_M9
    C_INSP -.->|Inspección Didáctica| DB_M7
    C_INSP -.->|Inspección Didáctica| DB_M5

    REPO_RES --> DB_M9
    REPO_HIST --> DB_M9
    REPO_IDEM --> DB_M9

    CLI_M7 --> DB_M7
    CLI_M5 --> DB_M5
```

---

## 3. Eje de Persistencia: Database per Service y Data Ownership

### 3.1. Aislamiento Físico Real con `node:sqlite`
En lugar de compartir una base relacional o esquemas virtuales dentro del mismo motor, la implementación utiliza `node:sqlite` nativo de Node.js v24 para abrir tres archivos de base de datos físicamente independientes:
1. `data/m9_reservas.db` (Propiedad exclusiva de M9).
2. `data/m7_pagos.db` (Propiedad exclusiva del subsistema de Tarifas/Pagos).
3. `data/m5_despacho.db` (Propiedad exclusiva del subsistema de Despacho/Conductores).

### 3.2. Prohibición Explícita de Claves Foráneas Externas
En el esquema relacional de M9 (`src/config/database.ts`), los identificadores de otros servicios son escalares puros (strings UUID):
* `cliente_id TEXT NOT NULL`: No referencia `REFERENCES m2_clientes(id)`.
* `conductor_id TEXT`: No referencia `REFERENCES m5_conductores(id)`.
* `solicitud_despacho_id TEXT`: No referencia `REFERENCES m5_solicitudes(id)`.

> [!IMPORTANT]
> **Beneficio Arquitectural:** Si el equipo de Despacho (M5) decide migrar su base de SQLite a MongoDB o cambiar la estructura de su tabla `conductores`, el Módulo 9 **no sufre ningún impacto ni requiere migración de esquema**.

### 3.3. Contratos de Comunicación (DTOs)
M9 interactúa con los demás dominios a través de contratos tipados (Data Transfer Objects) expuestos por los clientes:
* `M2Client.verificarCliente(clienteId)`: Valida la habilitación del pasajero.
* `M7Client.preAutorizarPago({ reservaId, monto })`: Retiene fondos.
* `M7Client.liberarPreAutorizacion({ reservaId })`: Libera fondos ante cancelación.
* `M5Client.solicitarDespacho({ reservaId, forzarFallo })`: Solicita asignación de chofer.

---

## 4. Eje de Consistencia: Patrón Saga Orquestado y Máquina de Estados

La coordinación distribuida se implementó bajo la variante **Orquestada**, donde `ActivationSagaOrchestrator` actúa como el coordinador central que invoca las transacciones locales y evalúa las transiciones.

### 4.1. Clasificación Formal de Transacciones

| Código | Clasificación Teórica | Módulo | Acción en el Código | Compensación Asociada |
| :---: | :--- | :---: | :--- | :--- |
| **$T_1$** | **Transacción Local Inicial** | **M9** | Transiciona la reserva a `EN_PROCESO_DESPACHO` (con OCC `WHERE estado = 'CONFIRMADA'`) y registra evento en `historial_reservas`. | $C_1$: Marcar como `VENCIDA`. Se ejecuta indefectiblemente incluso si $C_2$ falla. |
| **$T_2$** | **Transacción Compensable ($T_c$)** | **M7** | Pre-autoriza fondos ($TX$) en estado `PRE_AUTORIZADO` en `db_pagos`. | $C_2$: Cambiar estado a `LIBERADO` y saldo a $0. Aislada en bloque defensivo (`REQUIERE_RECONCILIACION_MANUAL` ante error). |
| **$T_3$** | **Transacción Pivotante ($T_p$)** | **M5** | **Punto de No Retorno:** Asignación de conductor disponible en `db_despacho`. | *No compensable.* Si tiene éxito, la Saga se compromete a finalizar. |
| **$T_r$** | **Transacción Reintentable** | **M8** | Envío de notificación multicanal (Push/SMS) al pasajero. | Garantía de reintento idempotente. |

### 4.2. La Máquina de Estados de la Reserva
```text
           [POST /reservas]
                  │
                  ▼
            [CONFIRMADA]
                  │
                  │ (POST /reservas/:id/activar-saga)
                  ▼
        [EN_PROCESO_DESPACHO]  <── (T1: Bloqueo Local)
                  │
         ┌────────┴────────┐
         │ ¿M5 Asigna Chofer? (T3 Pivotante)
         │                 │
     [SÍ: Éxito]       [NO: Fallo de Matching]
         │                 │
         │                 ▼ (Rollback Lógico C2 -> C1)
         │           [C2: Liberar Fondos en M7]
         │                 │
         │                 ▼
         ▼           [C1: Marcar VENCIDA en M9]
     [ACTIVADA]            │
         │                 ▼
         │             [VENCIDA]
         │                 │
         └────────┬────────┘
                  │
                  ▼
         [Tr: Notificar a M8]
```

---

## 5. Diagramas de Secuencia: Flujos de Ejecución

### 5.1. Flujo Exitoso (Happy Path)
En este flujo todos los pasos se ejecutan favorablemente: se bloquea localmente la reserva, se retiene el dinero y se encuentra un chofer.

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador / Scheduler
    participant Saga as ActivationSagaOrchestrator
    participant M9 as M9: Reservas<br/>(data/m9_reservas.db)
    participant M7 as M7: Pagos<br/>(data/m7_pagos.db)
    participant M5 as M5: Despacho<br/>(data/m5_despacho.db)
    participant M8 as M8: Notificaciones

    Operador->>Saga: POST /reservas/{id}/activar-saga (forzarFalloM5: false)
    Note over Saga,M9: Paso T1 (Transacción Local)
    Saga->>M9: ReservationRepository.actualizarEstado('EN_PROCESO_DESPACHO')
    Saga->>M9: HistoryRepository.registrar('ACTIVACION_INICIADA')
    M9-->>Saga: OK

    Note over Saga,M7: Paso T2 (Transacción Compensable Tc)
    Saga->>M7: M7Client.preAutorizarPago(monto: $3500.00)
    M7->>M7: INSERT INTO transacciones ('PRE_AUTORIZADO')
    M7-->>Saga: OK (TX: tx-28ec45dd)

    Note over Saga,M5: Paso T3 (Transacción Pivotante Tp)
    Saga->>M5: M5Client.solicitarDespacho()
    M5->>M5: Busca chofer libre ('Hernán Fernández')
    M5->>M5: INSERT INTO solicitudes_despacho ('ASIGNADO')
    M5-->>Saga: OK (Despacho: desp-71a0b3)

    Note over Saga,M9: Confirmación Definitiva de la Saga
    Saga->>M9: ReservationRepository.actualizarEstado('ACTIVADA', chofer)
    Saga->>M9: HistoryRepository.registrar('RESERVA_ACTIVADA')
    
    Note over Saga,M8: Paso Tr (Transacción Reintentable)
    Saga->>M8: M8Client.enviarNotificacion('¡Tu chofer está en camino!')
    M8-->>Saga: OK
    Saga-->>Operador: 200 OK (Saga completada con éxito)
```

---

### 5.2. Flujo con Falla y Compensación Inversa (Rollback Lógico y Compensación Defensiva)
En este flujo, al no haber choferes disponibles en M5, la transacción pivotante falla. El orquestador intercepta el error y **deshace los efectos colaterales de $T_2$ y $T_1$ en orden inverso ($C_2 \to C_1$)**:

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador / Scheduler
    participant Saga as ActivationSagaOrchestrator
    participant M9 as M9: Reservas<br/>(data/m9_reservas.db)
    participant M7 as M7: Pagos<br/>(data/m7_pagos.db)
    participant M5 as M5: Despacho<br/>(data/m5_despacho.db)
    participant M8 as M8: Notificaciones

    Operador->>Saga: POST /reservas/{id}/activar-saga (forzarFalloM5: true)
    
    Note over Saga,M9: Paso T1 (Transacción Local con OCC)
    Saga->>M9: Estado -> EN_PROCESO_DESPACHO (WHERE estado='CONFIRMADA')
    
    Note over Saga,M7: Paso T2 (Transacción Compensable Tc)
    Saga->>M7: Pre-autorización de fondos ($6000.00)
    M7->>M7: Estado -> PRE_AUTORIZADO
    M7-->>Saga: OK

    Note over Saga,M5: Paso T3 (Transacción Pivotante Tp)
    Saga->>M5: M5Client.solicitarDespacho(forzarFallo: true)
    M5->>M5: INSERT INTO solicitudes_despacho ('SIN_CONDUCTOR')
    M5-->>Saga: ❌ NoDriversAvailableError (Sin choferes)

    Note over Saga: 💥 FALLO DETECTADO: INICIO DE COMPENSACIONES
    
    Note over Saga,M7: Compensación C2 (Inversa a T2 - Bloque Protegido)
    Saga->>M7: M7Client.liberarPreAutorizacion()
    alt M7 responde exitosamente
        M7->>M7: UPDATE transacciones SET estado='LIBERADO'
        M7-->>Saga: OK (Fondos liberados, saldo $0)
    else M7 falla (Timeout / Error 500)
        M7-->>Saga: ❌ Error de red / Pago inaccesible
        Note over Saga: Compensación Defensiva:<br/>Registra REQUIERE_RECONCILIACION_MANUAL<br/>¡NO aborta el orquestador!
    end

    Note over Saga,M9: Compensación C1 (Inversa a T1 - Ejecución Obligatoria)
    Saga->>M9: ReservationRepository.actualizarEstado('VENCIDA')
    Saga->>M9: HistoryRepository.registrar('RESERVA_VENCIDA', motivo)
    M9-->>Saga: OK

    Note over Saga,M8: Notificación Tr (Cancelación sin cargo)
    Saga->>M8: M8Client.enviarNotificacion('Sin choferes. No hubo cargo.')
    M8-->>Saga: OK
    Saga-->>Operador: 200 OK (o 207 Multi-Status si C2 requirió conciliación)
```

> [!IMPORTANT]
> **El Patrón de Compensación Defensiva:** Si la llamada a $C_2$ (Pagos) falla, un diseño ingenuo dejaría propagar la excepción hacia el runtime, arrojando un `HTTP 500` genérico. Esto provocaría que $C_1$ **nunca se ejecute**, dejando la reserva congelada indefinidamente en `EN_PROCESO_DESPACHO`. En nuestro orquestador, el bloque $C_2$ se encuentra aislado: captura la falla, asienta `REQUIERE_RECONCILIACION_MANUAL` en el historial inmutable de M9 para alerta operativa, y **fuerza la ejecución de $C_1$**, cerrando el ciclo de vida de la reserva en `VENCIDA`.

---

## 6. Resiliencia, Trazabilidad, Idempotencia y Blindaje Concurrente

### 6.1. Candado Atómico de Idempotencia Anti-TOCTOU (`Idempotency-Key`)
* **La Vulnerabilidad Teórica (TOCTOU):** En implementaciones estándar de idempotencia, se realiza un `SELECT` para verificar si la clave existe y, tras ejecutar la lógica, se hace un `INSERT` con el resultado. Si dos peticiones idénticas llegan concurrentemente en el mismo milisegundo (por reintentos agresivos del cliente o doble clic), ambas superan el `SELECT` simultáneamente, ejecutando dos veces la Saga y duplicando cargos financieros.
* **Nuestra Solución (Reserva Atómica con Bloqueo Temprano):**
  1. `IdempotencyRepository.intentarReservarClave(clave, ruta, cuerpo)`: Antes de tocar el dominio o invocar servicios externos, ejecuta un `INSERT INTO idempotencia (clave, ruta, ..., estado='EN_PROCESO')`.
  2. Si la clave ya existía:
     - En estado `'COMPLETADA'`: Retorna inmediatamente la respuesta serializada en caché (`HTTP 200`).
     - En estado `'EN_PROCESO'`: Lanza inmediatamente `AppError(409, 'La solicitud ya se encuentra en procesamiento...')`, rechazando la colisión concurrente con `HTTP 409 Conflict`.
  3. Al finalizar la Saga, `IdempotencyRepository.completarClave(clave, codigoEstado, respuesta)` actualiza el estado a `'COMPLETADA'`. Si ocurre un error irrecuperable previo a la ejecución, `liberarClave(clave)` elimina el candado para permitir reintentos válidos.

### 6.2. Control de Concurrencia Optimista (OCC) y Bloqueo Semántico en M9
* **La Vulnerabilidad Teórica:** ¿Qué sucede si dos peticiones distintas (con `Idempotency-Key` diferentes) intentan activar la *misma reserva* de manera simultánea? O si un usuario cancela la reserva en el instante exacto en que el Cron dispara su activación?
* **Nuestra Solución:**
  1. **Bloqueo Semántico por Estado:** La transición $T_1$ a `EN_PROCESO_DESPACHO` actúa como un candado semántico a nivel aplicación.
  2. **Control de Concurrencia Optimista (OCC) en SQL:**
     En `ReservationRepository.actualizarEstado(id, nuevoEstado, ..., estadoEsperado = 'CONFIRMADA')`:
     ```sql
     UPDATE reservas 
     SET estado = ?, conductor_id = ?, solicitud_despacho_id = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ? AND estado = ?;
     ```
     Si otra transacción modificó la reserva un microsegundo antes, `stmt.run()` reporta `changes === 0`. El repositorio detecta la condición de carrera y lanza `AppError(409, 'Conflicto de concurrencia: la reserva ... no se encuentra en el estado esperado')`.
  3. **Atomicidad Local en M9 (`transicionarConHistorial`):**
     La actualización de la reserva y la inserción del evento inmutable en `historial_reservas` se encapsulan en una transacción atómica local SQLite (`BEGIN IMMEDIATE ... COMMIT`), impidiendo inconsistencias dentro del propio nodo de M9.

### 6.3. Compensación Defensiva ante Fallos en $C_2$ (M7 Pagos)
* Durante el rollback lógico tras un fallo en la pivotante ($T_3$), el orquestador invoca la liberación de fondos en M7 ($C_2$).
* Si M7 está caído, sufre un timeout o arroja error:
  - Se captura la excepción en un bloque defensivo.
  - Se registra una auditoría con acción `REQUIERE_RECONCILIACION_MANUAL` detallando el ID de transacción y el error.
  - La variable `compensacionDefensivaExitosa` se marca en `false`.
  - **No se interrumpe la ejecución:** se procede inmediatamente con la compensación $C_1$ en M9 (`actualizarEstado('VENCIDA')`).
  - La respuesta HTTP devuelve código `207 Multi-Status` con la advertencia de conciliación requerida para la cola de Dead Letter Queue (DLQ) o intervención manual de finanzas.

### 6.4. Webhook Callback Idempotente
* En `src/controllers/webhookController.ts`, el endpoint `POST /webhooks/despacho` simula la notificación asíncrona de M5.
* Si por retrasos de red M5 reenvía el mismo aviso de asignación, M9 comprueba si la reserva ya se encuentra en el estado terminal (`ACTIVADA` o `VENCIDA`) y responde `HTTP 200` inmediatamente sin generar eventos espurios en `historial_reservas`.

### 6.5. Trazabilidad Distribuida (`X-Request-Id`)
* El middleware global en `src/app.ts` genera o propaga un UUID v4 a través de la cabecera `X-Request-Id`.
* Cada llamada saliente hacia `M2Client`, `M7Client`, `M5Client` y `M8Client` viaja con dicho identificador, permitiendo reconstruir la totalidad de la Saga en los logs de auditoría.

### 6.6. Switches Didácticos de Inyección de Fallas
Para permitir una defensa interactiva y empírica ante el tribunal docente, el endpoint `POST /reservas/:id/activar-saga` admite banderas booleanas opcionales en el cuerpo JSON:
* `forzarFalloM5: true`: Simula que M5 no encuentra conductores disponibles, disparando el rollback compensatorio ($C_2 \to C_1$).
* `desactivarCandadoIdempotencia: true`: Desactiva la reserva atómica `EN_PROCESO` en `idempotencia`, reproduciendo la vulnerabilidad TOCTOU ante ráfagas concurrentes.
* `desactivarCompensacionDefensiva: true`: Desactiva el `try/catch` defensivo en $C_2$, demostrando cómo un fallo en pagos crashea el orquestador con HTTP 500 y deja la reserva colgada en `EN_PROCESO_DESPACHO`.
* `desactivarControlOptimista: true`: Omite el predicado `WHERE estado = 'CONFIRMADA'` en $T_1$, demostrando cómo peticiones paralelas con claves distintas sobreescriben estados sin control.

---

## 7. Desglose Técnico Archivo por Archivo de `Implementacion/`

```text
Implementacion/
├── data/                                 # Bases de datos SQLite físicamente aisladas
│   ├── m9_reservas.db                    # Base de datos privada de M9
│   ├── m7_pagos.db                       # Base de datos privada de M7
│   └── m5_despacho.db                    # Base de datos privada de M5
├── scripts/
│   ├── run-demo.js                       # CLI interactivo con tablas visuales y demostración completa
│   ├── test-success.js                   # Suite automatizada del Flujo Exitoso
│   ├── test-failure.js                   # Suite automatizada del Flujo con Compensación
│   ├── test-hardening.js                 # Suite automatizada de Blindaje (Concurrencia, TOCTOU, OCC, C2)
│   └── test-reproducir-fallas.js         # Script didáctico de comparación: Vulnerable vs. Blindado
├── postman/
│   └── Demo_Saga_Grupo8.postman_collection.json # Colección de pruebas para Postman
├── src/
│   ├── index.ts                          # Entrada y arranque del servidor HTTP (Puerto 8090)
│   ├── app.ts                            # Configuración de Express, middlewares y rutas
│   ├── config/
│   │   └── database.ts                   # Conexión independiente a las 3 bases e inicialización DDL
│   ├── domain/
│   │   ├── types.ts                      # Interfaces TypeScript, enums de estado y DTOs de Saga
│   │   └── errors.ts                     # Clases de error (AppError, NoDriversAvailableError)
│   ├── repositories/
│   │   ├── reservationRepository.ts      # Consultas y mutaciones en db_m9.reservas (OCC y transacciones atómicas)
│   │   ├── historyRepository.ts          # Registro inmutable de auditoría en db_m9.historial_reservas
│   │   └── idempotencyRepository.ts      # Candado atómico anti-TOCTOU en db_m9.idempotencia
│   ├── clients/
│   │   ├── m2Client.ts                   # Cliente desacoplado hacia M2 (Clientes)
│   │   ├── m7Client.ts                   # Cliente hacia M7 (Pre-autorización y Liberación de fondos)
│   │   ├── m5Client.ts                   # Cliente hacia M5 (Despacho y asignación de conductor)
│   │   └── m8Client.ts                   # Cliente hacia M8 (Notificaciones multicanal)
│   ├── saga/
│   │   └── activationSagaOrchestrator.ts # MÁQUINA DE ESTADOS Y ORQUESTADOR DE SAGA DEFENSIVO
│   ├── controllers/
│   │   ├── reservationController.ts      # Endpoints CRUD de reservas
│   │   ├── sagaController.ts             # Controlador que dispara la Saga e inyecta switches
│   │   ├── webhookController.ts          # Webhook callback idempotente de M5
│   │   └── inspectorController.ts        # Endpoint didáctico /inspeccionar-bases
│   └── utils/
│       └── logger.ts                     # Logger estructurado con colores y formato Saga
├── Dockerfile                            # Empaquetado para despliegue en contenedor
├── docker-compose.yml                    # Orquestación con persistencia en volumen ./data
├── tsconfig.json                         # Configuración TypeScript (ESNext, NodeNext)
└── package.json                          # Dependencias y scripts de prueba (npm run test:hardening)
```

### Funciones Clave de Cada Módulo:
1. `src/config/database.ts`: Instancia `new DatabaseSync('data/m9_reservas.db')`, `new DatabaseSync('data/m7_pagos.db')` y `new DatabaseSync('data/m5_despacho.db')` utilizando rutas absolutas relativas al módulo para evitar directorios huérfanos. Inicializa los esquemas DDL y precarga conductores de prueba en M5.
2. `src/repositories/idempotencyRepository.ts`:
   - `intentarReservarClave`: Adquiere el candado atómico insertando la clave con estado `'EN_PROCESO'`. Previene carreras TOCTOU y rechaza peticiones simultáneas con `HTTP 409 Conflict`.
   - `completarClave`: Asienta el resultado exitoso o compensado con su código HTTP y respuesta serializada.
   - `liberarClave`: Permite reintentos legítimos si la solicitud falló antes de tocar el dominio.
3. `src/repositories/reservationRepository.ts`:
   - `actualizarEstado`: Aplica OCC (Control de Concurrencia Optimista) exigiendo la precondición `WHERE id = ? AND estado = estadoEsperado`.
   - `transicionarConHistorial`: Ejecuta una transacción local SQLite indivisible (`BEGIN IMMEDIATE ... COMMIT`) que muta el estado de la reserva y graba el historial inmutable al mismo tiempo.
4. `src/saga/activationSagaOrchestrator.ts`:
   - Coordina la máquina de estados completa de la Saga.
   - Ejecuta $T_1$ en M9 con bloqueo semántico y OCC.
   - Ejecuta $T_2$ en M7 (`preAutorizarPago`).
   - Ejecuta $T_3$ pivotante en M5 (`solicitarDespacho`).
   - Ante fallos, implementa **Compensación Defensiva**: aísla el rollback de $C_2$, marca `REQUIERE_RECONCILIACION_MANUAL` si M7 falla, y fuerza la ejecución de $C_1$ para llevar la reserva a `VENCIDA`.
   - Soporta switches didácticos para auditoría y demostración en vivo.
5. `src/controllers/inspectorController.ts`: Expone `GET /inspeccionar-bases`, retornando en un único JSON el contenido de las tres bases para verificar visualmente que no hay contaminación de tablas ni acceso directo.

---

## 8. Guía de Puesta en Marcha, Pruebas y Verificación

### 8.1. Instalación y Compilación
```bash
cd Implementacion
npm install
npm run build
```

### 8.2. Demostración Rápida Integral (Recomendada)
Ejecuta automáticamente ambos escenarios (Éxito y Falla), imprime tablas formateadas por consola, comprueba auditoría e idempotencia:
```bash
npm run demo
```

### 8.3. Ejecución de Tests Automatizados de Aserción Funcional
Valida programmaticamente las aserciones en código y en las 3 bases de datos SQLite:
```bash
# Probar solo el Flujo Exitoso
npm run test:success

# Probar solo el Flujo con Fallo y Compensación Inversa
npm run test:failure

# Probar ambos suites consecutivamente
npm run test:all
```

### 8.4. Suite de Blindaje y Concurrencia (`npm run test:hardening`)
Ejecuta la suite integral de estrés (`scripts/test-hardening.js`) que valida las 4 garantías de resiliencia del sistema bajo concurrencia real con `Promise.all`:
```bash
npm run test:hardening
```
Las 4 pruebas automatizadas verificadas son:
1. **Concurrencia con la misma Idempotency-Key (Anti-TOCTOU):** Se lanzan 2 peticiones simultáneas con la misma clave. El candado atómico asegura que exactamente 1 procesa y la otra es rechazada con `HTTP 409 Conflict`.
2. **Concurrencia sobre la misma Reserva con distintas claves (OCC):** Se lanzan 2 peticiones simultáneas sobre la misma reserva con claves diferentes. El Control de Concurrencia Optimista asegura que solo 1 logra transicionar a `EN_PROCESO_DESPACHO` y la otra recibe `HTTP 409 Conflict`.
3. **Resiliencia ante Fallo en Compensación $C_2$ (Compensación Defensiva):** Se simula una caída en M7 Pagos durante el rollback. El orquestador no crashea con HTTP 500: registra `REQUIERE_RECONCILIACION_MANUAL` en el historial y fuerza la ejecución de $C_1$, marcando la reserva como `VENCIDA`.
4. **Flujo Normal sin Conflictos:** Verifica que en condiciones estándar la saga opera de forma rápida y determinística.

### 8.5. Demostración Comparativa de Fallas Didácticas
Para evidenciar empíricamente ante el tribunal docente la diferencia entre el código vulnerable y el código blindado:
```bash
node scripts/test-reproducir-fallas.js
```
Este script utiliza los switches didácticos para desactivar temporalmente las protecciones y reproducir los fallos, demostrando luego cómo el blindaje previene cada anomalía.

### 8.6. Servidor en Vivo y Pruebas Manuales (cURL / Postman)
Para levantar el servidor HTTP continuo en el puerto 8090:
```bash
npm run start:dist
```

#### Pruebas Manuales con cURL:
1. **Crear Reserva en M9:**
   ```bash
   curl -X POST http://localhost:8090/reservas \
     -H "Content-Type: application/json" \
     -d '{"clienteId":"cli-01","origen":"Av. Castelli 930","destino":"UTN FRRe","tarifaEstimada":3500}'
   ```
2. **Ejecutar Saga Exitosa (Flujo Normal Blindado):**
   ```bash
   curl -X POST http://localhost:8090/reservas/<ID_OBTENIDO>/activar-saga \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: idem-exito-01" \
     -d '{"forzarFalloM5": false}'
   ```
3. **Ejecutar Saga con Compensación Limpia ($C_2 \to C_1$):**
   ```bash
   curl -X POST http://localhost:8090/reservas/<ID_OBTENIDO_2>/activar-saga \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: idem-fallo-02" \
     -d '{"forzarFalloM5": true}'
   ```
4. **Ejecutar con Switches Didácticos de Inyección de Fallas (Opcional):**
   ```bash
   # Simular fallo en M5 y desactivar compensación defensiva (demuestra crash y estado trabado)
   curl -X POST http://localhost:8090/reservas/<ID_OBTENIDO>/activar-saga \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: idem-switch-01" \
     -d '{"forzarFalloM5": true, "desactivarCompensacionDefensiva": true}'
   ```
5. **Inspeccionar el Estado de las 3 Bases de Datos:**
   ```bash
   curl -X GET http://localhost:8090/inspeccionar-bases
   ```

---

## 9. Matriz Comparativa de Estados en las 3 Bases de Datos

| Instante Temporal | Base M9 (`m9_reservas.db`) | Base M7 (`m7_pagos.db`) | Base M5 (`m5_despacho.db`) | Estado de Consistencia |
| :--- | :--- | :--- | :--- | :--- |
| **1. Creación Inicial** | `estado = CONFIRMADA`<br/>`conductor_id = NULL` | *(Sin registros para esta reserva)* | *(Sin registros para esta reserva)* | Consistente (Aislamiento de M9). |
| **2. Durante Activación** | `estado = EN_PROCESO_DESPACHO` | `estado = PRE_AUTORIZADO`<br/>`monto = $3500.00` | *(Búsqueda en curso)* | Consistencia Eventual en progreso. |
| **3. Finalización Exitosa** | `estado = ACTIVADA`<br/>`conductor_id = cond-001` | `estado = PRE_AUTORIZADO` | `estado = ASIGNADO`<br/>`chofer = Hernán Fernández` | **Consistencia Eventual Lograda (Happy Path).** |
| **4. Finalización con Fallo** | `estado = VENCIDA`<br/>*(Compensación $C_1$)* | `estado = LIBERADO`<br/>*(Compensación $C_2$, Saldo $0)* | `estado = SIN_CONDUCTOR` | **Consistencia Eventual Lograda (Rollback Lógico).** |
| **5. Fallo con $C_2$ Defensivo** | `estado = VENCIDA`<br/>*(Historial: `REQUIERE_RECONCILIACION_MANUAL`)* | `estado = PRE_AUTORIZADO`<br/>*(Pendiente de conciliación manual)* | `estado = SIN_CONDUCTOR` | **Consistencia Eventual Salvaguardada (Sin bloqueo de ciclo de vida).** |

---

## 10. Guía Rápida para Defensa en Coloquio

> [!TIP]
> ### Preguntas Clave de Cátedra y Respuestas Técnicas Demostradas en Código:
> 
> 1. **¿Por qué no usamos Two-Phase Commit (2PC) en lugar de una Saga?**  
>    *Respuesta:* 2PC requiere bloqueos sincrónicos en todas las bases participantes. Si la red oscila o un microservicio tarda en responder, bloquea los recursos de todos los demás. Además, es imposible incluir servicios externos (como pasarelas de pago o APIs de terceros) en una transacción 2PC.
> 
> 2. **¿Cómo demostramos que hay "Database per Service" y no un Monolito Distribuido?**  
>    *Respuesta:* En `src/config/database.ts` se crean tres archivos SQLite distintos. No existen Foreign Keys entre tablas de distintos servicios ni consultas SQL `JOIN` cruzadas. M9 únicamente se comunica con M7 y M5 mediante llamadas a clientes tipados con DTOs.
> 
> 3. **¿Qué es la Transacción Pivotante y por qué es M5?**  
>    *Respuesta:* La transacción pivotante ($T_p$) es el punto de no retorno. En nuestro flujo es la asignación del conductor en M5: si M5 confirma chofer, la reserva se activa obligatoriamente; si M5 falla, es obligatorio disparar las compensaciones ($C_2 \to C_1$) para no cobrarle al cliente por un viaje que no existirá.
> 
> 4. **¿Cómo se asegura que la Saga no cobre dos veces ante un corte de red?**  
>    *Respuesta:* Mediante la cabecera `Idempotency-Key` respaldada por la tabla `idempotencia` en `db_m9`. Si la petición entra repetida, se devuelve la respuesta en caché sin volver a llamar a M7 ni a M5.
> 
> 5. **¿Qué es la vulnerabilidad TOCTOU en Idempotencia y cómo la solucionaron?**  
>    *Respuesta:* Si dos llamadas con la misma clave entran concurrentemente, un simple `SELECT` previo seguido de `INSERT` final deja una ventana de tiempo donde ambas peticiones pasan. Nosotros implementamos un **candado atómico de reserva temprana**: insertamos de inmediato en la tabla `idempotencia` con estado `EN_PROCESO`. Por la restricción de `PRIMARY KEY`, la segunda petición colisiona en el motor de base de datos y es rechazada con `HTTP 409 Conflict`.
> 
> 6. **¿Qué pasa si dos peticiones distintas intentan activar la misma reserva al mismo tiempo?**  
>    *Respuesta:* Lo resolvemos combinando **Bloqueo Semántico** (`EN_PROCESO_DESPACHO`) y **Control de Concurrencia Optimista (OCC)** en SQL: la consulta condiciona con `WHERE id = ? AND estado = 'CONFIRMADA'`. Si una petición ya cambió el estado, la segunda afecta 0 filas y es abortada inmediatamente con `HTTP 409 Conflict`.
> 
> 7. **¿Qué ocurre si la acción compensatoria $C_2$ en Pagos falla durante el rollback?**  
>    *Respuesta:* Implementamos **Compensación Defensiva**. No dejamos que el error crashee el proceso ni dejamos la reserva congelada en `EN_PROCESO_DESPACHO`. Aislamos el fallo, estampamos `REQUIERE_RECONCILIACION_MANUAL` en el historial inmutable para alerta de soporte/DLQ, y forzamos la ejecución de $C_1$ para marcar la reserva como `VENCIDA`.
> 
> 8. **¿Cómo demuestran empíricamente que estas fallas y soluciones son reales y no meramente teóricas?**  
>    *Respuesta:* Desarrollamos la suite automatizada `npm run test:hardening` que estresa el servidor con concurrencia real (`Promise.all`), y creamos switches didácticos en el payload (`desactivarCandadoIdempotencia`, `desactivarCompensacionDefensiva`, `desactivarControlOptimista`) junto con el script `node scripts/test-reproducir-fallas.js` para reproducir las vulnerabilidades y comprobar en vivo la efectividad de las defensas.

