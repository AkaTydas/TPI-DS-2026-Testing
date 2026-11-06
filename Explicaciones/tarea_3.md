# Tarea 3: Eliminación de Fallbacks Silenciosos y Manejo Robusto de Dependencias Externas (RFC 7807 / 503)

## 1. Resumen de la Tarea
El objetivo de esta tarea es eliminar el antipatrón arquitectónico de **"fallback silencioso a mock"** en las integraciones externas del módulo **M9 (Reservas de Viajes)** (UTN FRRe TP1 - Grupo 8), asegurando el cumplimiento de la especificación **RFC 7807 (Problem Details)**, la consistencia transaccional y la observabilidad del ecosistema distribuido.

Se intervinieron los clientes HTTP encargados de comunicarse con los microservicios externos:
1. **M2 (Clientes):** Se discrimina con precisión entre un cliente inexistente (`404 Cliente no encontrado`) y una falla de infraestructura (`503 Dependencia no disponible`).
2. **M4 (Ubicaciones):** Ante la caída de validación geográfica y cálculo de distancias, se interrumpe el flujo emitiendo error `503`.
3. **M5 (Despacho):** Ante la imposibilidad de activar la solicitud en el módulo de despacho, se aborta la operación con `503`, erradicando el riesgo crítico de crear "reservas fantasma".
4. **M7 (Tarifas):** Ante la falla de cotización de tarifas, se aborta con `503`.
5. **M8 (Notificaciones):** Se preserva su carácter no bloqueante (`fire-and-forget`) por regla de negocio explícita (una falla en el envío de una notificación no debe abortar la reserva).

Asimismo, se incorporó una suite completa de pruebas unitarias automatizadas con **Jest** para validar formalmente ambos estados: ejecución aislada con mocks y comportamiento ante fallas de red/dependencias caídas.

---

## 2. Comandos Paso a Paso

### Paso A: Modificar los clientes en `src/clients/`
Actualizar los métodos de llamada externa en `m2Client.ts`, `m4Client.ts`, `m5Client.ts` y `m7Client.ts`. Cuando `config.services.useExternalMocks` esté en `false` y la llamada HTTP falle, se debe lanzar un `AppError` con status `503`:

```typescript
// Patrón de manejo robusto aplicado en los clientes (ejemplo M4):
try {
  const response = await HttpClient.request<M4ValidarEstimarResponse>(url, {
    method: 'POST',
    body: data,
    requestId
  });
  return response;
} catch (err: unknown) {
  if (config.services.useExternalMocks) {
    return this.mockValidarYEstimar(data);
  }
  throw new AppError({
    status: 503,
    title: 'Dependencia no disponible',
    detail: `El Módulo de Ubicación (M4) no respondió: ${(err as Error).message}`
  });
}
```

### Paso B: Ejecutar y verificar las pruebas unitarias
Ejecutar las pruebas unitarias específicas de los clientes:

```bash
# Correr las pruebas unitarias de los clientes corregidos
npm test tests/unit/m2Client.test.ts tests/unit/m4Client.test.ts tests/unit/m5Client.test.ts

# Correr toda la suite de pruebas del proyecto (unitarias + integración)
npm test
```

### Paso C: Confirmar los cambios en Git desde la terminal
Siguiendo las buenas prácticas de versionado por consola:

```bash
# 1. Verificar el estado de los archivos tocados
git status

# 2. Crear una rama de funcionalidad/fix para aislar el trabajo
git switch -c fix/eliminar-fallbacks-silenciosos

# 3. Preparar los clientes y los nuevos tests en el Staging Area
git add src/clients/ tests/unit/

# 4. Registrar el commit con mensaje semántico
git commit -m "fix: elimina fallback silencioso en M2, M4, M5 y M7 reemplazandolo por 503 (RFC 7807)"
```

### Paso D: Subir la rama a GitHub
```bash
git push -u origin fix/eliminar-fallbacks-silenciosos
```

---

## 3. Justificación Técnica: ¿Por qué se hizo cada paso?

