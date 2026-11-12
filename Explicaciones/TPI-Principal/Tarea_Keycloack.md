# Explicación de la Tarea: Integración de Autenticación con Keycloak y Resolución de Roles Backend (M9 - Reservas de Viajes)

## 1. Análisis de Consigna y Corroboración con `2026-TPI`

### ¿Se contradice con la consigna de `2026-TPI`?
**No, no se contradice.** Al contrario, la tarea resuelve una discrepancia crítica entre los contratos preliminares y la configuración real del Keycloak oficial de la cátedra provista en `../2026-TPI/keycloak/realm-config/ds-2026-realm.json`.

Al auditar la configuración oficial del realm `ds-2026-realm`:
1. **Roles de Realm para Backend:** La cátedra definió explícitamente los roles de servicio con el sufijo `-be`:
   - `clientes-be` (Backend de M2: Clientes)
   - `conductores-be` (Backend de M3: Conductores y Vehículos)
   - `ubicacion-be` (Backend de M4: Ubicación y Disponibilidad)
   - `solicitud-be` (Backend de M5: Solicitud y Despacho)
   - `viajes-be` (Backend de M6: Viajes y Ciclo de Vida)
   - `tarifas-be` (Backend de M7: Tarifas, Pagos y Liquidaciones)
   - `notificaciones-be` (Backend de M8: Notificaciones, Documentos y Soporte)
   - `reservas-be` (Backend de M9: Reservas de Viajes)
2. **Cuentas de Servicio (M2M):** Cada cliente (`grupo-01` a `grupo-17`) tiene configurado un usuario de cuenta de servicio (`serviceAccountClientId`) con su correspondiente rol de backend (ej. `service-account-grupo-08` y `service-account-grupo-09` tienen asignado el rol `reservas-be`; `service-account-grupo-04` tiene `solicitud-be`).
3. **Ausencia del rol `SERVICIO`:** En el Keycloak de la cátedra **no existe** ningún rol denominado `SERVICIO`. Dicho rol era un marcador de posición previo (mock preliminar) que generaba rechazos de autorización en vivo al interactuar con servicios externos reales.

---

## 2. Problemas Detectados y Soluciones Aplicadas

### Problema 1: Conflicto de roles de servicio (Tokens Machine-to-Machine)
* **Causa:** El código de rutas y middlewares exigía estrictamente la cadena literal `'SERVICIO'`, mientras que los tokens emitidos por Keycloak para comunicación inter-servicios contenían roles como `reservas-be`, `solicitud-be` o `clientes-be`.
* **Solución:** Se centralizó el reconocimiento de roles de servicio mediante helpers reutilizables y se adaptó `requireRoles` para que cualquier endpoint que permita servicio acepte tanto los roles oficiales de Keycloak (`*-be`) como el rol legacy `'SERVICIO'`.

### Problema 2: Falso rechazo 403 en `ReservationController.listar` / `listarPorCliente`
* **Causa:** Al consultar `GET /reservas?clienteId=1` autenticado como servicio backend (`reservas-be`), el middleware autenticaba el token correctamente. Sin embargo, en la capa de servicio se evaluaba:
  ```typescript
  const esAdmin = user.roles.includes('OPERADOR') || user.roles.includes('SERVICIO');
  if (!esAdmin && user.sub !== clienteId) {
    throw new AppError({ status: 403, title: 'Acceso no autorizado', detail: 'No tiene permisos para ver las reservas de otro cliente' });
  }
  ```
  Como el token del backend de Keycloak tiene `roles: ['reservas-be']` y un `sub` correspondiente a la cuenta de servicio (ej. `service-account-grupo-08`), no coincidía con `clienteId="1"` ni con `'SERVICIO'`, provocando un falso 403 Forbidden.
* **Solución:** Se implementó `isAuthorizedPrivilegedUser(user)`, que otorga permisos de consulta y operación sobre cualquier cliente a usuarios con rol `OPERADOR`, `ADMIN` o cualquier rol de servicio (`*-be` o `SERVICIO`). Los clientes humanos regulares continúan estando estrictamente restringidos a su propio identificador (`user.sub === clienteId`).

---

## 3. Arquitectura y Funcionamiento Técnico

### 3.1. Helpers Centralizados en `src/middlewares/auth.ts`

Se definieron e integraron las siguientes funciones para desacoplar la lógica de permisos:

```typescript
export const SERVICE_ROLES: string[] = [
  'SERVICIO',
  'reservas-be',
  'clientes-be',
  'solicitud-be',
  'conductores-be',
  'ubicacion-be',
  'viajes-be',
  'tarifas-be',
  'notificaciones-be'
];

export const isServiceRole = (role: string): boolean => {
  if (!role || typeof role !== 'string') return false;
  const normalized = role.trim().toLowerCase();
  return (
    normalized === 'servicio' ||
    normalized.endsWith('-be') ||
    SERVICE_ROLES.some((sr) => sr.toLowerCase() === normalized)
  );
};

export const isServiceUser = (user?: JwtUserPayload): boolean => {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => isServiceRole(role));
};

export const isAuthorizedPrivilegedUser = (user?: JwtUserPayload): boolean => {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => {
    const normalized = role.trim().toLowerCase();
    return (
      normalized === 'operador' ||
      normalized === 'admin' ||
      normalized === 'administrador' ||
      isServiceRole(role)
    );
  });
};
```

### 3.2. Middleware `requireRoles` Tolerante y Polimórfico

