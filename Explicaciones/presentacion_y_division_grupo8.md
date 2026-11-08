# Presentación y División de Exposición (Documento Unificado)

**Asignatura:** Desarrollo de Software (UTN)  
**Grupo Asignado:** Grupo 8 (Par 06)  
**Temas:**
- **Tema 11:** Patrón Saga y Transacciones Distribuidas *(Consistencia)*
- **Tema 12:** Base de Datos por Servicio y Propiedad de Datos *(Persistencia)*
**Escenario de Aplicación:** Plataforma Distribuida de Movilidad Urbana (TPI)  
**Horario asignado para el Coloquio:** 21:20 hs  
**Tiempo total:** 20 minutos (10 a 12 min de exposición oral + 4 min de demostración en vivo + debate con el tribunal).

---

## 📋 Resumen de Organización para los 10 Presentadores

Cada integrante tiene a su cargo **exactamente 1 diapositiva** (~1 minuto de exposición).  
Esta estructura garantiza el cumplimiento estricto del **Criterio 5 de la rúbrica (Coloquio y defensa técnica - 30 puntos)**, demostrando dominio conceptual individual y trabajo en equipo coordinado.

| Diapositiva | Presentador | Tema Central | Foco Técnico | Duración |
| :-: | :--- | :--- | :--- | :-: |
| **01** | **Presentador 1** | Portada y Bienvenida | Presentación formal de los dos temas y hoja de ruta | 1:00 min |
| **02** | **Presentador 2** | El Antipatrón Monolítico | Base de datos compartida y acoplamiento de esquema (*Schema Coupling*) | 1:15 min |
| **03** | **Presentador 3** | **Tema 12:** Database-per-Service | Principio de *Data Ownership* y persistencia políglota | 1:15 min |
| **04** | **Presentador 4** | El Dilema de la Consistencia | Pérdida de transacciones ACID y fracaso de 2PC (Teorema CAP) | 1:15 min |
| **05** | **Presentador 5** | **Tema 11:** Patrón Saga | Transacciones locales, compensaciones, pasos pivote y reintentables | 1:15 min |
| **06** | **Presentador 6** | Coordinación de Sagas | Justificación técnica de Orquestación frente a Coreografía | 1:00 min |
| **07** | **Presentador 7** | Mapeo en el TPI | Servicios independientes: TripsDB, PaymentsDB, DriversDB | 1:15 min |
| **08** | **Presentador 8** | Mecánica de Fallas | Secuencia de falla en asignación y compensaciones en reversa (C2 y C1) | 1:15 min |
| **09** | **Presentador 9** | Rigor y Decisiones | Falta de aislamiento (*ACD*), bloqueos semánticos y matriz de uso | 1:15 min |
| **10** | **Presentador 10** | Demostración Práctica | Ejecución de las 3 demos (`npm start`), pruebas (`npm test`) y cierre | 1:30 min |

---

## 🖥️ Diapositivas + Guion Oral + Preguntas de Coloquio (Paso a Paso)

---

### Diapositiva 01 | 👤 Presentador 1: Portada y Presentación Formal

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
                    Sagas & Base de Datos por Servicio
        Consistencia y Autonomía en Sistemas de Movilidad Urbana
================================================================================
• TEMA 11 (Consistencia): Saga y Transacciones Distribuidas
  - Coordinación de operaciones multi-servicio mediante compensaciones semánticas.

• TEMA 12 (Persistencia): Base de Datos por Servicio
  - Propiedad de datos, autonomía de esquemas y eliminación del acoplamiento.

