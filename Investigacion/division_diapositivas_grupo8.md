# Diapositivas para la Presentación y Coloquio

**Asignatura:** Desarrollo de Software (UTN)  
**Grupo:** Grupo 8 (Par 06)  
**Horario asignado:** 21:20 hs  
**Tiempo estimado de exposición:** 10 a 12 minutos de presentación + 4 minutos de demo práctica + preguntas del tribunal.

---

## Diapositiva 1: Portada
### Título: Sagas & Base de Datos por Servicio
#### Subtítulo: Consistencia y Autonomía en Arquitecturas Distribuidas: Caso de Estudio en Plataforma de Movilidad Urbana
- **Tema 11:** Patrón Saga y Transacciones Distribuidas *(Consistencia)*
- **Tema 12:** Base de Datos por Servicio y Propiedad de Datos *(Persistencia)*
- **Integrantes:** Grupo 8

> 🎙️ **Notas del Orador:**  
> "Buenas tardes a todos. Somos el Grupo 8. Hoy vamos a presentar nuestra investigación y aplicación práctica sobre dos patrones fundamentales para el diseño de software distribuido: el patrón Saga para transacciones distribuidas y el patrón Base de Datos por Servicio, aplicados al escenario del Trabajo Práctico Integrador: la plataforma distribuida de movilidad urbana."

---

## Diapositiva 2: El Punto de Partida
### El Antipatrón: Base de Datos Compartida (*Shared Database*)
- En sistemas monolíticos tradicionales, múltiples componentes leen y escriben sobre las mismas tablas SQL.
- **Problemas críticos en producción:**
  - **Acoplamiento de Esquema (*Schema Coupling*):** Cualquier cambio de tabla o columna fuerza el redespliegue coordinado de múltiples servicios.
  - **Invasión del Dominio:** Se violan las reglas de negocio al modificar registros directamente por SQL.
  - **Contención de Recursos:** Consultas analíticas pesadas generan bloqueos (*locks*) sobre transacciones críticas de usuarios en tiempo real.
- *Referencia:* Martin Fowler cataloga esto como "Database as an Integration Point", una práctica a evitar en arquitecturas ágiles.

> 🎙️ **Notas del Orador:**  
> "Para comprender por qué necesitamos estos patrones, partimos del modelo monolítico tradicional. La base de datos compartida parece muy cómoda al principio porque nos permite hacer JOINs y commits atómicos con una sola sentencia SQL. Sin embargo, en un entorno de desarrollo distribuido con múltiples equipos, crea acoplamiento de esquema. Si el equipo de conductores modifica sus tablas, rompe el servicio de viajes. Además, genera contención y bloqueos cruzados en la base de datos."

---

## Diapositiva 3: Persistencia Desacoplada
### Tema 12: Base de Datos por Servicio & Propiedad de Datos
- **Principio de Propiedad de Datos (*Data Ownership*):** Cada microservicio es el dueño absoluto de su almacén de datos (físico o lógico).
- **Acceso Estricto por Contrato:** Ningún servicio externo ejecuta SQL directo; la interacción es exclusivamente a través de APIs (REST, gRPC) o eventos.
- **Beneficios clave:**
  - **Autonomía y Despliegue Continuo:** Migraciones de esquema sin dependencias cruzadas.
  - **Persistencia Políglota (*Polyglot Persistence*):** Elección del motor más eficiente para cada dominio (ej. Redis/PostGIS para choferes geolocalizados, PostgreSQL relacional para pagos).
- **El Nuevo Desafío:** Ya no podemos ejecutar `JOIN` SQL entre servicios ni contar con transacciones ACID multi-tabla automáticas.

> 🎙️ **Notas del Orador:**  
> "La solución de persistencia es el Tema 12: Base de Datos por Servicio. Cada microservicio encapsula su propio esquema y datos. Esto otorga verdadera autonomía a los equipos y permite persistencia políglota. Pero esta independencia nos plantea un reto inmediato: ¿Cómo garantizamos la consistencia del negocio cuando una operación involucra registrar un viaje, cobrarle al pasajero y asignarle un conductor si ya no tenemos una única base de datos?"

