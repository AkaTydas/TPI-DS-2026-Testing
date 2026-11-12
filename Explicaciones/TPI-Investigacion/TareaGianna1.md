# Tarea Gianna 1: Blindaje Atómico de Idempotencia y Prevención de Doble Cobro (Anti-TOCTOU)
**Cátedra:** Desarrollo de Software — UTN Facultad Regional Resistencia (2026)  
**Grupo:** 8 (10 Integrantes) — **Módulo:** M9 (Reservas de Viajes)  
**Temas:** Tema 11 (Consistencia: Saga) & Tema 12 (Persistencia: Database per Service)

---

## 1. Resumen de la Tarea

En esta tarea se resolvió la vulnerabilidad crítica de **Time-of-Check to Time-of-Use (TOCTOU)** en el mecanismo de idempotencia de la Saga de Activación de Reservas.

Se transformó el guardado pasivo de claves (que ocurría al final del flujo) en un **Candado Atómico de Reserva Previa** al inicio del orquestador. Con esta mejora:
1. Cualquier petición concurrente simultánea que use la misma `Idempotency-Key` es frenada en seco en 0 ms.
2. Se responde inmediatamente con **`HTTP 409 Conflict`** (*"Operación en proceso"*).
3. Se garantiza matemáticamente que el subsistema financiero (M7) **nunca retenga fondos duplicados en la tarjeta del cliente**.

---

## 2. Fundamentación Teórica (Auditoría de Gianna)

En el documento de soporte técnico [`Investigacion/InvestigaciónTpp.md`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Investigacion/Investigaci%C3%B3nTpp.md) (Sección 4: *Idempotencia y Semántica de Mensajería*), se establece que en redes distribuidas los mensajes pueden duplicarse debido a reintentos automáticos de clientes o retardos de red (*At-Least-Once Delivery*).

### La Vulnerabilidad Detectada (TOCTOU):
El código original de la demo realizaba:
```text
[Inicio Petición] ──> ¿Existe clave? (No) ──> Llamar a M7 ($) ──> Llamar a M5 ──> Guardar clave [Fin]
```
Si dos peticiones entraban simultáneamente separadas por menos de 50 ms (lo que tarda una llamada de red normal a M7):
1. La Petición A chequeaba la base $\to$ Clave no encontrada.
2. La Petición B chequeaba la base $\to$ Clave no encontrada.
3. Ambas pasaban y ejecutaban $T_2$ en M7 $\to$ **Doble retención de saldo para el mismo viaje**.

---

## 3. Implementación Paso a Paso de la Solución

### Paso A: Tipado en `src/domain/types.ts`
Se incorporó el tipo `EstadoIdempotencia` para modelar el ciclo de vida de la solicitud:
```typescript
export type EstadoIdempotencia = 'EN_PROCESO' | 'COMPLETADO';

export interface RegistroIdempotencia {
  clave: string;
  estado: EstadoIdempotencia;
  codigoEstado: number | null;
  cuerpoRespuesta: string | null;
  creadoEn: string;
}
```

### Paso B: Esquema SQLite en `src/config/database.ts`
Se agregó la columna `estado` en la tabla `idempotencia`:
```sql
CREATE TABLE IF NOT EXISTS idempotencia (
  clave TEXT PRIMARY KEY,
  estado TEXT NOT NULL DEFAULT 'COMPLETADO',
  codigo_estado INTEGER,
  cuerpo_respuesta TEXT,
  creado_en TEXT NOT NULL
);
```

### Paso C: Repositorio Atómico en `src/repositories/idempotencyRepository.ts`
Se implementó el método `intentarReservar`:
```typescript
public static intentarReservar(clave: string): {
  exito: boolean;
  estado: EstadoIdempotencia;
  registro?: RegistroIdempotencia;
} {
  const ahora = new Date().toISOString();
  try {
    const stmt = dbM9.prepare(`
      INSERT INTO idempotencia (clave, estado, codigo_estado, cuerpo_respuesta, creado_en)
      VALUES (?, 'EN_PROCESO', 0, '', ?)
    `);
    stmt.run(clave, ahora);
    return { exito: true, estado: 'EN_PROCESO' };
  } catch (err) {
    // Si la clave ya existe (colisión Primary Key), detectamos su estado actual
    const existente = this.buscar(clave);
    if (existente && existente.estado === 'COMPLETADO') {
      return { exito: false, estado: 'COMPLETADO', registro: existente };
    }
    return { exito: false, estado: 'EN_PROCESO', registro: existente };
  }
}
```
Y los métodos complementarios:
* `completar(clave, codigo, cuerpo)`: pasa el estado a `'COMPLETADO'` al finalizar la Saga con éxito o fallo compensado.
* `liberar(clave)`: elimina el registro `'EN_PROCESO'` si la petición arrojó un error 404 antes de mutar el sistema.