• Escenario: Plataforma Distribuida de Movilidad Urbana (TPI)
• Equipo: Grupo 8 (Par 06) • 10 Integrantes • UTN Desarrollo de Software
================================================================================
```

#### 🎙️ Guion Oral del Presentador 1 (Speech)
> *"Buenas tardes a los profesores y compañeros. Somos el Grupo 8. Hoy vamos a exponer nuestra investigación y aplicación práctica sobre dos patrones fundamentales del diseño distribuido asignados por la cátedra:  
> Por un lado, el **Tema 11: Saga y Transacciones Distribuidas**, dentro de la categoría de Consistencia; y por el otro, el **Tema 12: Base de Datos por Servicio y Propiedad de Datos**, en la categoría de Persistencia.  
> Nuestro propósito es demostrar cómo ambos conceptos se complementan para resolver el desacoplamiento de datos sin perder la integridad del negocio, aplicándolo a la plataforma de movilidad urbana del Trabajo Práctico Integrador. Nos organizamos entre los 10 integrantes para cubrir cada aspecto teórico, arquitectónico y la demostración práctica funcional en código. Le paso la palabra a mi compañero para analizar el problema de partida."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 1
* **Pregunta:** *¿Por qué la cátedra les asignó estos dos temas como complementarios?*
* **Respuesta clave:** *Porque están intrínsecamente encadenados: cuando aplicamos Base de Datos por Servicio (Tema 12) para evitar el acoplamiento de esquemas, perdemos las transacciones ACID relacionales globales. Esto crea la necesidad inmediata de un patrón como Saga (Tema 11) para coordinar la consistencia eventual entre los servicios sin recurrir a bloqueos distribuidos.*

---

### Diapositiva 02 | 👤 Presentador 2: El Antipatrón de Base de Datos Compartida

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
      El Antipatrón: Base de Datos Compartida (Shared Database)
================================================================================
1. Acoplamiento de Esquema (Schema Coupling)
   - Cualquier cambio en una tabla obliga a redesplegar múltiples servicios de forma coordinada.
   - Rompe la entrega continua (Continuous Delivery).

2. Invasión del Bounded Context
   - Módulos ajenos mutan datos directamente por SQL sin ejecutar las validaciones del dominio.

3. Contención y Bloqueos de Concurrencia (Locks)
   - Consultas pesadas de reportes bloquean tablas que procesan viajes en tiempo real.

Referencia: Martin Fowler cataloga esto como "Database as an Integration Point", 
una práctica fuertemente desaconsejada en arquitecturas modernas.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 2 (Speech)
> *"Para fundamentar por qué necesitamos estos patrones, debemos partir del modelo monolítico tradicional de base de datos compartida, catalogado por Martin Fowler como 'Database as an Integration Point'.  
> Cuando múltiples módulos del sistema leen y escriben directamente en las mismas tablas relacionales, se desatan tres problemas graves en producción:  
> Primero, el **acoplamiento de esquema**: si el equipo de conductores necesita modificar una tabla o renombrar una columna, se ve forzado a coordinar y redesplegar el servicio de viajes y el de cobros al mismo tiempo, anulando la entrega continua.  
> Segundo, la **invasión del dominio**: cualquier servicio puede modificar registros ajenos por SQL eludiendo las validaciones del negocio.  
> Y tercero, la **contención de bloqueos**: una consulta analítica pesada bloquea registros que los usuarios necesitan para solicitar viajes en tiempo real. Ahora mi compañero explicará cómo se resuelve esto desde la persistencia."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 2
* **Pregunta:** *¿Por qué el acoplamiento a nivel de base de datos es considerado más peligroso que el acoplamiento a nivel de código?*
* **Respuesta clave:** *Porque el esquema de base de datos persiste datos históricos; alterar una columna afecta a todas las aplicaciones que dependen de esa estructura, mientras que una API desacopla el almacenamiento detrás de una interfaz pública con versionado de contratos.*

---

### Diapositiva 03 | 👤 Presentador 3: Base de Datos por Servicio (Tema 12)

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
          Tema 12: Base de Datos por Servicio & Propiedad de Datos
================================================================================
• Propiedad Exclusiva (Data Ownership)
  - Cada microservicio es el único dueño legítimo de su almacenamiento.
  - Ningún servicio externo ejecuta SQL directo; acceso strictly vía API (REST/gRPC) o Eventos.

• Persistencia Políglota (Polyglot Persistence)
  - Libertad para elegir el motor óptimo:
    * DriverService: Redis / PostGIS (búsqueda geoespacial ultra veloz).
    * PaymentService: PostgreSQL relacional (transacciones contables estrictas).

• Beneficio Arquitectónico
  - Autonomía total de los equipos: despliegues independientes sin fricción interdepartamental.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 3 (Speech)
> *"El Tema 12 introduce el patrón fundamental: **Base de Datos por Servicio (*Database-per-Service*)**.  
> El principio arquitectónico rector es la **propiedad exclusiva de datos (*Data Ownership*)**: cada microservicio es el único dueño legítimo de su almacenamiento persistente. Nadie externo tiene credenciales para hacer SELECT o UPDATE directos; la única puerta de entrada son sus APIs públicas o eventos de dominio.  
> Esto habilita la **persistencia políglota**: el servicio de conductores puede usar Redis o PostGIS para geolocalización ultra rápida, mientras que el servicio de pagos utiliza PostgreSQL relacional para transacciones financieras.  
> Los equipos ganan autonomía total para modificar sus esquemas sin pedir autorización. Sin embargo, esta independencia nos plantea un reto inmediato: ya no podemos hacer un `JOIN` SQL entre tablas de diferentes servicios ni ejecutar una transacción ACID global. Mi compañero explicará por qué las soluciones clásicas como 2PC no son viables."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 3
* **Pregunta:** *¿Es obligatorio que cada microservicio tenga un servidor físico de base de datos separado?*
* **Respuesta clave:** *No necesariamente. Puede implementarse como bases dedicadas en servidores distintos, como esquemas/catálogos lógicos separados dentro del mismo motor relacional, o mediante tablas privadas con permisos de usuario restringidos. Lo mandatorio es el aislamiento lógico de acceso.*

---

### Diapositiva 04 | 👤 Presentador 4: El Fin del `JOIN` y el Fracaso de 2PC

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
    El Dilema de la Consistencia y el Fracaso de Two-Phase Commit (2PC)
================================================================================
• El Fin del JOIN y de las Transacciones Multi-Tabla
  - Al separar bases, no es posible ejecutar un BEGIN TRANSACTION...COMMIT que abarque
    Viajes, Pagos y Conductores.

• ¿Por qué NO usar Two-Phase Commit (2PC / XA)?
  1. Bloqueo Sincrónico: Retiene locks en la red durante la fase de preparación;
     la latencia agota el pool de conexiones.
  2. Teorema CAP: Sacrifica la Disponibilidad en favor de consistencia estricta.
  3. Punto Único de Falla: Si el coordinador cae, los recursos quedan congelados.

• Evolución de Paradigma: Del modelo ACID estricto al paradigma BASE (Consistencia Eventual).
================================================================================
```

