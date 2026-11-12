# Tarea 4: Corrección de Permisos del Rol CONDUCTOR en Consulta de Reserva

## 1. Resumen del Problema
En el contrato de la API y en las rutas de Express (`src/routes/reservationRoutes.ts`), el endpoint `GET /reservas/:id` está configurado para autorizar a cuatro roles:
* `CLIENTE`
* `CONDUCTOR`
* `OPERADOR`
* `SERVICIO`

Sin embargo, al descender a la capa de servicio de negocio (`src/services/reservationService.ts`, método `obtenerPorId`), existía un **bug lógico de autorización** que provocaba que cualquier conductor recibiera un código **`403 Forbidden`** (*Acceso no autorizado*) al intentar ver el viaje asignado.

---

## 2. El Porqué del Bug (Análisis del Código)

### El Código Anterior (Con Error):
```typescript
// En src/services/reservationService.ts (línea 185 aprox)
const esAdmin = user.roles.includes('OPERADOR') || user.roles.includes('SERVICIO');
if (!esAdmin && user.sub !== reserva.clienteId) {
  throw new AppError({
    status: 403,
    title: 'Acceso no autorizado',
    detail: 'No tiene permisos para ver esta reserva'
  });
}
```

### ¿Por qué fallaba?
1. Un chofer tiene `roles: ['CONDUCTOR']` y un identificador propio (`user.sub = 'chofer_marcos_01'`).
2. La variable `esAdmin` evaluaba únicamente `OPERADOR` o `SERVICIO`, por lo que para el chofer daba `false`.
3. La condición del `if` evaluaba:
   `!esAdmin` (Verdadero) **Y** `user.sub !== reserva.clienteId` (Verdadero, porque el chofer no es el pasajero).
4. Resultado: El sistema arrojaba un `AppError` con estado `403`, impidiendo al chofer consultar el destino, origen o detalles de la reserva.

---

## 3. La Solución Aplicada

Se amplió la condición de acceso para incluir explícitamente al rol `CONDUCTOR`:

```typescript
// Corrección aplicada en src/services/reservationService.ts
const esAdmin = 
  user.roles.includes('OPERADOR') || 
  user.roles.includes('SERVICIO') || 
  user.roles.includes('CONDUCTOR');

if (!esAdmin && user.sub !== reserva.clienteId) {
  throw new AppError({
    status: 403,
    title: 'Acceso no autorizado',
    detail: 'No tiene permisos para ver esta reserva'
  });
}
```

### ¿Por qué esta solución es correcta?
* **Clientes:** Siguen teniendo acceso restringido exclusivamente a **sus propias reservas** (`user.sub === reserva.clienteId`). Si un cliente intenta ver la reserva de otra persona, el `if` sigue disparando `403`.
* **Conductores, Operadores y Servicios:** Poseen visibilidad operativa para inspeccionar los datos del viaje que deben despachar, atender o auditar.
* **Consistencia:** Alinea la capa de servicios con lo pactado en `reservationRoutes.ts` y en `openapi.yaml`.

---

## 4. Verificación Realizada

1. Se creó una reserva con un token de `CLIENTE` (`sub: cliente_001`).
2. Se generó un token firmado con rol `CONDUCTOR` y un ID ajeno (`sub: chofer_marcos_01`).
3. Se consumió el endpoint `GET /reservas/{id}` en Swagger UI con el token del chofer.
4. **Resultado obtenido:** Código **`200 OK`** con el JSON completo de la reserva.

