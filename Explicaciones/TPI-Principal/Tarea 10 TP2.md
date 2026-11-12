# Tarea 10 TP2: Reglas de Cancelación Financiera Tardía e Integración con M7 (RF-9.7, RF-9.12)

**Responsable:** Mateo López — Reglas de Cancelación Financiera y Tests Unitarios (QA / Backend)  
**Proyecto:** Módulo 9 (M9 - Reservas de Viajes) — UTN FRRe — Desarrollo de Software — Grupo 8  

---

## 1. Resumen de la Tarea

El objetivo de esta tarea fue implementar las **reglas de penalización financiera por cancelación tardía** en el ciclo de vida de las reservas programadas (requerimiento **RF-9.7**), integrando la lógica con el **Módulo 7 (Tarifas y Pagos)**, garantizando la trazabilidad histórica en auditoría (**RF-9.12**) y expandiendo la suite de pruebas unitarias e integración en **Jest** para alcanzar una alta cobertura de código.

### Principales intervenciones realizadas:
1. **Definición de la ventana de cancelación gratuita:** Se configuró el umbral temporal (`freeCancellationMinutes: 60`), diferenciando cancelaciones en término de cancelaciones sobre la hora.
2. **Ampliación del cliente de integración M7 ([`M7Client`](src/clients/m7Client.ts)):** Se implementó el contrato `procesarCancelacion` con soporte de modo mock (cálculo de 30% de penalidad en cancelaciones tardías y $0 en término) y manejo de fallas de infraestructura mediante **RFC 7807 (HTTP 503)**.
3. **Lógica de negocio en [`ReservationService`](src/services/reservationService.ts):** Evaluación en tiempo real del tiempo remanente antes del viaje, invocación síncrona a M7 previa a la persistencia y registro auditable de los detalles financieros.
4. **Mantenimiento y expansión de la suite de pruebas:** Creación de [`tests/unit/m7Client.test.ts`](tests/unit/m7Client.test.ts) y ampliación de [`tests/integration/reservationLifecycle.test.ts`](tests/integration/reservationLifecycle.test.ts), alcanzando **10 suites de pruebas y 58 tests pasando al 100%**, elevando la cobertura de M7 al **93.75%**.

---

## 2. Comandos Paso a Paso

### Paso A: Modificaciones en el Código Fuente

1. **Configuración de la ventana temporal en [`src/config/env.ts`](src/config/env.ts):**
   ```typescript
   anticipation: {
     minMinutes: parseInt(process.env.ANTICIPACION_MINIMA_MINUTOS || '30', 10),
     maxDays: parseInt(process.env.ANTICIPACION_MAXIMA_DIAS || '30', 10),
     freeCancellationMinutes: parseInt(process.env.VENTANA_CANCELACION_SIN_CARGO_MINUTOS || '60', 10)
   },
   ```

2. **Integración y simulación de M7 en [`src/clients/m7Client.ts`](src/clients/m7Client.ts):**
   ```typescript
   export interface M7ProcesarCancelacionRequest {
     reserva_id: string;
     cliente_id: string;
     tarifa_estimada: number;
     cancelacion_tardia: boolean;
     minutos_anticipacion: number;
   }

   export interface M7ProcesarCancelacionResponse {
     reserva_id: string;
     cargo_aplicado: number;
     moneda: string;
     estado_financiero: 'SIN_CARGO' | 'CARGO_APLICADO';
     detalle: string;
   }
   ```
   * En caso de `useExternalMocks: true`: si la cancelación es tardía se aplica un **30% de recargo** sobre la tarifa estimada; de lo contrario, `cargo_aplicado: 0`.
   * En caso de `useExternalMocks: false`: invoca vía `POST` a M7 y, ante caída de red, arroja `AppError 503 ("Dependencia no disponible")`.

3. **Invocación en el flujo de cancelación en [`src/services/reservationService.ts`](src/services/reservationService.ts):**
   ```typescript
   // Calcular minutos restantes hasta el viaje
   const ahora = new Date();
   const fechaViaje = new Date(reserva.fechaHora);
   const minutosRestantes = Math.floor((fechaViaje.getTime() - ahora.getTime()) / (1000 * 60));
   const esCancelacionTardia = minutosRestantes < config.anticipation.freeCancellationMinutes;

   // Notificar y liquidar penalidad en M7
   const resultadoFinanciero = await M7Client.procesarCancelacion({
     reserva_id: reserva.id,
     cliente_id: reserva.clienteId,
     tarifa_estimada: reserva.tarifaEstimada || 0,
     cancelacion_tardia: esCancelacionTardia,
     minutos_anticipacion: minutosRestantes
   }, requestId);

   // Persistir estado CANCELADA y registrar auditoría con metadatos financieros
   await HistoryRepository.registrar({
     reservaId: id,
     tipoEvento: 'RESERVA_CANCELADA',
     estadoAnterior: reserva.estado,
     estadoNuevo: 'CANCELADA',
     actor: user.sub,
     detalles: {
       motivo: motivo.trim(),
       cancelacionTardia: esCancelacionTardia,
       cargoAplicado: resultadoFinanciero.cargo_aplicado,
       estadoFinanciero: resultadoFinanciero.estado_financiero
     }
   });
   ```