#### 🎙️ Guion Oral del Presentador 4 (Speech)
> *"Al desacoplar las bases de datos, surge el gran dilema transaccional: una reserva de viaje requiere crear el viaje, cobrar el dinero y asignar un chofer. Ya no podemos hacer un `JOIN` ni un `COMMIT` relacional que abarque a los tres servicios.  
> La alternativa académica clásica era el protocolo de compromiso en dos fases: **Two-Phase Commit (2PC)**. ¿Por qué la descartamos en microservicios?  
> Porque 2PC es un protocolo de **bloqueo sincrónico**. Durante la fase de preparación, todos los nodos bloquean registros en la red. Si un servicio demora unos milisegundos, todas las conexiones quedan retenidas, agotando el pool de conexiones bajo alta concurrencia.  
> Según el **Teorema CAP**, 2PC castiga brutalmente la Disponibilidad: si un nodo o la red fallan, el sistema entero se detiene.  
> Por eso la industria moderna adopta el paradigma **BASE**, aceptando estados transitorios suaves y alcanzando **consistencia eventual** sin bloqueos distribuidos. Ahora veremos cómo el patrón Saga implementa esto."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 4
* **Pregunta:** *¿Qué significa que el sistema pase del modelo ACID al modelo BASE?*
* **Respuesta clave:** *ACID garantiza consistencia inmediata y aislamiento estricto mediante bloqueos. BASE significa: Basically Available (prioriza responder solicitudes), Soft-state (acepta estados transitorios intermedios) y Eventual consistency (la consistencia se alcanza al finalizar el proceso asíncrono o sus compensaciones).*

