# Registro y Justificación Técnica de Commits: Alineación e Intercambiabilidad con Grupo 9 (M9 - Reservas de Viajes)

**Asignatura:** Desarrollo de Software 2026 — UTN FRRe  
**Módulo:** M9 — Reservas de Viajes  
**Equipo:** Grupo 8  
**Fecha:** Noviembre 2026  
**Objetivo:** Documentar exhaustivamente cada commit aplicado durante la fase de alineación de arquitectura, contratos de datos (OpenAPI 3.0.3 / Grupo 9), lógica de negocio, resiliencia e idempotencia para garantizar intercambiabilidad total sin afectar funcionalidades existentes.

---

## Índice de Commits Documentados
1. [`057d739` — Error format in spanish](#commit-1-057d739--error-format-in-spanish)
2. [`371ddec` — Wrapper for contract group 9](#commit-2-371ddec--wrapper-for-contract-group-9)
3. [`b4dd1d4` — Activation response with entire object instead of resumen, for group 9 API](#commit-3-b4dd1d4--activation-response-with-entire-object-instead-of-resumen-for-group-9-api)
4. [`8ba0aaa` — Fixed name gender issue in BDD and format in history](#commit-4-8ba0aaa--fixed-name-gender-issue-in-bdd-and-format-in-history)
5. [`5d090b3` — Solved same ID different atributes problem (Tarea 5: Conflicto de Idempotencia)](#commit-5-5d090b3--solved-same-id-different-atributes-problem-tarea-5)
6. [`58bd42c` — Scheduler implemented as a new service for M5 purposes (Tarea 7: Scheduler Automático)](#commit-6-58bd42c--scheduler-implemented-as-a-new-service-for-m5-purposes-tarea-7)
7. [`6a92343` — Update tests dor API compatability](#commit-7-6a92343--update-tests-dor-api-compatability)
8. [`4596ba1` — Fix visual correction sintax (`tests/tsconfig.json`)](#commit-8-4596ba1--fix-visual-correction-sintax-teststsconfigjson)
9. [`61b5ae5` — Api migration complete :D (Tarea 2: Contrato OpenAPI Unificado)](#commit-9-61b5ae5--api-migration-complete-d-tarea-2)

---

## Commit 1: `057d739` — `Error format in spanish`

### 1. Resumen
Se intervino el middleware centralizado de manejo de errores (`src/middlewares/errorHandler.ts`) para reemplazar la estructura basada en la especificación RFC 7807 (`ProblemDetails` con encabezado `application/problem+json` y propiedades en inglés `type`, `title`, `status`, `detail`) por el estándar común de error acordado con Grupo 9 (**RNF-03**): `{ codigo, mensaje, detalle }` con `Content-Type: application/json`.

### 2. El Porqué (Justificación Técnica)
* **Requerimiento RNF-03 / Contrato Grupo 9:** El contrato conjunto de Grupo 9 exige que toda respuesta de error HTTP (`4xx` y `5xx`) exponga una interfaz común predecible:
  ```json
  {
    "codigo": "NO_ENCONTRADA",
    "mensaje": "Texto para mostrar al usuario",
    "detalle": null
  }
  ```
* Si un cliente o frontend del módulo gemelo consumiera la API de Grupo 8 esperando `res.body.codigo` y recibiera `res.body.title`, fallaría la deserialización y el manejo de excepciones en la interfaz gráfica.

### 3. Código Modificado (`src/middlewares/errorHandler.ts`)
```typescript
// Mapeo automático de código de negocio según status o código explícito:
if (err instanceof AppError) {
  let codigo = err.code || 'ERROR';
  if (!err.code) {
    if (err.status === 400) codigo = 'DATOS_INVALIDOS';
    if (err.status === 401) codigo = 'NO_AUTENTICADO';
    if (err.status === 403) codigo = 'NO_AUTORIZADO';
    if (err.status === 404) codigo = 'NO_ENCONTRADA';
    if (err.status === 409) codigo = 'ESTADO_INVALIDO';
    if (err.status === 422) codigo = 'REGLA_NEGOCIO_INVALIDA';
    if (err.status === 503) codigo = 'SERVICIO_NO_DISPONIBLE';
  }

  res.status(err.status).json({
    codigo,
    mensaje: err.title,
    detalle: err.detail || null
  });
  return;
}
```

---

## Commit 2: `371ddec` — `Wrapper for contract group 9`

### 1. Resumen
Se adaptó el método `ReservationController.crear` en `src/controllers/reservationController.ts` para que la respuesta exitosa a la creación de una reserva (`POST /reservas`) devuelva el wrapper `RespuestaCreacion` exigido por **RF-9.4**, conteniendo `{ mensaje, motivo, reserva, condiciones }`.

### 2. El Porqué (Justificación Técnica)
* **Requerimiento RF-9.4:** Establece que al crear una reserva se deben presentar las condiciones de confirmación, modificación, cancelación y tarifa vigentes al pasajero.
* Grupo 8 devolvía directamente la entidad `reserva` en el cuerpo raíz con código `201`. Grupo 9 exige devolver la reserva encapsulada junto con el bloque de texto `condiciones` informadas y el motivo si la reserva requiriera aprobación o quedara `PENDIENTE`.

### 3. Código Modificado (`src/controllers/reservationController.ts`)
```typescript
const condiciones = {
  confirmacion: 'Confirmación automática inmediata si el cliente y la zona están habilitados.',
  modificacion: 'Permitida hasta 60 minutos antes del horario programado.',
  cancelacion: 'Permitida con motivo obligatorio de al menos 3 caracteres.',
  activacion: 'Se solicitará conductor a M5 al aproximarse la hora del viaje.',
  tarifa: reserva.condicionesTarifa || 'Tarifa sujeta a demoras de tráfico y variaciones climáticas.'
};

res.status(statusCode).json({
  mensaje: esRepeticion
    ? 'Reserva existente recuperada exitosamente'
    : 'Reserva creada y confirmada correctamente',
  motivo: reserva.estado === 'PENDIENTE' ? 'Pendiente de confirmación externa' : null,
  reserva,
  condiciones
});
```

---

## Commit 3: `b4dd1d4` — `Activation response with entire object instead of resumen, for group 9 API`

### 1. Resumen
Se actualizó la firma y retorno del método `ActivationService.activarReserva` en `src/services/activationService.ts` para retornar `Promise<ReservaDTO>` en lugar de la interfaz reducida `ActivarReservaResult` (`{ reservaId, solicitudId, estado, mensaje }`).

### 2. El Porqué (Justificación Técnica)
* **Contrato OpenAPI Grupo 9 (Endpoint `POST /reservas/{id}/activar`):**
  La respuesta `200 OK` documentada por Grupo 9 especifica:
  ```yaml
  responses:
    '200':
      description: Reserva activada, con `solicitudDespachoId` de M5
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Reserva'
  ```
* Al devolver la entidad completa `ReservaDTO` con el nuevo `solicitudDespachoId` asignado por M5, los clientes pueden actualizar su estado local inmediatamente sin tener que disparar un `GET /reservas/:id` adicional.

### 3. Código Modificado (`src/services/activationService.ts`)
```typescript
// Firma actualizada:
public static async activarReserva(
  id: string,
  user: JwtUserPayload,
  requestId?: string
): Promise<ReservaDTO> {
  ...
  // Retorno en caso idempotente:
  if (reserva.solicitudDespachoId) {
    return reserva;
  }
  ...
  // Retorno tras activación exitosa hacia M5 y persistencia:
  return (await ReservationRepository.obtenerPorId(reserva.id))!;
}
```

---

## Commit 4: `8ba0aaa` — `Fixed name gender issue in BDD and format in history`

### 1. Resumen
Se resolvieron dos discrepancias críticas de nombres de atributos y estructura de datos entre ambos grupos:
1. En `src/types/reservation.ts` y `src/repositories/reservationRepository.ts`: incorporación de los timestamps en femenino `creadaEn` y `modificadaEn` preservando `creadoEn` y `actualizadoEn`.
2. En `src/repositories/historyRepository.ts`: adaptación del método `mapToDTO` para retornar la estructura `EntradaHistorial` exigida por Grupo 9 en `GET /reservas/:id/historial`.

### 2. El Porqué (Justificación Técnica)
* **Género de Atributos:** Grupo 8 utilizaba `creadoEn` y `actualizadoEn` (masculino/participio genérico). Grupo 9 exigía en su OpenAPI `creadaEn` y `modificadaEn` (femenino, concordando con "la reserva"). Al exponer **ambos pares** en el DTO, se logra retrocompatibilidad absoluta.
* **Formato del Historial (RF-9.12):** Grupo 9 exigía las claves `{ id, reservaId, tipoCambio, campoModificado, valorAnterior, valorNuevo, actorId, rolActor, motivo, fechaCambio }` con el enum `[CREACION, CONFIRMACION, MODIFICACION, CANCELACION, ACTIVACION, VENCIMIENTO]`. Se implementó un traductor en el mapper del repositorio sin alterar el esquema físico de PostgreSQL.

### 3. Código Modificado (`src/repositories/historyRepository.ts`)
```typescript
private static mapToDTO(row: any): HistorialEventoDTO {
  const tipoEvento: TipoEvento = row.tipo_evento;
  const detalles = typeof row.detalles === 'string' ? JSON.parse(row.detalles) : (row.detalles || null);
  const fechaIso = new Date(row.fecha_hora).toISOString();

  // Deducción de tipoCambio según Grupo 9
  let tipoCambio: TipoCambioHistorial = 'MODIFICACION';
  switch (tipoEvento) {
    case 'RESERVA_CREADA': tipoCambio = 'CREACION'; break;
    case 'RESERVA_CONFIRMADA': tipoCambio = 'CONFIRMACION'; break;
    case 'RESERVA_MODIFICADA': tipoCambio = 'MODIFICACION'; break;
    case 'RESERVA_CANCELADA': tipoCambio = 'CANCELACION'; break;
    case 'RESERVA_ACTIVADA': tipoCambio = 'ACTIVACION'; break;
    case 'RESERVA_VENCIDA': tipoCambio = 'VENCIMIENTO'; break;
    default: tipoCambio = 'MODIFICACION';
  }

  // Deducción de rol del actor
  const actorStr = String(row.actor || '');
  let rolActor: RolActorHistorial = 'CLIENTE';
  if (actorStr.toLowerCase().includes('operador') || actorStr.toLowerCase().includes('admin')) {
    rolActor = 'OPERADOR';
  } else if (actorStr.toLowerCase().includes('m5') || actorStr.toLowerCase().includes('sistema')) {
    rolActor = 'SISTEMA';
  }

  return {
    id: row.id,
    reservaId: row.reserva_id,
    tipoEvento,
    estadoAnterior: row.estado_anterior,
    estadoNuevo: row.estado_nuevo,
    actor: row.actor,
    detalles,
    fechaHora: fechaIso,
    // Compatibilidad G9:
    tipoCambio,
    campoModificado: tipoEvento === 'RESERVA_MODIFICADA' ? 'reserva' : 'estado',
    valorAnterior: row.estado_anterior,
    valorNuevo: row.estado_nuevo,
    actorId: row.actor,
    rolActor,
    motivo: detalles?.motivo || null,
    fechaCambio: fechaIso
  };
}
```

---

## Commit 5: `5d090b3` — `Solved same ID different atributes problem (Tarea 5)`

### 1. Resumen
Se implementó en `src/services/reservationService.ts` la validación estricta de coherencia de carga útil ante solicitudes repetidas con la misma `claveIdempotencia` (**RNF-08 / RNF-09**).

### 2. El Porqué (Justificación Técnica)
* **Principio de Idempotencia en APIs REST:** Si un cliente reintenta un `POST /reservas` enviando la misma clave de idempotencia pero modificando atributos clave (ej: cambió de destino, de vehículo o de fecha), el servidor **no debe** devolver la reserva existente silenciosamente fingiendo éxito ni tampoco debe sobreescribirla.
* El contrato de Grupo 9 indica explícitamente:
  > *"Si se repite con los mismos datos, responde 200 con la reserva ya creada; si se repite con datos distintos, responde 409 `CONFLICTO_IDEMPOTENCIA`."*

### 3. Código Modificado (`src/services/reservationService.ts`)
```typescript
private static validarCoincidenciaIdempotencia(reserva: ReservaDTO, data: CrearReservaDTO): void {
  const coincideCliente = reserva.clienteId === data.clienteId;
  const coincideVehiculo = reserva.tipoVehiculo === data.tipoVehiculo;
  const coincideFecha = new Date(reserva.fechaHora).getTime() === new Date(data.fechaHora).getTime();
  const coincideOrigen =
    Math.abs(reserva.origen.latitud - data.origen.latitud) < 0.0001 &&
    Math.abs(reserva.origen.longitud - data.origen.longitud) < 0.0001;
  const coincideDestino =
    Math.abs(reserva.destino.latitud - data.destino.latitud) < 0.0001 &&
    Math.abs(reserva.destino.longitud - data.destino.longitud) < 0.0001;

  if (!coincideCliente || !coincideVehiculo || !coincideFecha || !coincideOrigen || !coincideDestino) {
    throw new AppError({
      status: 409,
      code: 'CONFLICTO_IDEMPOTENCIA',
      title: 'Conflicto de idempotencia',
      detail: 'La clave de idempotencia ya fue utilizada con datos diferentes'
    });
  }
}
```

---

## Commit 6: `58bd42c` — `Scheduler implemented as a new service for M5 purposes (Tarea 7)`

### 1. Resumen
Se implementó el servicio de segundo plano `ReservationScheduler` en `src/services/schedulerService.ts` para cumplir con el requerimiento **RF-9.9** (Activación programada automática en despacho hacia M5).

### 2. El Porqué (Justificación Técnica)
* **Requerimiento RF-9.9:** El sistema debe activar automáticamente las reservas confirmadas al aproximarse la hora del viaje (ventana configurable de 20 minutos) enviando la solicitud a M5 sin requerir que un operador humano presione manualmente un botón en Swagger o en el frontend.
* El servicio corre un ciclo periódico cada 30 segundos (configurable), consulta reservas `CONFIRMADA` sin `solicitudDespachoId` en la ventana de tiempo, e invoca `ActivationService.activarReserva()` con el actor de sistema `SISTEMA_SCHEDULER`. Se conecta en `src/index.ts` con soporte para apagado ordenado (*Graceful Shutdown*).

### 3. Código Modificado (`src/services/schedulerService.ts`)
```typescript
export class ReservationScheduler {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  public static start(intervalMs: number = 30000): void {
    if (this.timer) return;
    this.ejecutarCiclo();
    this.timer = setInterval(() => this.ejecutarCiclo(), intervalMs);
  }

  public static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public static async ejecutarCiclo(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const pendientes = await ReservationRepository.obtenerPendientesDeActivacion(20);
      for (const reserva of pendientes) {
        await ActivationService.activarReserva(reserva.id, SYSTEM_USER, `sched-${Date.now()}`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
```

---

## Commit 7: `6a92343` — `Update tests dor API compatability`

### 1. Resumen
Se actualizaron los tests de integración en `tests/integration/reservationLifecycle.test.ts`, `tests/integration/activationAndWebhook.test.ts` y `tests/integration/health.test.ts` para validar las nuevas estructuras de datos y códigos de error unificados.

### 2. El Porqué (Justificación Técnica)
* Al cambiar la respuesta de `POST /reservas` a `{ mensaje, reserva, condiciones }`, los tests viejos que leían `res.body.id` obtenían `undefined`, lo que provocaba que las llamadas subsiguientes (`GET /reservas/undefined`, `PATCH /reservas/undefined`) fallaran con `404`.
* Se incorporaron además pruebas automatizadas para:
  * Validación del código de error `{ codigo: 'NO_AUTENTICADO' }` y `application/json`.
  * Verificación del conflicto de idempotencia `409 CONFLICTO_IDEMPOTENCIA`.
  * Verificación de la recepción de la reserva completa en `POST /reservas/:id/activar`.

---

## Commit 8: `4596ba1` — `Fix visual correction sintax (tests/tsconfig.json)`

### 1. Resumen
Se creó el archivo de configuración `tests/tsconfig.json` para resolver la carga de definiciones de tipo de Jest en editores de código (VS Code / Antigravity).

### 2. El Porqué (Justificación Técnica)
* El archivo raíz `tsconfig.json` contiene `"exclude": ["tests"]` para que el comando de compilación de producción `npm run build` (`tsc`) compile únicamente `src/` hacia `dist/` sin incluir archivos de prueba.
* Sin embargo, esa exclusión provocaba que el servicio de lenguaje de TypeScript en el editor tratara a los tests como archivos aislados sin conocer los identificadores globales de Jest (`describe`, `it`, `beforeAll`, `expect`), generando falsos errores visuales (*red squiggly lines*).
* Al extender de `../tsconfig.json` con `"types": ["jest", "node"]` dentro de `tests/tsconfig.json`, el editor reconoce todos los tipos de Jest al 100% mientras `npm run build` continúa funcionando de forma aislada e impecable.

---

## Commit 9: `61b5ae5` — `Api migration complete :D (Tarea 2)`

### 1. Resumen
Se consolidó y publicó el archivo de especificación de interfaz `openapi.yaml` (OpenAPI 3.0.3) unificando la documentación formal con la de Grupo 9 y preservando las capacidades de desarrollo de Grupo 8.

### 2. El Porqué (Justificación Técnica)
* **Adopción de Grupo 9:** Esquemas `RespuestaCreacion`, `Condiciones`, `EntradaHistorial`, `Error` `{ codigo, mensaje, detalle }`, timestamps `creadaEn` / `modificadaEn`, y respuesta `409 CONFLICTO_IDEMPOTENCIA`.
* **Preservación de Grupo 8:**
  1. `http://localhost:8089` como primer servidor en `servers` para garantizar pruebas directas en Swagger UI sin problemas de CORS ni puertos cruzados.
  2. Componente de seguridad `components.securitySchemes.BearerAuth` para habilitar el botón `Authorize` en Swagger UI.
  3. Ruta del Webhook de M5 (`POST /reservas/{id}/despacho`) con sus esquemas `DespachoWebhookRequest` y `DespachoWebhookResponse` para simular la asignación o vencimiento del conductor.

---

## Resumen del Estado de la Suite de Pruebas
Tras la aplicación de estos 9 commits, la suite completa ejecuta:
```text
Test Suites: 9 passed, 9 total
Tests:       49 passed, 49 total
Snapshots:   0 total
Time:        2.729 s
```
* **Compilación de producción:** `npm run build` -> 0 errores.
* **Chequeo de tipos estricto:** `npx tsc --noEmit` -> 0 errores.
* **Cobertura funcional:** Intercambiabilidad verificada con Grupo 9.