---

## Diapositiva 4: El Dilema de la Consistencia
### ¿Por qué NO usar Two-Phase Commit (2PC / XA)?
- El protocolo 2PC intenta coordinar una transacción ACID distribuida mediante un coordinador central.
- **¿Por qué fracasa en arquitecturas de microservicios modernas?**
  1. **Bloqueo Sincrónico Retenido:** Mantiene locks en todas las bases durante las fases de *Prepare* y *Commit*.
  2. **Violación del Teorema CAP:** Sacrifica radicalmente la Disponibilidad (A) en favor de la Consistencia (C).
  3. **Agotamiento del Pool de Conexiones:** La latencia de red hace que las conexiones queden retenidas, colapsando bajo alta concurrencia.
  4. **Incompatibilidad:** Kafka, RabbitMQ y la mayoría de motores NoSQL no soportan XA.
- **Evolución:** Transición de **ACID** (estricto) al paradigma **BASE** (Consistencia Eventual).

> 🎙️ **Notas del Orador:**  
> "La respuesta clásica de la academia en los años 90 era Two-Phase Commit. ¿Por qué la descartamos hoy en día? Porque 2PC es un protocolo de bloqueo sincrónico. Si un microservicio o la red tienen unos milisegundos de latencia, todos los demás participantes quedan con las conexiones y registros bloqueados esperando confirmación. Bajo alta carga, el sistema colapsa. Por eso, en sistemas distribuidos modernos adoptamos el modelo BASE, aceptando estados intermedios y alcanzando consistencia eventual."

---

## Diapositiva 5: La Solución Transaccional
### Tema 11: El Patrón Saga (*Saga Pattern*)
- Formulado por Garcia-Molina y Salem (Princeton, 1987); adaptado a microservicios por Chris Richardson (2018).
- **Definición:** Secuencia ordenada de transacciones locales: $T_1, T_2, \dots, T_n$.
- Cada servicio ejecuta una transacción local en su propia base y publica un mensaje.
- **Acciones Compensatorias ($C_k$):** Si un paso falla, se ejecutan transacciones hacia adelante que deshacen semánticamente los efectos de los pasos previos.
- **Clasificación de pasos:**
  - **Compensables:** Pasos que pueden anularse (ej. preautorización de saldo).
  - **Pivote (*Pivot*):** El punto de no retorno. Si se completa, la saga no retrocede.
  - **Reintentables:** Pasos posteriores al pivote que garantizan completarse mediante reintentos e idempotencia.

> 🎙️ **Notas del Orador:**  
> "El Tema 11 nos da la respuesta: el Patrón Saga. En lugar de una gran transacción global bloqueante, descomponemos la operación en una cadena de transacciones locales. Cada servicio hace su commit en su base privada. Si el paso de asignación de chofer falla, el orquestador dispara transacciones compensatorias hacia atrás para liberar el dinero retenido y cancelar el viaje. Es fundamental notar que compensar no es borrar el historial, sino ejecutar una nueva acción semántica que equilibra el estado del negocio."

---

## Diapositiva 6: Estilos de Coordinación
### Coreografía vs. Orquestación
- **Saga por Coreografía (Descentralizada):**
  - Cada servicio emite eventos y reacciona a los eventos de los demás.
  - *Ventaja:* Desacoplamiento inicial simple para flujos de 2 participantes.
  - *Desventaja:* Riesgo de dependencias cíclicas y *Spaghetti Events* en flujos de negocio complejos.
- **Saga por Orquestación (Centralizada - Nuestra Elección):**
  - Un componente orquestador (`TripBookingSagaOrchestrator`) modela explícitamente la máquina de estados y despacha comandos.
  - *Ventajas:* Flujo centralizado y auditable, gestión sencilla de timeouts y control unificado de compensaciones.

> 🎙️ **Notas del Orador:**  
> "Existen dos formas de coordinar una Saga: Coreografía u Orquestación. Para nuestro TPI de movilidad urbana elegimos la Orquestación. En un flujo de reserva de viajes, donde intervienen condiciones de carrera y tiempos de espera mientras un conductor decide aceptar, la coreografía vuelve el código inmanejable y difícil de depurar. El orquestador nos ofrece una máquina de estados clara, trazable y auditable."