---

### Diapositiva 05 | 👤 Presentador 5: El Patrón Saga y Compensaciones (Tema 11)

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
                   Tema 11: El Patrón Saga (Saga Pattern)
================================================================================
• Secuencia de Transacciones Locales: Saga = {T1, T2, ..., Tn}
  - Cada servicio actualiza su propia base de datos de forma local y emite un evento/mensaje.

• Clasificación de Transacciones en una Saga:
  1. Compensables (T1, T2): Pasos previos que pueden anularse semánticamente ante un fallo.
  2. Pivote (T3): Punto de no retorno. Si se confirma, la saga garantiza terminar hacia adelante.
  3. Reintentables (T4): Pasos post-pivote garantizados a completarse mediante reintentos.

• Transacción Compensatoria (Ck) ≠ Rollback SQL
  - El rollback SQL descarta operaciones en memoria antes del commit.
  - La compensación ejecuta UNA NUEVA TRANSACCIÓN hacia adelante que anula el efecto semántico.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 5 (Speech)
> *"El Tema 11 introduce la respuesta de consistencia: el **Patrón Saga**, formulado en 1987 por Garcia-Molina y Salem en Princeton y adaptado a microservicios por Chris Richardson.  
> Una Saga modela una transacción distribuida como una secuencia ordenada de **transacciones locales**: cada paso confirma en su propia base y publica un mensaje que activa el siguiente paso.  
> El corazón de una Saga son sus **transacciones compensatorias**: si un paso falla, el sistema ejecuta acciones de compensación en reversa.  
> Es fundamental distinguir que **compensar no es hacer un rollback SQL**: el rollback relacional anula cambios que nunca fueron visibles; en una Saga, los pasos anteriores ya hicieron commit y fueron visibles. La compensación es una nueva transacción que equilibra el estado del negocio, como emitir una reversión de saldo.  
> Además, los pasos se dividen en: **compensables**, la **transacción pivote** que es el punto de no retorno, y las **reintentables** posteriores al pivote. Ahora mi compañero analizará cómo se coordinan estos pasos."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 5
* **Pregunta:** *¿Por qué es crucial identificar la transacción pivote dentro de una Saga?*
* **Respuesta clave:** *Porque define el punto de no retorno: todos los pasos antes del pivote deben tener transacciones compensatorias obligatorias en caso de fallo, mientras que los pasos posteriores al pivote no necesitan compensación porque están diseñados para ser reintentables e idempotentes hasta tener éxito.*

---

### Diapositiva 06 | 👤 Presentador 6: Coordinación: Coreografía vs. Orquestación

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
               Coordinación de Sagas: Coreografía vs. Orquestación
================================================================================
• Saga por Coreografía (Descentralizada)
  - Los servicios emiten y escuchan eventos de dominio de forma reactiva.
  - Ventaja: Simple para flujos de 2 servicios.
  - Desventajas: Peligro de "Spaghetti Events", dependencias cíclicas y monitoreo difuso.

• Saga por Orquestación (Centralizada - NUESTRA ELECCIÓN)
  - Un componente orquestador modela explícitamente la máquina de estados.
  - Envía comandos directos a los participantes y gestiona respuestas y timeouts.
  - Control centralizado de compensaciones sin acoplamiento circular entre servicios.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 6 (Speech)