El middleware `requireRoles(allowedRoles)` ahora opera en dos niveles:
1. **Acceso de Servicio:** Si la ruta requiere un rol de servicio (ej. `'SERVICIO'`, `'reservas-be'`, etc.) y el usuario entrante posee cualquier rol de servicio válido (según `isServiceUser`), se autoriza automáticamente el acceso.
2. **Acceso por Rol Específico:** Para roles no de servicio (ej. `'CLIENTE'`, `'CONDUCTOR'`), se compara de forma case-insensitive contra la lista permitida.

### 3.3. Rutas de Reservas (`src/routes/reservationRoutes.ts`)

Se actualizaron los contratos de permisos de cada endpoint para reflejar los roles autorizados:
- **`POST /` (Crear reserva):** `['CLIENTE', 'OPERADOR', 'SERVICIO', 'reservas-be', 'clientes-be']`
- **`GET /` (Listar reservas por cliente):** `['CLIENTE', 'OPERADOR', 'SERVICIO', 'reservas-be', 'clientes-be']`
- **`GET /:id` (Consultar por ID):** `['CLIENTE', 'CONDUCTOR', 'OPERADOR', 'SERVICIO', 'reservas-be', 'clientes-be', 'solicitud-be']`
- **`PATCH /:id` (Modificar reserva):** `['CLIENTE', 'OPERADOR', 'SERVICIO', 'reservas-be', 'clientes-be']`
- **`POST /:id/cancelar` (Cancelar reserva):** `['CLIENTE', 'OPERADOR', 'SERVICIO', 'reservas-be', 'clientes-be']`
- **`GET /:id/historial` (Consultar historial):** `['CLIENTE', 'OPERADOR', 'SERVICIO', 'reservas-be', 'clientes-be']`
- **`POST /:id/activar` (Activar en despacho):** `['OPERADOR', 'SERVICIO', 'reservas-be', 'solicitud-be']`
- **`POST /:id/despacho` (Callback de M5):** `['SERVICIO', 'solicitud-be', 'reservas-be']`

### 3.4. Servicios de Negocio (`ReservationService` y `ActivationService`)

- En `crearReserva`, `listarPorCliente`, `obtenerPorId` y `activarReserva`, se reemplazó la validación estática `roles.includes('OPERADOR') || roles.includes('SERVICIO')` por `isAuthorizedPrivilegedUser(user)`.
- Si un usuario privilegiado o de servicio backend consulta o crea recursos, se le permite actuar sin requerir que su `sub` coincida con el `clienteId`.
- Si un cliente humano (`CLIENTE`) intenta consultar o crear para otro cliente, se rechaza de inmediato con HTTP 403 (`NO_AUTORIZADO`) según RFC 7807.

---

## 4. Detalle de Archivos Modificados

| Archivo | Modificación |
| :--- | :--- |
| `src/types/auth.ts` | Se ampliaron los literales de `UserRole` para incluir `'reservas-be'`, `'clientes-be'`, `'solicitud-be'` y `(string & {})`. |
| `src/middlewares/auth.ts` | Se implementaron los helpers `SERVICE_ROLES`, `isServiceRole`, `isServiceUser`, `isAuthorizedPrivilegedUser` y se actualizó `requireRoles`. |
| `src/routes/reservationRoutes.ts` | Se declararon los roles de servicio de Keycloak en cada endpoint. |
| `src/services/reservationService.ts` | Se adoptó `isAuthorizedPrivilegedUser` para evitar el falso 403 al listar, crear o consultar reservas. |
| `src/services/activationService.ts` | Se adoptó `isAuthorizedPrivilegedUser` para permitir activación por parte de `reservas-be` u `OPERADOR`. |
| `src/services/schedulerService.ts` | Se asignó `roles: ['reservas-be', 'SERVICIO']` al `SYSTEM_USER`. |
| `src/clients/serviceToken.ts` | Se actualizó la generación de tokens salientes de M9 incluyendo `roles: ['reservas-be', 'SERVICIO']`. |
| `tests/integration/reservationLifecycle.test.ts` | Se agregaron tests de listado para `reservas-be`, `clientes-be`, `OPERADOR` y verificación de rechazo 403 para clientes ajenos. |
| `tests/integration/activationAndWebhook.test.ts` | Se probaron activación con `reservas-be` y callback de despacho con `solicitud-be`. Se dinamizaron los `solicitud_id` para evitar colisiones con la restricción UNIQUE de la base de datos. |
| `tests/unit/authMiddleware.test.ts` | Se agregaron pruebas unitarias para `isServiceRole`, `isServiceUser`, `isAuthorizedPrivilegedUser` y para `requireRoles` con roles `*-be`. |
| `tests/unit/schedulerService.test.ts` | Se actualizó la aserción de llamada del scheduler para verificar el rol `reservas-be`. |

---

## 5. Resultados de Verificación y Pruebas

### Compilación TypeScript (`npm run build`)
```bash
> tsc
# 0 errores de tipado (exit code 0)
```

### Suite Completa de Tests (`npm test`)
```bash
Test Suites: 11 passed, 11 total
Tests:       79 passed, 79 total
Snapshots:   0 total
Time:        3.383 s
Ran all test suites.
```

- **Cobertura total:** 79/79 pruebas aprobadas en las 11 suites.
- **Cero regresiones:** Se mantienen operativas todas las reglas de negocio, ciclo de vida, idempotencia, auditoría y ventanas de anticipación, con soporte pleno para la autenticación oficial de Keycloak.