---

## Diapositiva 7: Aplicación al TPI
### Arquitectura de Servicios en Movilidad Urbana
- **Módulos y Bounded Contexts involucrados:**
  1. `TripService` $\leftrightarrow$ `TripsDB`: Administra el estado (`PENDING`, `CONFIRMED`, `CANCELLED`).
  2. `PaymentService` $\leftrightarrow$ `PaymentsDB`: Preautoriza tarifas y reembolsa importes.
  3. `DriverService` $\leftrightarrow$ `DriversDB`: Gestiona turnos, ubicaciones y reserva de vehículos.
- **Coordinador:**
  - `TripBookingSagaOrchestrator`: Coordina las llamadas e invoca las compensaciones ante fallas.

> 🎙️ **Notas del Orador:**  
> "En esta diapositiva vemos la arquitectura concreta que implementamos para el TPI: tres microservicios completamente independientes con sus respectivos almacenes de datos privados: TripService con TripsDB, PaymentService con PaymentsDB y DriverService con DriversDB. Ninguno comparte tablas. El TripBookingSagaOrchestrator es el encargado de guiar el ciclo de vida de la reserva interactuando únicamente a través de los contratos públicos de cada servicio."

---

## Diapositiva 8: Flujo de Negocio y Compensación
### Secuencia: ¿Qué ocurre ante una Falla?
1. **$T_1$ (TripService):** Registra el viaje en estado `PENDING`. *(Commit Local)*
2. **$T_2$ (PaymentService):** Preautoriza \$2.500 en la tarjeta del cliente. *(Commit Local)*
3. **$T_3$ [Pivote] (DriverService):** Busca conductor en el radio geográfico.  
   ❌ **Falla de Negocio:** No hay conductores disponibles o expiró el timeout.
4. **Ejecución de Compensaciones en Reversa:**
   - **$C_2$ (PaymentService):** Libera la preautorización; \$2.500 devueltos al pasajero.
   - **$C_1$ (TripService):** Cancela el registro pasando a `CANCELLED_NO_DRIVER`.
- **Resultado:** Consistencia eventual absoluta. Ni dinero retenido erróneamente ni viajes huérfanos.

> 🎙️ **Notas del Orador:**  
> "Veamos la prueba de fuego: ¿Qué ocurre cuando no hay conductores? El cliente pide el viaje (T1 se confirma en TripsDB). Se preautoriza el cobro de la tarifa (T2 se confirma en PaymentsDB). Pero al llegar al paso pivote en DriverService, el sistema detecta que ningún conductor está disponible. En ese instante, el orquestador intercepta el error y dispara las compensaciones en reversa: ejecuta C2 en PaymentService para liberar los fondos de la tarjeta y ejecuta C1 en TripService para marcar el viaje como cancelado. Ambas bases de datos quedan en un estado de consistencia eventual impecable."

---

## Diapositiva 9: El Reto del Aislamiento
### Falta de Aislamiento (*Lack of Isolation*) y Contramedidas
- En una Saga, los commits intermedios son visibles de inmediato para el resto del sistema antes de que la saga termine.
- **Riesgo:** Lecturas sucias (*Dirty Reads*) y actualizaciones perdidas.
- **Contramedidas implementadas en el diseño:**
  1. **Bloqueo Semántico (*Semantic Lock*):** Los registros incluyen estados explícitos transitorios (`TripStatus = PENDING`, `DriverStatus = RESERVED`) para que ningún otro proceso los altere.
  2. **Idempotencia:** Las compensaciones pueden ejecutarse múltiples veces con el mismo identificador sin efectos secundarios.
  3. **Diseño del Pivote:** Ubicar el paso de mayor volatilidad (búsqueda de chofer) como pivote para reducir compensaciones previas.