> *"Al diseñar una Saga existen dos estilos de coordinación: **Coreografía** u **Orquestación**.  
> En la Coreografía, no existe un coordinador; cada servicio reacciona a eventos emitidos por los demás. Es simple para flujos muy cortos, pero en sistemas de movilidad urbana genera el antipatrón de *Spaghetti Events*, dependencias cíclicas y extrema dificultad para saber en qué estado exacto está una reserva.  
> Por ello, para nuestro Trabajo Práctico Integrador elegimos **Orquestación**.  
> Implementamos un componente orquestador que centraliza la máquina de estados del negocio. El orquestador despacha comandos a los servicios, maneja los timeouts si un chofer no responde y dispara las compensaciones en reversa de manera ordenada y predecible. Los participantes no necesitan conocerse entre sí, manteniendo un bajísimo acoplamiento. Ahora mi compañero presentará la arquitectura concreta del TPI."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 6
* **Pregunta:** *¿La orquestación no genera un microservicio 'Dios' (*God Service*) que concentra toda la lógica?*
* **Respuesta clave:** *Ese es un riesgo si se modela mal. Para evitarlo, el orquestador solo contiene la lógica de coordinación del flujo transaccional (la máquina de estados), mientras que las reglas de negocio de dominio (cálculo de tarifa, validación de conductores) permanecen estrictamente encapsuladas dentro de cada servicio participante.*

---

### Diapositiva 07 | 👤 Presentador 7: Mapeo en el TPI: Movilidad Urbana

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
           Mapeo en el TPI: Plataforma Distribuida de Movilidad Urbana
================================================================================
• TripService (TripsDB)
  - Administra el ciclo de vida del viaje: PENDING, CONFIRMED, CANCELLED.

• PaymentService (PaymentsDB)
  - Administra preautorizaciones bancarias, retención de tarifas y reembolsos.

• DriverService (DriversDB)
  - Gestiona la flota de choferes, turnos y disponibilidad geográfica en tiempo real.

• TripBookingSagaOrchestrator
  - Coordina la transacción multi-servicio consumiendo únicamente contratos públicos de API.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 7 (Speech)
> *"En el Trabajo Práctico Integrador desarrollamos la plataforma distribuida de movilidad urbana. Mapeamos el sistema en tres microservicios autónomos, cada uno dueño absoluto de su base de datos:  
> Primero, **`TripService`**, dueño de `TripsDB`, que gestiona los viajes a través de sus estados `PENDING`, `CONFIRMED` o `CANCELLED`.  
> Segundo, **`PaymentService`**, dueño de `PaymentsDB`, responsable de validar tarjetas, retener los \$2.500 de tarifa y emitir reintegros.  
> Y tercero, **`DriverService`**, dueño de `DriversDB`, encargado de administrar la disponibilidad geográfica y los turnos de los choferes.  
> Ninguno comparte tablas ni esquemas SQL. La reserva de viajes es liderada por el **`TripBookingSagaOrchestrator`**, que se comunica únicamente mediante contratos públicos de API, asegurando el aislamiento de datos. Ahora mi compañero explicará qué sucede ante una falla en este flujo."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 7
* **Pregunta:** *¿Cómo consulta un pasajero el historial de sus viajes junto con el nombre del chofer y el recibo si las bases están separadas?*
* **Respuesta clave:** *Se utilizan dos patrones: Composición de API (un API Gateway consulta ambos microservicios y combina los datos en memoria) o CQRS (los servicios emiten eventos de dominio y un servicio de lectura actualiza una vista desnormalizada optimizada para consultas instantáneas).*

---

### Diapositiva 08 | 👤 Presentador 8: Secuencia de Falla y Compensación

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
                   Secuencia de Falla y Compensación Semántica
================================================================================
1. Paso T1: Registrar viaje PENDING en TripsDB. [✓ Commit Local]
2. Paso T2: Preautorizar tarifa ($2.500) en PaymentsDB. [✓ Commit Local]
3. Paso T3 [PIVOTE]: Asignar chofer en DriversDB. [✗ Falla de Negocio: Sin Choferes]

Disparo Automático de Compensaciones en Reversa:
• C2 (Compensar Pago): PaymentService.releaseAuthorization() -> $2.500 devueltos al pasajero.
• C1 (Compensar Viaje): TripService.cancelTrip() -> Viaje pasa a CANCELLED_NO_DRIVER.

