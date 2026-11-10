# Instrucciones de Puesta en Marcha y Demostración
## Guía de Ejecución Paso a Paso — Grupo 8 (UTN FRRe 2026)
**Temas:** Patrón Saga Orquestado & Database per Service

---

## 1. Requisitos Previos

- **Node.js:** Versión 20 o superior (Recomendado: Node.js v24 LTS).
- **npm:** Versión 10 o superior (incluido con Node.js).
- *(Opcional)* **Docker y Docker Compose:** Si se desea ejecutar en contenedor aislado.

---

## 2. Instalación de Dependencias

Desde la terminal, posicionarse en la carpeta de la demo:

```bash
cd demo-investigacion-grupo8
npm install
npm run build
```

---

## 3. Demostración Rápida con un Solo Comando (Recomendada)

Para ejecutar la demostración completa e interactiva con salida visual en consola de ambos escenarios (Éxito y Falla con Compensación), auditoría histórica e idempotencia:

```bash
npm run demo
```

### ¿Qué ejecuta este comando automáticamente?
1. Inicializa las 3 bases de datos aisladas (`data/m9_reservas.db`, `data/m7_pagos.db`, `data/m5_despacho.db`).
2. **Escenario 1 (Flujo Exitoso):** Crea una reserva en M9, ejecuta la Saga, retiene fondos en M7, asigna conductor en M5 y transiciona la reserva a `ACTIVADA`. Muestra el estado final en las 3 bases de datos.
3. **Escenario 2 (Fallo y Rollback Lógico):** Crea una reserva en zona sin cobertura, retiene fondos en M7, detecta la falla de conductores en M5, y **dispara automáticamente las compensaciones** ($C_2 \to C_1$), liberando los fondos en M7 y marcando la reserva como `VENCIDA`.
4. **Evidencia de Auditoría:** Imprime una tabla con el registro inmutable de auditoría en M9 (`historial_reservas`).
5. **Evidencia de Idempotencia:** Reenvía la misma petición con idéntica `Idempotency-Key` y demuestra que la respuesta es devuelta desde caché sin duplicar transacciones.

---

## 4. Pruebas Automatizadas de Aserciones

Si querés correr las suites de test automáticos (con comprobación de aserciones de código y base de datos):

* **Probar solo el Flujo Exitoso:**
  ```bash
  npm run test:success
  ```
* **Probar solo el Flujo con Fallo y Compensación:**
  ```bash
  npm run test:failure
  ```
* **Probar ambas suites juntas:**
  ```bash
  npm run test:all
  ```

---

## 5. Ejecución como Servidor Web Continuo (API en Puerto 8090)

Si preferís dejar el servidor levantado para interactuar manualmente con Postman o cURL:

### Opción A: Ejecución Local en Node
```bash
npm run start:dist
```
El servidor quedará escuchando en `http://localhost:8090`.

### Opción B: Ejecución con Docker Compose
```bash
docker compose up --build -d
```
Para ver los logs en tiempo real:
```bash
docker compose logs -f
```
Para detener los contenedores:
```bash
docker compose down
```

---

## 6. Pruebas Manuales con cURL o Postman

Con el servidor corriendo en `http://localhost:8090`:

### 1. Comprobar Healthcheck
```bash
curl -X GET http://localhost:8090/health
```

### 2. Crear una Reserva en M9
```bash
curl -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: req-curl-01" \
  -d '{
    "clienteId": "cli-123",
    "origen": "Av. Castelli 930",
    "destino": "Campus UTN FRRe",
    "tarifaEstimada": 3500.0
  }'
```
*(Copiá el `id` devuelto en la respuesta, ej.: `res-abc12345`)*.

### 3. Ejecutar la Saga - Escenario Exitoso (`forzarFalloM5: false`)
```bash
curl -X POST http://localhost:8090/reservas/res-abc12345/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-curl-ok-01" \
  -H "X-Request-Id: req-curl-ok-01" \
  -d '{ "forzarFalloM5": false }'
```

### 4. Ejecutar la Saga - Escenario con Fallo y Compensación (`forzarFalloM5: true`)
```bash
# Crear otra reserva
curl -X POST http://localhost:8090/reservas \
  -H "Content-Type: application/json" \
  -d '{ "clienteId": "cli-999", "origen": "Ruta 11", "destino": "Periferia", "tarifaEstimada": 4500.0 }'

# Activar la saga forzando la indisponibilidad de choferes en M5:
curl -X POST http://localhost:8090/reservas/<ID_RESERVA>/activar-saga \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-curl-err-02" \
  -H "X-Request-Id: req-curl-err-02" \
  -d '{ "forzarFalloM5": true }'
```

### 5. Inspección Técnica Multi-Base (Evidencia de Database per Service)
Consultá este endpoint para ver el estado de las 3 bases de datos aisladas en tiempo real:
```bash
curl -X GET http://localhost:8090/inspeccionar-bases
```

### 6. Colección de Postman
En la carpeta `postman/Demo_Saga_Grupo8.postman_collection.json` se encuentra la colección completa para importar en Postman y ejecutar las peticiones con un solo clic.