> 🎙️ **Notas del Orador:**  
> "Un punto técnico de suma importancia en el coloquio es la letra 'I' de ACID: el Aislamiento. Al no tener una transacción global, los cambios locales son visibles de inmediato. Para evitar lecturas sucias y condiciones de carrera, aplicamos Bloqueos Semánticos a nivel de dominio. El viaje se marca como PENDING y el chofer como RESERVED; de esta forma, ninguna otra solicitud puede tomar a ese conductor mientras la saga está en progreso."

---

## Diapositiva 10: Criterios de Utilización
### Matriz de Decisión Arquitectónica
| Dimensión | Monolito Compartido | Microservicios + 2PC | Database/Service + Saga |
| :--- | :--- | :--- | :--- |
| **Complejidad** | Baja | Muy Alta | Media-Alta |
| **Consistencia** | Inmediata (ACID) | Inmediata (ACID) | Eventual (BASE) |
| **Throughput** | Cuello de botella en DB | Pésimo (bloqueos en red) | Excelente (asíncrono) |
| **Autonomía CI/CD** | Nula | Baja | Máxima |
- **Cuándo SÍ adoptar:** Dominios con múltiples equipos autónomos, alta concurrencia y procesos de negocio asíncronos prolongados.
- **Cuándo NO adoptar:** MVPs en etapas iniciales con límites difusos o sistemas con estricto requerimiento de transacciones contables atómicas inmediatas.

> 🎙️ **Notas del Orador:**  
> "En el punto 3 de la consigna la cátedra nos pide analizar cuándo utilizar y cuándo no utilizar cada concepto. Esta matriz lo resume con precisión. Si estuviéramos desarrollando un sistema contable centralizado o un MVP con 2 programadores, un monolito con base de datos única es la decisión correcta. Pero en una plataforma como Uber o Cabify, donde miles de viajes y choferes interactúan concurrentemente, Database-per-Service junto con Sagas es el estándar de la industria para lograr disponibilidad y escalabilidad."

---

## Diapositiva 11: Demostración Práctica
### Código Funcional y Evidencias Técnicas
- Implementación en **Node.js / TypeScript** con almacenamiento desacoplado por servicio:
  - **Demo 1:** Flujo Feliz completo con registro en las tres bases de datos.
  - **Demo 2:** Inyección de fallo en choferes y ejecución verificada de compensaciones $C_2$ y $C_1$.
  - **Demo 3 (Evidencia de Propiedad de Datos):** Refactorización del esquema interno de `DriversDB` (migración de V1 a V2 con telemetría anidada) demostrando que `TripService` y la Saga siguen operando sin sufrir roturas ni requerir cambios.
- **Comandos:** `npm start` (demostración en consola) y `npm test` (pruebas automatizadas).

> 🎙️ **Notas del Orador:**  
> "Pasemos a la implementación práctica del punto 4. Desarrollamos un prototipo funcional donde cada servicio almacena sus datos en estructuras privadas. Implementamos tres demostraciones: primero, el flujo feliz; segundo, la inyección de falla que dispara la compensación en consola; y tercero, modificamos la estructura interna de la base de datos de conductores cambiando sus campos de V1 a V2, y demostramos que el servicio de viajes sigue funcionando sin enterarse, validando en código el desacoplamiento de esquemas."

---

## Diapositiva 12: Conclusiones
### Autonomía con Consistencia Garantizada
- **Conclusión 1:** La base de datos por servicio es la base indispensable de la arquitectura de microservicios moderna; elimina el acoplamiento pero delega la consistencia a la aplicación.
- **Conclusión 2:** El patrón Saga orquestada es el mecanismo más robusto para coordinar consistencia eventual en procesos multi-servicio sin bloqueos destructivos.
- **Apertura:** ¡Muchas gracias! Quedamos a disposición del tribunal para las preguntas del coloquio.

> 🎙️ **Notas del Orador:**  
> "Como conclusión general, la propiedad de datos y las Sagas son dos caras inseparables de la misma moneda en el diseño de software moderno. No podemos tener microservicios independientes si comparten una base de datos, y no podemos independizar las bases de datos sin un mecanismo como Saga que garantice la consistencia del negocio. Con esto concluimos nuestra exposición y quedamos abiertos a sus preguntas. ¡Muchas gracias!"
