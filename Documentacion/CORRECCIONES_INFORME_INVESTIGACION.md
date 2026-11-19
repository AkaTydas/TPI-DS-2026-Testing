# 📋 Guía de Correcciones y Ajustes Técnicos: Informe de Investigación TPI

**Destinatario:** Mateo (Teo) / Equipo de Edición  
**Documento analizado:** `Documentacion/TPI Investigación.pdf` (27 páginas)  
**Objetivo:** Alinear la teoría y explicaciones del documento con el código real blindado y las capturas de pantalla de la terminal incluidas en el informe.

---

## 📌 Diagnóstico General

El informe está **en un nivel sobresaliente (85-90% completado)**:
1. **Marco Teórico (Capítulos 1 a 4):** Excelente redacción académica basada en el documento de Agustín Benítez, cubriendo formalmente DDD, Data Ownership, PACELC, Teorema CAP, antipatrón Shared Database, clasificación formal de Chris Richardson ($T_c, T_p, T_r$) y la matriz de trade-offs.
2. **Arquitectura y PoC (Capítulo 5):** Muy bien articulada la propuesta técnica de Sol Fernández (las 3 bases SQLite aisladas, el orquestador y la simulación con `forzarFalloM5`).
3. **Evidencias Visuales:** Las capturas de PowerShell de las suites de prueba (`scripts/test-success.js`, `scripts/test-failure.js`, `scripts/test-hardening.js`) le dan un valor empírico altísimo.

### ⚠️ El único problema a resolver:
Hay un **desfasaje entre la teoría escrita en la Sección 5 y las capturas reales de la terminal en las páginas 24-25**. En las capturas se muestran los parches de seguridad (candado atómico, HTTP 409 y control optimista), pero el texto de la Sección 5.4 todavía describe la versión previa sin blindar.

A continuación están los cambios puntuales listos para copiar y pegar.

---

## 🛠️ Detalle de Correcciones por Página y Sección

---

### 1. Corrección en Sección 5.4 — Punto 1: Idempotencia Atómica Anti-TOCTOU
* **Ubicación:** Página 21, Sección `5.4. Mecanismos de Resiliencia y Hardening Implementados`, Punto 1.
* **Problema:** El texto actual dice:
  > *"El componente idempotencyRepository.ts verifica en data/m9_reservas.db si la clave ya fue procesada; en caso afirmativo, devuelve inmediatamente la respuesta HTTP almacenada en caché..."*
  * Esto describe una verificación pasiva con `SELECT`, que es vulnerable a condiciones de carrera **TOCTOU (Time-Of-Check to Time-Of-Use)** ante ráfagas concurrentes.
  * **Contradicción con la pág. 25:** La captura de pantalla en la página 25 muestra claramente:
    `[WARN] [IDEMPOTENCIA] Solicitud concurrente en proceso para la clave... Rechazando con HTTP 409 Conflict.`
* **Texto de reemplazo sugerido para Teo:**
  > **1. Idempotencia Estricta con Candado Atómico Anti-TOCTOU (RF-9.10):**  
  > Cada llamada a `POST /reservas/:id/activar-saga` exige la cabecera `Idempotency-Key`. Para evitar la anomalía de concurrencia TOCTOU (Time-Of-Check to Time-Of-Use) donde dos peticiones simultáneas superan una lectura previa y duplican cobros, el repositorio implementa un **bloqueo atómico temprano**: ejecuta un `INSERT` inmediato en `idempotencia` con estado `EN_PROCESO`.  
  > Si una segunda petición idéntica colisiona en el mismo milisegundo, la base de datos rechaza la clave primaria duplicada y el orquestador responde de inmediato con `HTTP 409 Conflict`. Una vez concluida la Saga, el registro se actualiza a `COMPLETADO` con la respuesta cacheada definitiva.

---

### 2. Agregar Punto 5 en Sección 5.4: Control de Concurrencia Optimista (OCC)
* **Ubicación:** Página 21-22, Sección `5.4. Mecanismos de Resiliencia y Hardening Implementados`.
* **Problema:** Se detallan 4 salvaguardas, pero falta documentar el **Control de Concurrencia Optimista (OCC) en M9** (Tarea Gianna 3), que es el que impide que dos peticiones con *distinta* clave de idempotencia colisionen sobre la misma reserva.
* **Texto a incorporar como nuevo Punto 5:**
  > **5. Control de Concurrencia Optimista (OCC) y Atomicidad Local en M9:**  
  > Para resolver colisiones donde dos clientes u operadores intentan activar la *misma reserva* con claves de idempotencia diferentes, la actualización de estado en M9 incorpora una cláusula de guarda condicional en SQL: `WHERE id = ? AND estado = 'CONFIRMADA'`. Si otra operación modificó la reserva un microsegundo antes, la sentencia afecta 0 filas y el orquestador aborta con `HTTP 409 Conflict` (previniendo *Lost Updates*).  
  > Adicionalmente, el método `transicionarConHistorial` encapsula la mutación de estado y la auditoría inmutable en una transacción local SQLite indivisible (`BEGIN IMMEDIATE ... COMMIT`), garantizando consistencia interna estricta.