### A. ¿Qué es un "fallback silencioso" y por qué es un antipatrón en microservicios?
* **Ocultamiento de fallas graves:** Cuando un servicio externo falla o está apagado y el código local atrapa el error con un `try/catch` para devolver datos inventados (mock), el sistema simula falsamente que todo funciona bien.
* **El peligro crítico de las "Reservas Fantasma" (El caso de M5 Despacho):**
  * Si un cliente reservaba un viaje y el servicio de despacho (M5) estaba caído, el fallback silencioso generaba un identificador simulado `sol-m5-reserva-xxxx`.
  * La base de datos de reservas marcaba el viaje como confirmado y la API le respondía `201 Created` al usuario.
  * **Consecuencia real:** El usuario esperaba su auto en la calle, pero ningún chofer ni móvil fue jamás despachado en la vida real.
* **Pérdida de observabilidad:** Los errores no escalaban a los tableros de monitoreo ni al middleware de errores, quedando reducidos a un simple `console.warn` en los logs del servidor.

### B. ¿Por qué devolver código HTTP 503 (Service Unavailable) y formato RFC 7807?
* **Semántica HTTP precisa (503):** El código 503 comunica al consumidor que el servidor no puede procesar la solicitud en ese momento debido a que una dependencia externa requerida aguas abajo (upstream service) se encuentra inaccesible o sobrecargada.
* **Estándar RFC 7807 (Problem Details):** La cátedra exige que todas las respuestas de error utilicen el encabezado `Content-Type: application/problem+json` y un cuerpo estructurado:
  ```json
  {
    "type": "https://api.reservas.frre.utn.edu.ar/errors/dependencia-no-disponible",
    "title": "Dependencia no disponible",
    "status": 503,
    "detail": "El Módulo de Ubicación (M4) no respondió: ECONNREFUSED 127.0.0.1:8084",
    "instance": "/reservas"
  }
  ```
* **Integración con el middleware centralizado:** Al arrojar `AppError`, el middleware [`errorHandler.ts`](file:///c:/Users/mateo/OneDrive/Documentos/GitHub/2026-08-TPI/src/middlewares/errorHandler.ts) captura la excepción y genera la respuesta estandarizada automáticamente, sin ensuciar la lógica de negocio.

### C. ¿Por qué el Módulo 2 (Clientes) conserva el código 404 además del 503?
* **Diferenciación entre error de negocio vs error de infraestructura:**
  * Si M2 responde `404 Not Found`, significa que el microservicio de clientes está sano y funcionando, pero verificó que el `clienteId` provisto no existe en el padrón -> Corresponde `404 Cliente no encontrado`.
  * Si la conexión con M2 no se puede establecer (`ECONNREFUSED`, timeout, 500) -> Corresponde `503 Dependencia no disponible`.
* Confundir una caída del servidor con un cliente inexistente daría un falso diagnóstico y violaría el principio de transparencia de la API.

### D. ¿Por qué el Módulo 8 (Notificaciones) NO lanza 503 y mantiene su fallback?
* **Operación secundaria (Fire-and-Forget):** En el ciclo de vida de una reserva, la notificación al usuario (push, email o SMS) es un efecto secundario deseable pero no transaccional.
* **Regla de negocio explícita:** Si el sistema de mensajería M8 se encuentra degradado, la reserva ya confirmada no debe anularse ni revertirse. Abortar una reserva válida porque falló un mail causaría un perjuicio mayor al usuario que procesar el viaje y reintentar el aviso en segundo plano.

---

## 4. Consideraciones de Validación y Cobertura
* **Aislamiento en pruebas con `jest.spyOn`:** Mediante Jest se intercepta `HttpClient.request`, permitiendo simular errores de red reales (`ECONNREFUSED`, timeouts) de manera determinística, sin requerir que los 5 microservicios del ecosistema estén corriendo en la máquina local.
* **Conmutación transparente (`useExternalMocks`):** La variable de configuración permite desarrollar localmente sin dependencias externas cuando está en `true`, pero valida estrictamente la salud de la red cuando se pasa a entornos de prueba o producción con `false`.

