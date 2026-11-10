# Guion de Exposición y Defensa Técnica de Coloquio (20 Minutos)
## Trabajo Práctico de Investigación: Consistencia y Persistencia en Sistemas Distribuidos
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo del TPI:** M9 (Reservas de Viajes)  
**Temas:** Patrón Saga Orquestado (Consistencia) & Base de Datos por Servicio (Persistencia)

---

## ⏱️ Estructura General del Coloquio (20 Minutos Totales)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CRONOGRAMA DE EXPOSICIÓN (20 min)                         │
├──────────────────┬────────────────────┬────────────────────┬───────────────────────────┤
│ Bloque 1: Intro  │ Bloque 2: Persist. │ Bloque 3: Consist. │ Bloque 4: Demo y Cierre   │
│ Integrantes 1-2  │ Integrantes 3-4    │ Integrantes 5-6    │ Integrantes 7-8-9-10      │
│ (00:00 - 04:00)  │ (04:00 - 08:00)    │ (08:00 - 12:00)    │ (12:00 - 20:00)           │
└──────────────────┴────────────────────┴────────────────────┴───────────────────────────┘
```

> **Regla de Oro del Equipo:**
> 1. Cada integrante expone **2 minutos netos**.
> 2. Estructura de cada intervención: **Concepto formal de ingeniería** + **Bajada a tierra con analogía cotidiana** + **Evidencia en código / arquitectura**.
> 3. Al terminar, cada integrante **da el pie explícito** al compañero que sigue para transmitir fluidez y trabajo en equipo.

---

# BLOQUE 1: Introducción y Contexto del TPI (4 Minutos)

---

### 👤 Integrante 1 — Apertura, Problemática Distribuida y Rol de M9
* **Tiempo:** Minuto 0:00 a 2:00
* **Qué tener en pantalla:** Diapositiva de portada y diagrama del ecosistema del TPI (los 9 módulos).
* **Guion hablado:**
  > "Buenas tardes a los profesores y compañeros. Somos el Grupo 8 y venimos a presentar nuestra investigación y aplicación práctica sobre dos temas que son la columna vertebral de las arquitecturas modernas: **Consistencia** mediante el **Patrón Saga** y **Persistencia** mediante **Base de Datos por Servicio**.
  > 
  > En nuestra materia estamos construyendo una plataforma distribuida de movilidad urbana dividida en 9 microservicios autónomos (Clientes, Choferes, Despacho, Pagos, Notificaciones, etc.). A nuestro grupo le tocó liderar el **Módulo 9: Reservas de Viajes**.
  > 
  > Cuando pasamos del clásico monolito a microservicios independientes, ganamos escalabilidad y autonomía de despliegue, pero **perdemos la comodidad de las transacciones ACID centralizadas y la base de datos única**. Si cada módulo es independiente, ¿dónde guardamos los datos sin generar un acoplamiento mortal? Y cuando una reserva cruza a varios módulos, ¿cómo evitamos que el sistema quede inconsistente ante un fallo de red?
  > 
  > Para responder el primer desafío de persistencia, mi compañero explicará las bases del patrón Database per Service."

* **💡 Bajada a tierra (Analogía):**
  > *"Es la diferencia entre una orquesta sinfónica donde cada músico tiene su partitura y su propio instrumento, versus una persona autoritaria que pretende tocar todos los instrumentos al mismo tiempo en el mismo cuarto."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿Por qué en el TPI no pusimos una sola base PostgreSQL compartida con un esquema para cada grupo y nos ahorrábamos todo este lío?"
  * *Respuesta:* "Porque crearíamos el antipatrón del 'Monolito Distribuido'. Cualquier alteración en una tabla por parte de un grupo rompería las consultas de los demás, se anularía la independencia de despliegue y un bloqueo por una consulta pesada tiraría abajo a toda la plataforma."

* **👉 Pase al siguiente compañero:** *"Ahora mi compañero [Nombre Int. 2] profundizará en los fundamentos teóricos del patrón Database per Service."*

---

### 👤 Integrante 2 — Marco Conceptual: Database per Service y Data Ownership
* **Tiempo:** Minuto 2:00 a 4:00
* **Qué tener en pantalla:** Diagrama comparativo: *Shared Database (Antipatrón)* vs. *Database per Service*.
* **Guion hablado:**
  > "Continuando con lo que planteó mi compañero, la literatura formal encabezada por Sam Newman en *Building Microservices* y Eric Evans en *Domain-Driven Design* postula que cada microservicio debe implementar el patrón **Database per Service**.
  > 
  > Esto establece el principio de **Data Ownership (Propiedad Exclusiva de los Datos)**: ningún servicio externo tiene permitido conectarse directamente a la base de datos de otro mediante consultas SQL directas (`SELECT`, `UPDATE` o `JOIN`). Las tablas son privadas y forman parte de los detalles de implementación interna.
  > 
  > El único mecanismo válido para consultar o mutar información es a través de los **contratos públicos** del servicio: sus APIs REST, gRPC o la emisión de eventos de dominio. 
  > 
  > Esto nos otorga tres ventajas fundamentales:
  > 1. **Autonomía de evolución:** Los desarrolladores pueden renombrar columnas o cambiar índices sin pedirle permiso a nadie.
  > 2. **Persistencia Políglota:** Cada servicio elige el motor ideal (PostgreSQL para reservas, Redis para geocaché o MongoDB para logs).
  > 3. **Aislamiento de fallas:** Si la base de notificaciones se satura, no arrastra el procesamiento de reservas."

* **💡 Bajada a tierra (Analogía):**
  > *"Pensémoslo como los vecinos de un edificio. Cada uno tiene su departamento y su propia alacena. Si un vecino necesita azúcar, no entra con una ganzúa a revolver tus cajones mientras dormís (eso sería un `SELECT *` a base ajena). Te toca el timbre en la puerta (la API pública) y te pide azúcar. Vos vas a tu cocina, la buscás y se la das en la mano."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "Si un servicio necesita datos de otro con muchísima frecuencia, ¿no es súper ineficiente hacer llamadas HTTP en vez de un simple JOIN de SQL?"
  * *Respuesta:* "Tiene una penalización en latencia de red, pero es el precio que se paga para evitar el acoplamiento rígido de esquemas. Si la latencia es crítica, se usan patrones de optimización como *Event-Carried State Transfer* o *CQRS*, donde el servicio interesado mantiene una copia local de solo lectura alimentada por eventos asíncronos."

* **👉 Pase al siguiente compañero:** *"Ahora mi compañero [Nombre Int. 3] mostrará cómo se traduce esto en la arquitectura concreta de nuestro Módulo 9."*

---

# BLOQUE 2: Eje Persistencia — Aplicación en M9 (4 Minutos)

---

### 👤 Integrante 3 — Aplicación de Persistencia Aislada en M9
* **Tiempo:** Minuto 4:00 a 6:00
* **Qué tener en pantalla:** El archivo `01_init_schema.sql` (o `data/m9_reservas.db`) mostrando la tabla `reservas`.
* **Guion hablado:**
  > "En nuestro Módulo 9 de Reservas de Viajes aplicamos este principio de manera estricta. M9 dispone de su propio contenedor PostgreSQL (`m9_reservas`), ejecutado en un puerto y volumen completamente independiente.
  > 
  > Como pueden ver en nuestro esquema DDL, M9 gestiona exclusivamente tres tablas:
  > 1. `reservas`: donde se almacena el estado del viaje programado.
  > 2. `historial_reservas`: nuestra tabla inmutable de auditoría para cada transición de estado (cumpliendo el RF-9.12 del TPI).
  > 3. `idempotencia`: para deduplicar peticiones ante reintentos de red (cumpliendo el RF-9.10).
  > 
  > Y un detalle arquitectónico fundamental que quiero destacar: **no existe ninguna Foreign Key hacia tablas de otros módulos**. El campo `cliente_id` es un escalar UUID puro; no hay un `REFERENCES m2_clientes(id)`. Del mismo modo, el `conductor_id` tampoco hace referencia física a la base de conductores de M3 o M5.
  > 
  > Cada módulo maneja su propio Bounded Context de persistencia."

* **💡 Bajada a tierra (Analogía):**
  > *"M9 solo anota el 'número de DNI' del cliente en su libreta de reservas. No guarda la foto, la dirección ni los datos de la tarjeta del cliente dentro de sus tablas."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "Si no hay Foreign Keys, ¿cómo garantizan la integridad referencial? ¿Qué pasa si eliminan un cliente en M2 y M9 tiene reservas asociadas?"
  * *Respuesta:* "En microservicios, la integridad referencial física de base de datos se reemplaza por **integridad lógica de negocio**. M2 nunca hace borrados físicos (`hard delete`), sino bajas lógicas (`soft delete`) o emite eventos de baja. Y M9, antes de crear cualquier reserva, valida el estado del cliente a través de su cliente HTTP."

* **👉 Pase al siguiente compañero:** *"Para explicar cómo M9 se comunica con los demás módulos preservando este aislamiento, le doy la palabra a mi compañero [Nombre Int. 4]."*

---

### 👤 Integrante 4 — Resiliencia ante Cambios de Esquema y Contratos de Integración
* **Tiempo:** Minuto 6:00 a 8:00
* **Qué tener en pantalla:** El código de `src/clients/m2Client.ts` mostrando la validación del cliente.
* **Guion hablado:**
  > "Como demostró mi compañero, M9 no toca bases ajenas. En su lugar, implementamos una capa de abstracción con clientes HTTP tipados en TypeScript, como `M2Client.ts`, `M7Client.ts` y `M5Client.ts`.
  > 
  > Por ejemplo, cuando un cliente intenta agendar una reserva, M9 no hace una consulta a la base de datos de usuarios; invoca al método `M2Client.verificarCliente(clienteId)`. 
  > 
  > Este cliente consume el endpoint REST definido bajo el contrato formal **OpenAPI 3.0**. 
  > ¿Qué ventaja nos da esto? Si el Grupo 2 (Clientes) decide normalizar su base de datos, cambiar el nombre de sus tablas internas o migrar su almacenamiento a CockroachDB, **el código de M9 no se entera ni se rompe**, porque la interfaz pública del contrato HTTP sigue siendo idéntica.
  > 
  > Pero acá aparece el gran dilema que da origen a nuestra segunda temática: si las bases están aisladas, **ya no tenemos transacciones ACID distribuidas**. ¿Cómo hacemos para cobrar un viaje, reservar y asignar chofer de forma consistente? Mi compañero [Nombre Int. 5] explicará la solución a este problema."

* **💡 Bajada a tierra (Analogía):**
  > *"Si vas a un restaurante y el dueño cambia de cocinero o reordena los estantes de la cocina, a vos como comensal no te afecta en nada: el menú que te entregan en la mesa (el contrato OpenAPI) sigue siendo exactamente el mismo."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿Qué pasa si M2 actualiza su sistema y cambia un campo obligatorio en el contrato OpenAPI rompiendo a M9?"
  * *Respuesta:* "Para evitar eso en arquitecturas maduras se utilizan **versiones de API** (por ejemplo, `/api/v1` y `/api/v2`) y pruebas de contrato automatizadas con herramientas como Pact, garantizando retrocompatibilidad antes de desplegar en producción."

* **👉 Pase al siguiente compañero:** *"Ahora mi compañero [Nombre Int. 5] nos introducirá al segundo gran eje: el Patrón Saga y la consistencia distribuida."*

---

# BLOQUE 3: Eje Consistencia — Sagas y Transacciones Distribuidas (4 Minutos)

---

### 👤 Integrante 5 — Marco Conceptual: Patrón Saga y Fallo de 2PC
* **Tiempo:** Minuto 8:00 a 10:00
* **Qué tener en pantalla:** Diapositiva con la clasificación formal: $T_c, T_p, T_r$ y la fórmula de compensación ($C_2 \to C_1$).
* **Guion hablado:**
  > "Como explicaron mis compañeros, al separar las bases de datos perdemos el `BEGIN TRANSACTION` atómico que abarcaba a todo el sistema.
  > 
  > Durante años se intentó resolver esto con **Two-Phase Commit (2PC)**, pero en la nube 2PC es inviable: bloquea tablas y conexiones a través de la red, reduce la disponibilidad según el Teorema CAP/PACELC, y es incompatible con servicios externos como pasarelas de pago o SMS.
  > 
  > Por eso adoptamos el **Patrón Saga**, formalizado por Garcia-Molina y Kenneth Salem en 1987 y adaptado a microservicios por Chris Richardson.
  > Una Saga es una **secuencia de transacciones locales ($T_1, T_2, \dots, T_n$)**. Cada servicio actualiza su propia base de datos, hace commit local inmediato y delega el siguiente paso.
  > 
  > Formalmente, las transacciones de una Saga se clasifican en tres tipos:
  > 1. **Transacciones Compensables ($T_c$):** Aquellas que pueden deshacerse lógicamente mediante una acción inversa (ej. retener fondos $\leftrightarrow$ liberar fondos).
  > 2. **Transacción Pivotante ($T_p$):** Es el **punto de no retorno**. Si la pivotante tiene éxito, la Saga se completa con certeza. Si la pivotante falla, la Saga debe abortar y ejecutar las transacciones compensatorias ($C_{k-1}, \dots, C_1$) en orden inverso.
  > 3. **Transacciones Reintentables ($T_r$):** Ocurren después de la pivotante y están garantizadas a completarse mediante reintentos e idempotencia."

* **💡 Bajada a tierra (Analogía):**
  > *"Es como comprar unas vacaciones por separado: reservás el hotel, comprás el vuelo y alquilás el auto. Si cuando vas a alquilar el auto se agotaron, no podés deshacer el universo con un botón: tenés que llamar a la aerolínea y al hotel para pedir la cancelación o el reembolso (transacciones compensatorias)."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿Una Saga garantiza aislamiento (la 'I' de ACID)?"
  * *Respuesta:* "No. La falta de aislamiento es la mayor limitación teórica de una Saga, porque los commits locales intermedios son visibles antes de que la saga termine. Se mitiga mediante diseño de dominio usando banderas de estado explícitas, como `EN_PROCESO_DESPACHO` o `PENDIENTE_PAGO`."

* **👉 Pase al siguiente compañero:** *"Ahora mi compañero [Nombre Int. 6] explicará las variantes de coordinación y por qué elegimos Orquestación en M9."*

---

### 👤 Integrante 6 — Variantes de Saga: Orquestación vs. Coreografía y Elección en M9
* **Tiempo:** Minuto 10:00 a 12:00
* **Qué tener en pantalla:** Tabla comparativa: *Coreografía vs. Orquestación*.
* **Guion hablado:**
  > "Existen dos estilos arquitectónicos para coordinar una Saga:
  > 
  > 1. **Coreografía:** Es descentralizada. Los servicios publican y reaccionan a eventos de dominio en un bus como RabbitMQ o Kafka. No hay un jefe. Funciona bien para flujos simples de 2 o 3 pasos, pero se vuelve muy difícil de rastrear y depurar cuando el sistema crece, con riesgo de dependencias circulares.
  > 
  > 2. **Orquestación:** Existe un componente central, el **Saga Coordinator**, que actúa como una máquina de estados explícita. Le envía comandos a cada servicio y espera su respuesta. Si algo falla, el orquestador sabe con exactitud matemática qué pasos ya se comitearon y cuáles debe mandar a compensar.
  > 
  > **¿Por qué elegimos Orquestación para el Módulo 9?**
  > Porque M9 es el dueño del ciclo de vida de la reserva. Necesitamos garantizar auditoría centralizada, conocer en todo momento si el viaje está confirmado, en despacho o cancelado, y evitar la dispersión de lógica en múltiples eventos.
  > 
  > En nuestro código, la clase `ActivationSagaOrchestrator` centraliza esta máquina de estados con total claridad."

* **💡 Bajada a tierra (Analogía):**
  > *"La Orquestación es una obra de teatro con un director que le dice a cada actor cuándo entrar a escena y qué decir. La Coreografía es una danza improvisada donde cada bailarín reacciona a los pasos del compañero: si uno tropieza, todos tienen que saber intuitivamente cómo reaccionar."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿El orquestador no se convierte en un cuello de botella o en un punto único de falla (SPOF)?"
  * *Respuesta:* "No, siempre que el orquestador sea *stateless* o persista sus estados de transición en la base de datos de forma idempotente, como hace M9. Si la instancia del orquestador se cae, cualquier otra réplica del contenedor puede levantar el estado de la reserva y continuar el flujo sin pérdida de datos."

* **👉 Pase al siguiente compañero:** *"A continuación, mis compañeros van a mostrar la implementación en código real y la demostración práctica."*

---

# BLOQUE 4: Aplicación en M9, Demostración y Cierre (8 Minutos)

---

### 👤 Integrante 7 — El Circuito en Código: Creación y Flujo Exitoso
* **Tiempo:** Minuto 12:00 a 14:00
* **Qué tener en pantalla:** Ejecución del `npm run demo` (Escenario 1) y el código de `ActivationSagaOrchestrator.ts`.
* **Guion hablado:**
  > "Vamos a ver la Saga en acción con el código real de nuestra implementación práctica.
  > 
  > El caso de uso más crítico de M9 ocurre cuando una reserva programada entra en su ventana de activación (entre 15 y 30 minutos antes del horario). En ese momento, se dispara `ActivationSagaOrchestrator.ejecutarSaga()`.
  > 
  > En el **Escenario Exitoso**, pueden observar en la consola cómo se ejecutan los pasos:
  > 1. **$T_1$ (Local M9):** La reserva cambia de estado a `EN_PROCESO_DESPACHO` y se registra en `historial_reservas`.
  > 2. **$T_2$ (Compensable M7):** Se invoca a `M7Client.preAutorizarPago()` reteniendo \$3.500 en `m7_pagos.db`.
  > 3. **$T_3$ (Pivotante M5):** M9 solicita el despacho a M5. M5 encuentra al chofer 'Hernán Fernández', lo asigna y responde exitosamente.
  > 
  > **¡Aquí se superó la Transacción Pivotante!** A partir de este segundo, el viaje está confirmado. M9 transiciona la reserva a `ACTIVADA` y M8 envía la notificación al pasajero.
  > 
  > Al consultar las 3 bases de datos, vemos que `db_m9` tiene la reserva `ACTIVADA`, `db_pagos` tiene la transacción `PRE_AUTORIZADO` y `db_despacho` tiene el chofer asignado."

* **💡 Bajada a tierra (Analogía):**
  > *"Es el momento exacto en el que el chofer aprieta 'Aceptar viaje' en la app: hasta ese segundo todo se podía cancelar; a partir de ahí, el viaje ya está en marcha."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿Por qué M9 no asigna el chofer directamente en vez de delegárselo a M5?"
  * *Respuesta:* "Por el principio de Responsabilidad Única y separación de dominios de Domain-Driven Design: M9 solo es experto en reservas anticipadas y agendas. La optimización de flotas en tiempo real, radios de cercanía y matching de vehículos es competencia exclusiva de M5."

* **👉 Pase al siguiente compañero:** *"Ahora mi compañero [Nombre Int. 8] mostrará la parte más interesante: qué pasa cuando las cosas fallan."*

---

### 👤 Integrante 8 — Manejo de Fallas y Acciones Compensatorias ($C_2 \to C_1$)
* **Tiempo:** Minuto 14:00 a 16:00
* **Qué tener en pantalla:** Ejecución del `npm run demo` (Escenario 2) y las líneas 150-180 de `ActivationSagaOrchestrator.ts`.
* **Guion hablado:**
  > "El verdadero valor del Patrón Saga se aprecia cuando ocurre un fallo.
  > 
  > En nuestro **Escenario 2**, simulamos que el usuario pide un viaje en una zona remota donde no hay conductores disponibles (`forzarFalloM5: true`).
  > 
  > Miren la secuencia en la consola:
  > 1. $T_1$ se ejecutó en M9 (estado `EN_PROCESO_DESPACHO`).
  > 2. $T_2$ se ejecutó en M7 (plata retenida: \$5.200 en `db_pagos`).
  > 3. **Falla en $T_3$ (Pivotante):** M5 lanza la excepción `NoDriversAvailableError`.
  > 
  > Como son bases de datos distintas, no existe un `ROLLBACK` de SQL. El bloque `catch` del orquestador toma el control y ejecuta el **Rollback Lógico (Transacciones Compensatorias en orden inverso)**:
  > - **Compensación $C_2$ sobre M7:** Se envía el comando de liberación financiera. La base de pagos cambia a estado `LIBERADO` y el saldo retenido vuelve a \$0.
  > - **Compensación $C_1$ sobre M9:** M9 actualiza el estado a `VENCIDA` y graba un registro inmutable en `historial_reservas` detallando el motivo.
  > 
  > **El resultado es Consistencia Eventual garantizada:** el cliente no perdió dinero, no hay autos asignados por error y cada base de datos refleja la realidad del negocio."

* **💡 Bajada a tierra (Analogía):**
  > *"Si el repartidor de delivery llega a tu casa con la pizza quemada, no pueden 'des-quemar' la pizza: te devuelven el dinero y te entregan una nota de disculpas. Eso es una transacción compensatoria."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿Qué pasa si la acción compensatoria también falla? (Ejemplo: se corta internet cuando el orquestador le pide a Pagos liberar el dinero)."
  * *Respuesta:* "Se aplican políticas de **reintentos automáticos con retroceso exponencial (Exponential Backoff)** e idempotencia estricta. Si el fallo persiste tras N intentos, el mensaje va a una **Dead Letter Queue (DLQ)** y se levanta una alerta operativa para conciliación manual, preservando siempre la trazabilidad en logs."

* **👉 Pase al siguiente compañero:** *"Para explicar cómo blindamos técnicamente esta Saga contra cortes de red, le doy la palabra a mi compañero [Nombre Int. 9]."*

---

### 👤 Integrante 9 — Resiliencia en la Práctica: Idempotencia y Trazabilidad
* **Tiempo:** Minuto 16:00 a 18:00
* **Qué tener en pantalla:** La salida de la **Evidencia 4** en consola y la tabla `idempotencia`.
* **Guion hablado:**
  > "En cualquier sistema distribuido, las fallas de red no son una excepción, son una certeza. Por eso, una Saga no puede existir sin dos mecanismos fundamentales que implementamos en M9:
  > 
  > 1. **Idempotencia Estricta con `Idempotency-Key` (RF-9.10):**
  > Como mostramos en la Evidencia 4 de nuestra demo, si un cliente o proceso reintenta la misma petición de activación con la misma clave `idem-key-exito-001`, M9 consulta su tabla `idempotencia`.
  > Al detectar que ya fue procesada, **no vuelve a cobrar a M7 ni vuelve a pedir chofer a M5**: retorna la respuesta anterior en 1 milisegundo. Esto previene el desastre del 'doble cobro'.
  > 
  > 2. **Webhooks Idempotentes:**
  > En `WebhookController.ts`, si M5 nos notifica dos veces la asignación de un chofer por reintentos de red, M9 detecta que ya está `ACTIVADA` y devuelve `HTTP 200` sin duplicar filas en la tabla de auditoría.
  > 
  > 3. **Trazabilidad Distribuida con `X-Request-Id`:**
  > Cada petición genera o propaga un UUID en las cabeceras HTTP. Este identificador se estampa en cada línea de log a lo largo de todos los microservicios, permitiendo a los operadores reconstruir la historia completa de una Saga en segundos."

* **💡 Bajada a tierra (Analogía):**
  > *"El botón del ascensor: por más que una persona apurada lo presione 10 veces seguidas, el ascensor viene una sola vez. Eso mismo es la idempotencia en nuestra API."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "¿Cómo sabe M9 distinguir si un webhook de M5 es una actualización legítima o una repetición duplicada?"
  * *Respuesta:* "Comprobando la máquina de estados en la base de datos: si la reserva ya alcanzó el estado terminal del evento (`ACTIVADA` o `VENCIDA`), la lógica reconoce el mensaje y responde 200 sin ejecutar efectos colaterales secundarios."

* **👉 Pase al siguiente compañero:** *"Para cerrar nuestra presentación con el análisis crítico de trade-offs, le doy la palabra a mi compañero [Nombre Int. 10]."*

---

### 👤 Integrante 10 — Análisis Crítico, Matriz de Trade-offs y Cierre
* **Tiempo:** Minuto 18:00 a 20:00
* **Qué tener en pantalla:** La matriz de decisión (Cuándo SÍ / Cuándo NO) y los tests automatizados pasando en verde (`npm run test:all`).
* **Guion hablado:**
  > "Para concluir, queremos dejar una reflexión de ingeniería: **en arquitectura de software no existen soluciones mágicas, sino elecciones de compromiso (trade-offs)**.
  > 
  > **¿Cuándo SÍ aplicar Saga y Database per Service?**
  > - Cuando tenés múltiples equipos autónomos que necesitan desplegar sin pisarse.
  > - En transacciones de negocio que involucran a múltiples servicios independientes o APIs de terceros donde 2PC es inviable.
  > - Cuando el *Blast Radius* (radio de explosión) debe ser mínimo: si M5 colapsa, M9 sigue funcionando para consultar reservas anteriores.
  > 
  > **¿Cuándo NO aplicarlos?**
  > - En sistemas pequeños, monolitos o MVPs: la sobrecarga operativa y cognitiva de programar compensaciones no se justifica.
  > - En sistemas bursátiles o de alta frecuencia donde se exija consistencia estricta instantánea y no se toleren estados intermedios.
  > - Cuando las operaciones no admitan reversión lógica (como imprimir un ticket físico o enviar un SMS).
  > 
  > Como balance, la combinación de estos dos patrones permitió que nuestro Módulo 9 sea robusto, autónomo y resiliente dentro del ecosistema del TPI.
  > 
  > Agradecemos a los profesores por su atención y quedamos a total disposición para las preguntas del tribunal."

* **💡 Bajada a tierra (Analogía):**
  > *"Cambiamos la comodidad de una base de datos centralizada por la resiliencia de un edificio antisísmico: es más complejo de diseñar y construir, pero cuando tiembla la tierra no se viene abajo todo el complejo."*

* **⚠️ Pregunta trampa del tribunal:**
  * *Profesor:* "Si tuvieran que rediseñar esta solución para 10 millones de usuarios concurrentes al estilo Uber global, ¿qué cambiarían de esta implementación?"
  * *Respuesta:* "Migraríamos las llamadas HTTP síncronas hacia un **bus de eventos asíncrono distribuido como Apache Kafka o RabbitMQ**, implementando el patrón **Transactional Outbox** para garantizar que la emisión de eventos y el commit local ocurran en una misma transacción atómica, eliminando el acoplamiento temporal de HTTP."

---

## 🎯 Consejos Finales para Obtener el 10/10 en el Coloquio

1. **Tener abierta la terminal lista para ejecutar:**
   ```bash
   cd "C:\Users\mateo\OneDrive\Desktop\demo-investigacion-grupo8"
   npm run demo
   ```
2. **Tener abiertos en pestañas de VS Code los 3 archivos clave:**
   * `src/config/database.ts` (para mostrar las 3 bases aisladas).
   * `src/saga/activationSagaOrchestrator.ts` (para mostrar las compensaciones $C_2 \to C_1$).
   * `scripts/run-demo.js` (para mostrar cómo se probó todo).
3. **Seguridad al hablar:** Usen primero la palabra técnica formal y rematen con la analogía cotidiana. Eso demuestra al tribunal que no memorizaron de memoria, sino que entendieron el problema real de ingeniería.