Resultado: Consistencia Eventual absoluta sin fondos retenidos ni registros huérfanos.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 8 (Speech)
> *"Veamos la prueba de fuego de la arquitectura: ¿Qué sucede cuando una solicitud de viaje no puede completarse?  
> En el inicio, el pasajero pide un viaje. El paso 1 ($T_1$) crea el viaje en estado `PENDING` en `TripsDB`. El paso 2 ($T_2$) retiene exitosamente la tarifa de \$2.500 en `PaymentsDB`. Ambos commits locales se confirmaron.  
> Pero al llegar al paso 3 ($T_3$), que actúa como la transacción pivote, el orquestador solicita un conductor a `DriverService` y ocurre una falla de negocio: ningún conductor acepta o no hay autos cercanos en el radio geográfico.  
> En ese instante, el orquestador captura el fallo e inicia la compensación en orden inverso:  
> Ejecuta la compensación $C_2$ en `PaymentService`, liberando la retención de los \$2.500 y devolviendo el saldo al pasajero.  
> Luego ejecuta la compensación $C_1$ en `TripService`, cancelando formalmente el viaje.  
> Ambas bases de datos quedan en un estado consistente: el pasajero no pierde su dinero y no quedan viajes en el limbo. Mi compañero continuará con el análisis del aislamiento."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 8
* **Pregunta:** *¿Qué sucedería si la llamada de compensación a PaymentService falla temporalmente por un corte de red?*
* **Respuesta clave:** *Las compensaciones deben ser obligatoriamente idempotentes y reintentables. El orquestador reintentará periódicamente la llamada hasta que PaymentService confirme la liberación, o enviará el mensaje a una Dead Letter Queue (DLQ) para resolución garantizada, asegurando que nunca se pierda dinero.*

---

### Diapositiva 09 | 👤 Presentador 9: Reto del Aislamiento y Criterios de Decisión

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
                 Rigor Conceptual: Aislamiento & Criterios de Uso
================================================================================
• Falta de Aislamiento (Lack of Isolation):
  - Al hacer commits intermedios, otros servicios pueden ver estados transitorios (Dirty Reads).
  - Contramedida: Bloqueos Semánticos (estados como PENDING o RESERVED) para que ningún
    otro proceso toque el recurso hasta que la saga concluya.

• Criterios de Decisión (Punto 3 de la Consigna):
  - ¿Cuándo SÍ?: Sistemas distribuidos de alto volumen, múltiples equipos autónomos y 
    procesos de negocio asíncronos prolongados.
  - ¿Cuándo NO?: Monolitos bien diseñados, MVPs en etapa inicial o balances contables que
    exigen transacciones ACID indivisibles.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 9 (Speech)
> *"Un aspecto conceptual muy riguroso que la cátedra evalúa es el desafío del Aislamiento (la 'I' de ACID).  
> En una Saga, los commits intermedios son visibles de inmediato. Esto puede dar lugar a anomalías como 'Lecturas Sucias': un microservicio de estadísticas podría leer un viaje como confirmado cuando en realidad segundos después se cancela por falta de chofer.  
> Para resolverlo aplicamos **bloqueos semánticos**: las entidades guardan estados transitorios como `PENDING` o `RESERVED`, impidiendo que otros procesos consuman el recurso hasta que la saga termine.  
> Respecto a los **criterios de utilización**:  
> Esta arquitectura se recomienda plenamente en plataformas de alta concurrencia con equipos independientes y procesos asíncronos prolongados.  
> En cambio, **NO se recomienda** en proyectos iniciales tipo MVP con dominios inmaduros, o en sistemas donde se requiere consistencia contable estricta e indivisible. Para cerrar, mi compañero expondrá las evidencias técnicas en el código."*