### Paso D: Orquestador en `src/saga/activationSagaOrchestrator.ts`
En el punto de entrada de la Saga, se evalúa el candado atómico:
```typescript
// 0. Control de Idempotencia estricta con Candado Atómico Anti-TOCTOU (RF-9.10)
const candadoIdempotencia = IdempotencyRepository.intentarReservar(idempotencyKey);

if (!candadoIdempotencia.exito) {
  if (candadoIdempotencia.estado === 'COMPLETADO' && candadoIdempotencia.registro?.cuerpoRespuesta) {
    Logger.warn(`[IDEMPOTENCIA] Solicitud ya procesada. Retornando caché.`, requestId);
    return JSON.parse(candadoIdempotencia.registro.cuerpoRespuesta) as ResultadoSaga;
  }
  // Colisión concurrente: frenado inmediato
  Logger.warn(`[IDEMPOTENCIA] Solicitud concurrente en proceso. Rechazando con HTTP 409 Conflict.`, requestId);
  throw new AppError(
    409,
    'Operación en proceso',
    `Una solicitud con la clave de idempotencia "${idempotencyKey}" ya se encuentra en procesamiento activo.`
  );
}
```

---

## 4. Evidencia Técnica y Verificación Empírica

Para verificar la solución, se ejecutó una prueba de estrés con dos peticiones simultáneas (`Promise.all`) contra la misma reserva simulando 30 ms de latencia en la llamada a M7:

### Logs del Servidor:
```text
[INFO] [ReqId: req-9b7a] ========== INICIANDO SAGA DE ACTIVACIÓN (Reserva: res-f103ac98) ==========
[SAGA] [req-9b7a] [T1 | M9] Reserva transicionada a EN_PROCESO_DESPACHO en db_m9 -> OK
[INFO] [ReqId: req-e4c3] ========== INICIANDO SAGA DE ACTIVACIÓN (Reserva: res-f103ac98) ==========
[WARN] [ReqId: req-e4c3] [IDEMPOTENCIA] Solicitud concurrente en proceso para la clave key-concurrente-real. 
                         Rechazando con HTTP 409 Conflict. 🛑
[SAGA] [req-9b7a] [Tc | M7] Retención de fondos de $3000.00 (TX: tx-7e0cab1b) -> OK
[SAGA] [req-9b7a] [Tp | M5] Transacción Pivotante Superada: Chofer Hernán Fernández asignado -> OK
[OK]   [ReqId: req-9b7a] ========== SAGA FINALIZADA EXITOSAMENTE ==========
```

### Estado en `m7_pagos.db` tras la ejecución:
| ID Transacción | Reserva ID | Monto Retenido | Estado |
| :--- | :--- | :---: | :---: |
| `tx-7e0cab1b` | `res-f103ac98` | **$3000.00** | `PRE_AUTORIZADO` |

> **Resultado:** Exactamente 1 sola transacción financiera creada. Se evitó el cobro duplicado de $6000.00.

---

## 5. Demostración en Vivo para el Coloquio

Si durante la defensa docente se desea mostrar la importancia de este mecanismo:
1. Abrir [`src/saga/activationSagaOrchestrator.ts`](file:///home/ArchTydas/UTN/3ro/Desarrollo/Extras-TPI/TPI-DS-2026-Testing/Implementacion/src/saga/activationSagaOrchestrator.ts#L34-L47).
2. Comentar las líneas de `if (!candadoIdempotencia.exito) { ... }`.
3. Ejecutar `node scripts/test-reproducir-fallas.js` $\to$ Demostrar cómo se crean 2 transacciones en `m7_pagos.db` por TOCTOU.
4. Descomentar el bloque $\to$ Demostrar cómo el candado atómico devuelve `HTTP 409` y preserva la consistencia.