---

### Paso B: Ejecución de Tests y Verificación de Cobertura

```bash
# Correr la suite completa de pruebas unitarias y de integración
npm test

# Ejecutar el reporte de cobertura de código
npm run test:coverage
```

---

### Paso C: Confirmación de Cambios en Git

```bash
# 1. Comprobar archivos modificados y nuevos
git status

# 2. Preparar los archivos para el commit
git add src/config/env.ts src/clients/m7Client.ts src/services/reservationService.ts tests/unit/m7Client.test.ts tests/integration/reservationLifecycle.test.ts

# 3. Registrar el commit semántico
git commit -m "feat(RF-9.7): implementar cargos financieros por cancelacion tardia con M7 y tests unitarios"

# 4. Sincronizar con el repositorio remoto
git push origin main
```

---

## 3. Justificación Técnica: ¿Por qué se hizo cada paso?

### A. ¿Por qué delegar el cálculo del cargo en M7 en lugar de calcularlo internamente en M9?
* **Separación de Responsabilidades y Bounded Contexts (DDD):** El módulo M9 se encarga exclusivamente de la gestión del ciclo de vida de las reservas. Las políticas tarifarias, penalidades, saldos de cuenta corriente y cobranzas pertenecen al dominio del **Módulo 7 (Tarifas y Pagos)**.
* **Mantenibilidad:** Si las políticas comerciales cambian (por ejemplo, cobrar tarifa fija en lugar de porcentaje, o variar la penalidad por horario nocturno), solo se modifica el Módulo 7 sin obligar a redeplegar ni modificar M9.

### B. ¿Por qué invocar a M7 antes de actualizar la reserva a `CANCELADA` en la base de datos?
* **Consistencia Transaccional y Resiliencia:** Si el Módulo 7 está inaccesible (`useExternalMocks: false` y falla de red), el sistema arroja una excepción `AppError 503`.
* Si hubiéramos actualizado la base de datos antes de llamar a M7, la reserva quedaría cancelada en el sistema pero el cobro de la penalidad se perdería silenciosamente. Al invocarlo antes, la operación es atómica: si no se puede liquidar financieramente, la reserva permanece en su estado original y se le comunica el error al usuario.

### C. ¿Por qué registrar los detalles financieros en `HistoryRepository` (RF-9.12)?
* **Auditoría Inmutable:** La tabla `historial_reservas` almacena eventos append-only en formato JSONB. Al guardar `{ cancelacionTardia, cargoAplicado, estadoFinanciero }` dentro del detalle del evento `RESERVA_CANCELADA`:
  * El cliente u operador puede consultar en cualquier momento `GET /reservas/:id/historial` y saber con precisión matemática qué tarifa tenía, cuántos minutos faltaban y por qué se le cobró penalidad.
  * No se contamina la tabla principal `reservas` con campos temporales que solo tienen sentido ante un evento de cancelación.

### D. ¿Por qué una penalidad del 30% en cancelaciones tardías?
* **Desincentivo Operativo y Costo de Oportunidad:** Cuando una reserva está a menos de 60 minutos de ejecutarse, el ecosistema de movilidad ya está planificando o reservando conductores en la zona. Una cancelación tardía genera un costo operativo y de disponibilidad para el conductor asignado, justificando un cargo financiero de mitigación.

---

## 4. Resultados de Validación y Cobertura (Jest)

### Resumen de Ejecución:
* **Test Suites:** `10 passed, 10 total`
* **Tests:** `58 passed, 58 total`
* **Snapshots:** `0 total`

### Métricas de Cobertura Clave:
| Archivo | % Líneas | % Funciones | % Ramas (Branches) | Estado |
| :--- | :--- | :--- | :--- | :--- |
| `src/clients/m7Client.ts` | **93.75%** | **100%** | **81.81%** | ✅ Alta cobertura |
| `src/services/reservationService.ts` | **86.23%** | **70.00%** | **76.13%** | ✅ Óptimo |
| `src/config/env.ts` | **100%** | **100%** | **52.50%** | ✅ Total |
| `tests/unit/m7Client.test.ts` | **100%** | **100%** | **100%** | ✅ Nueva suite |

### Casos de Prueba Implementados:
1. **`tests/unit/m7Client.test.ts`:**
   * Estimación de tarifas para tipos de vehículo `AUTO` y `MOTO`.
   * Cancelación en término con resultado `cargo_aplicado: 0` y estado `SIN_CARGO`.
   * Cancelación tardía verificando el cálculo exacto del 30% de penalidad y estado `CARGO_APLICADO`.
   * Simulación de corte de conexión HTTP arrojando error estandarizado `503 Dependencia no disponible`.
2. **`tests/integration/reservationLifecycle.test.ts`:**
   * Cancelación regular con 4 horas de anticipación: historial refleja `cancelacionTardia: false` y cargo `$0`.
   * Cancelación tardía con 40 minutos de anticipación: historial refleja `cancelacionTardia: true` y cargo del 30% sobre la cotización inicial.