#### ❓ Pregunta Típica de Coloquio para el Presentador 9
* **Pregunta:** *¿Qué es exactamente un Bloqueo Semántico (*Semantic Lock*) y cómo difiere de un bloqueo de base de datos?*
* **Respuesta clave:** *Un bloqueo de base de datos retiene locks físicos a nivel de fila o tabla en el motor SQL congelando el hilo de ejecución. Un bloqueo semántico es una bandera a nivel de dominio en la aplicación (ej. `status = RESERVED_BY_SAGA_123`) que le indica a la lógica de negocio que ese registro está comprometido sin bloquear conexiones físicas del motor.*

---

### Diapositiva 10 | 👤 Presentador 10: Demostración Práctica, Evidencias y Cierre

#### 📺 Contenido Visual de la Diapositiva
```text
================================================================================
               Implementación Práctica & Evidencias en Código
================================================================================
• Proyecto en Node.js con módulos nativos y bases aisladas:
  - Demo 1: Flujo feliz completo (reserva, cobro retenido, chofer asignado y confirmación).
  - Demo 2: Inyección de falla forzada en choferes y ejecución comprobada de compensaciones C2 y C1.
  - Demo 3: Evidencia de Database-per-Service: migración del esquema interno de DriversDB 
            (V1 a V2) sin romper TripService ni la Saga.

• Comandos de ejecución:
  - npm start -> Demostración interactiva en consola con traza de estados.
  - npm test  -> Suite de pruebas automatizadas con 100% de éxito.

• Cierre: ¡Muchas gracias! Quedamos a disposición de la cátedra para las preguntas.
================================================================================
```

#### 🎙️ Guion Oral del Presentador 10 (Speech)
> *"Para cumplir con el punto 4 de la consigna y los entregables obligatorios, desarrollamos una solución funcional en Node.js con módulos nativos, disponible en nuestro repositorio.  
> Implementamos exactamente las demostraciones sugeridas por la cátedra, ejecutables con `npm start`:  
> La **Demo 1** muestra el Happy Path con commits en las tres bases privadas.  
> La **Demo 2** inyecta una falla intencional en conductores y muestra en tiempo real cómo el orquestador ejecuta las compensaciones $C_2$ y $C_1$, retornando el sistema a consistencia eventual.  
> Y la **Demo 3** es la evidencia directa de Base de Datos por Servicio: migramos la estructura interna de `DriversDB` cambiando campos y agregando telemetría de V1 a V2, y demostramos que `TripService` y la Saga siguen operando sin sufrir ninguna rotura ni requerir cambios de código, validando el desacoplamiento de esquemas.  
> Además, con `npm test` verificamos todas las pruebas automatizadas.  
> Con esto demostramos que la propiedad de datos brinda autonomía y las Sagas garantizan la integridad del negocio. ¡Muchas gracias y quedamos a disposición de la mesa examinadora para responder sus preguntas!"*

#### ❓ Pregunta Típica de Coloquio para el Presentador 10
* **Pregunta:** *¿Cómo demostraron en el código que los esquemas de bases de datos están realmente desacoplados?*
* **Respuesta clave:** *En la Demo 3 ejecutamos el método `migrateInternalSchemaToV2()`, que eliminó campos internos como `carPlate` y `rating` en DriversDB reemplazándolos por objetos complejos anidados. Demostramos que TripService y la Saga siguieron funcionando sin modificar una sola línea de código porque interactúan a través del contrato público DTO y no contra la base interna.*

---

## 💡 Consejos de Coordinación para la Exposición Oral

1. **Pase de palabra fluido:** Al terminar su parte, cada integrante dice simplemente: *"Le paso la palabra a mi compañero para continuar con..."*.
2. **Coordinación de diapositivas:** Quien comparte pantalla avanza con la tecla `[→]` del teclado al escuchar el pase de palabra. El visor web muestra el tag `Presentador X` arriba a la derecha para confirmar que están en la diapositiva sincronizada.
3. **Distribución equitativa:** Los 10 miembros tienen roles técnicos sólidos y de igual relevancia, asegurando el puntaje máximo en el coloquio.