---

### 3. Ajuste en Secciones 3.3 y 5.3: Compensación Defensiva en $C_2$
* **Ubicación:** 
  * Página 15, Tabla de Pasos de la Saga (fila de $C_2 \to C_1$).
  * Página 21, Sección `5.3. Implementación del Orquestador de Saga y Rollback Lógico`, subsección *Circuito de compensación inversa*.
* **Problema:** El texto asume que la compensación en M7 ($C_2$) siempre tiene éxito. No menciona qué ocurre si la pasarela de pagos se cae durante el rollback (Tarea Gianna 2).
* **Texto de reemplazo / aclaración sugerida para Teo:**
  > **Compensación Defensiva ante Fallos en Pagos ($C_2$):**  
  > Durante el rollback lógico, si la llamada a M7 para liberar la pre-autorización sufre un fallo de red o timeout, el orquestador **no propaga una excepción no controlada (`HTTP 500`)** —lo que dejaría la reserva colgada indefinidamente en `EN_PROCESO_DESPACHO`—.  
  > En su lugar, aísla la falla en un bloque protegido, asienta el evento `REQUIERE_RECONCILIACION_MANUAL` en el historial inmutable de M9 para su resolución operativa (vía Dead Letter Queue o conciliación bancaria) y **fuerza la ejecución obligatoria de $C_1$**, garantizando que la reserva cierre su ciclo de vida en estado `VENCIDA`.

---

### 4. Aclaración de Epígrafes en la Página 25 (Escenario 4)
* **Ubicación:** Página 25, *Escenario 4: Concurrencia e Idempotencia*.
* **Problema:** Hay dos capturas de terminal pegadas consecutivamente (`test-hardening.js` y `test-bug-concurrency.js`) sin un texto que aclare qué demuestra cada una.
* **Texto aclaratorio sugerido para Teo:**
  > **Figura 4.1 — Demostración empírica de vulnerabilidad sin blindar (`scripts/test-bug-concurrency.js`):**  
  > Muestra cómo, al someter a la PoC a dos llamadas simultáneas con latencia de red simulada (30 ms) sin candado atómico, el sistema incurre en anomalía de doble cobro ($5.000 + $5.000) en `m7_pagos.db`.
  > 
  > **Figura 4.2 — Validación de resiliencia con Hardening (`scripts/test-hardening.js`):**  
  > Muestra la misma prueba tras aplicar el candado atómico de idempotencia y OCC: la primera petición adquiere el recurso (`HTTP 200`), la segunda es rechazada atómicamente (`HTTP 409 Conflict`) y en `m7_pagos.db` se registra una única transacción de $3.000, eliminando al 100% el riesgo financiero.

---

### 5. Inclusión de Switches Didácticos de Exposición (Opcional recomendado)
* **Ubicación:** Página 19-20, Sección 5.1 o 5.3.
* **Texto sugerido:**
  > **Switches Didácticos para Demostración en Coloquio:**  
  > Para evidenciar de forma interactiva la efectividad de las medidas de hardening ante el tribunal docente, el endpoint `POST /reservas/:id/activar-saga` soporta banderas de depuración en su payload:  
  > - `forzarFalloM5: true`: Simula la falta de conductores en M5 para verificar el rollback compensatorio ($C_2 \to C_1$).  
  > - `desactivarCandadoIdempotencia: true`: Desactiva temporalmente el bloqueo `EN_PROCESO`, permitiendo reproducir en vivo la vulnerabilidad TOCTOU.  
  > - `desactivarCompensacionDefensiva: true`: Desactiva el `try/catch` defensivo de $C_2$, demostrando cómo el servidor crashearía a 500 y dejaría la reserva congelada.  
  > - `desactivarControlOptimista: true`: Omite el predicado `WHERE estado = 'CONFIRMADA'`, reproduciendo la condición de carrera por sobrescritura de estado.

---

### 6. Detalle Menor de Formato: Numeración en el Índice
* **Ubicación:** Página 2 (Índice) y Página 10.
* **Problema:** En ambas páginas se repite el número `2.2.3`:
  * `2.2.3. Definición y Funcionamiento del Patrón Saga`
  * `2.2.3. Tipos de Transacciones` *(repetido)*
* **Corrección:**
  * Renumerar a `2.2.4. Tipos de Transacciones`.
  * `2.2.5. Anomalías y Técnicas de Mitigación`.
  * `2.2.6. Estrategias de Coordinación: Coreografía vs. Orquestación`.

---

## 🎯 Conclusión para el Equipo
Con estos 5 ajustes aplicados en el documento Word/Docs antes de reexportar el PDF:
1. Quedan unificadas al 100% las tres ramas del equipo: **Agustín** (marco teórico y escenario), **Sol** (flujo de saga y bases) y **Gianna/Pablo** (auditoría y hardening de seguridad).
2. No habrá fisuras técnicas si un profesor compara el texto teórico con las capturas de pantalla de la terminal.
