# Guía de Pruebas de Integración Real (6 Módulos en Docker Local)

Esta carpeta contiene los **4 archivos** necesarios para levantar en local el stack completo de integración real con **M9 (Grupo 8)** hablando contra las implementaciones reales de los otros 5 módulos (sin modificar ninguna línea de sus repositorios):

- `docker-compose.pruebas.yml` — Orquesta los 6 servicios, sus bases de datos, Redis, RabbitMQ, Mailpit y `jwks-mock`.
- `Dockerfile.m5` — Imagen Docker para M5 (Grupo 4), cuyo repo no trae Dockerfile.
- `jwks-mock-integracion.js` — Emisor RS256 local (reemplaza a Keycloak M1 en local) compatible con M2, M5, M8 y M9.
- `seed-integracion.sh` — Verifica el `/health` de los 6 módulos, crea clientes de prueba en M2 y reglas activas de tarifa en M7, e imprime JWTs listos para pegar en el frontend.

---

## 1. Requisitos previos

- **Docker** + **Docker Compose** (`docker compose version`)
- **Git**, **curl**, **bash** y **Node.js** (usado por `seed-integracion.sh` para parsear los JWT)
- RAM recomendada: ~4 GB libres (levanta 15 contenedores en simultáneo)

---

## 2. Estructura de carpetas necesaria

Para no mezclar los repos clonados dentro de `TPI-DS-2026-Testing`, armá una carpeta de trabajo aparte (por ejemplo `~/TPI-Integracion/`) con esta estructura exacta (porque `docker-compose.pruebas.yml` busca nuestro M9 en `../2026-08-TPI`):

```text
~/TPI-Integracion/
├── 2026-08-TPI/                  # Nuestro M9 (en rama integracion/contratos-reales)
└── Pruebas-Integracion/          # Copiá acá los 4 archivos de esta carpeta
    ├── docker-compose.pruebas.yml
    ├── Dockerfile.m5
    ├── jwks-mock-integracion.js
    ├── seed-integracion.sh
    ├── 2026-01-TPI/              # M2 — Clientes (Grupo 1)
    ├── 2026-04-TPI/              # M5 — Solicitud y Despacho (Grupo 4)
    ├── 2026-06-TPI/              # M7 — Tarifas y Pagos (Grupo 6)
    ├── 2026-10-TPI/              # M8 — Notificaciones (Grupo 10)
    └── 2026-14-TPI/              # M4 — Ubicación y Disponibilidad (Grupo 14)
```

---

## 3. Paso a paso para clonar y preparar todo

```bash
# 1. Crear carpeta de trabajo
mkdir -p ~/TPI-Integracion/Pruebas-Integracion
cd ~/TPI-Integracion

# 2. Clonar nuestro M9 y pasarse a la rama de integración real
git clone https://github.com/FRRe-DS/2026-08-TPI.git
cd 2026-08-TPI
git fetch origin
git checkout integracion/contratos-reales
cd ..

# 3. Copiar los 4 archivos desde TPI-DS-2026-Testing/Pruebas/ hacia Pruebas-Integracion/
# (Ajustar la ruta origen según dónde tengas clonado TPI-DS-2026-Testing)
cp /ruta/a/TPI-DS-2026-Testing/Pruebas/{docker-compose.pruebas.yml,Dockerfile.m5,jwks-mock-integracion.js,seed-integracion.sh} ~/TPI-Integracion/Pruebas-Integracion/
chmod +x ~/TPI-Integracion/Pruebas-Integracion/seed-integracion.sh

# 4. Clonar los 5 módulos externos reales dentro de Pruebas-Integracion/
cd ~/TPI-Integracion/Pruebas-Integracion
git clone https://github.com/FRRe-DS/2026-01-TPI.git   # M2 — Clientes (Grupo 1)
git clone https://github.com/FRRe-DS/2026-04-TPI.git   # M5 — Despacho (Grupo 4)
git clone https://github.com/FRRe-DS/2026-06-TPI.git   # M7 — Tarifas (Grupo 6)
git clone https://github.com/FRRe-DS/2026-10-TPI.git   # M8 — Notificaciones (Grupo 10)
git clone https://github.com/FRRe-DS/2026-14-TPI.git   # M4 — Ubicación (Grupo 14)
```

> **Importante:** No clones los `2026-*-TPI` dentro del repositorio `TPI-DS-2026-Testing` para no ensuciarlo ni subir código de otros grupos por error.

---

## 4. Levantar los 6 módulos y cargar los datos iniciales

```bash
cd ~/TPI-Integracion/Pruebas-Integracion

# Compilar imágenes y levantar todo en segundo plano (la 1ra vez tarda ~3-5 min)
docker compose -f docker-compose.pruebas.yml up --build -d

# Verificar que todos los contenedores estén Up / healthy
docker compose -f docker-compose.pruebas.yml ps
```

Esperá ~15 segundos a que MySQL (M5) y Postgres (M8) terminen `prisma db push` y corré el script de seed:

```bash
./seed-integracion.sh
```

El script debe devolver:
- **7/7 servicios en `HTTP 200`** (`jwks-mock`, M2, M4, M5, M7, M8 y M9).
- **Clientes de prueba en M2 en `HTTP 201`**:
  - Activo: `11111111-1111-4111-8111-111111111111`
  - Bloqueado: `22222222-2222-4222-8222-222222222222`
- **Reglas activas `auto` y `moto` en M7 en `HTTP 201`** (sin estas reglas M7 responde `422`).
- **3 tokens JWT RS256** impresos en pantalla (`CLIENTE ACTIVO`, `CLIENTE BLOQUEADO` y `OPERADOR`) listos para copiar y pegar.

---

## 5. Puertos y URLs disponibles

| Servicio | URL | Para qué sirve |
| :--- | :--- | :--- |
| **M9 — Frontend + API (Grupo 8)** | http://localhost:8089/ | Consola web para probar todos los flujos de M9 |
| **M9 — Swagger OpenAPI** | http://localhost:8089/docs | Documentación interactiva de M9 |
| **Mailpit (Bandeja de emails M8)** | http://localhost:8025/ | Ver en vivo los correos HTML que envía M8-G10 |
| **RabbitMQ Management** | http://localhost:15672/ | Consola del broker (`guest` / `guest`, exchange `reservas.events`) |
| **JWKS Mock (M1 local)** | http://localhost:8080/health | Emisión de JWT (`GET /token?sub=...&roles=...`) |
| **M2 — Clientes (Grupo 1)** | http://localhost:8082/docs | Swagger real de M2 |
| **M4 — Ubicación (Grupo 14)** | http://localhost:8084/docs | Swagger real de M4 |
| **M5 — Despacho (Grupo 4)** | http://localhost:8085/health/ready | API real de M5 |
| **M7 — Tarifas (Grupo 6)** | http://localhost:8087/docs | Swagger real de M7 |
| **M8 — Notificaciones (Grupo 10)** | http://localhost:8088/api/v1/health | API real de M8 |

---

## 6. Checklist rápido de pruebas en vivo

Abrí **http://localhost:8089/** y probá en orden:

1. **Integración `M9 → M2 + M4 + M7 + M8`:**
   - Pegá el **`JWT CLIENTE ACTIVO`** en la sección 1.
   - En la sección 2 dejá `+2 hs (normal)` y tocá **`POST /reservas`**.
   - **Esperado:** `HTTP 201`, estado `CONFIRMADA` y `tarifaEstimada: 5120 ARS` (calculada por M7-G6 con los `6.8 km / 18 min` de M4-G14).
2. **Notificación real en M8:**
   - Abrí **http://localhost:8025/** (Mailpit).
   - **Esperado:** aparece el correo *"Reserva de viaje confirmada"* generado por M8-G10 con origen, destino e importe `ARS 5120`.
3. **Rechazo por cliente bloqueado en M2:**
   - Pegá el **`JWT CLIENTE BLOQUEADO`** (`22222222-...`), generá una nueva `claveIdempotencia` y tocá **`POST /reservas`**.
   - **Esperado:** M2-G1 responde `BLOQUEADO` y M9 rechaza con **`HTTP 422`**.
4. **Activación real en M5 + Idempotencia (`RF-9.10` / `RNF-08`):**
   - Pegá el **`JWT OPERADOR`**, seleccioná la reserva confirmada del paso 1, andá a la pestaña **Activar & Webhook M5** y apretá **`POST /activar (OPERADOR/SERVICIO)`**.
   - **Esperado:** **`HTTP 200`** con un `solicitudDespachoId` UUID real creado en MySQL de M5-G4.
   - Si volvés a apretar **`POST /activar`**, devuelve `HTTP 200` con **exactamente el mismo `solicitudDespachoId`** sin duplicar la solicitud en M5.
5. **Modificación y cancelación en término:**
   - Creá otra reserva con `+2 hs`, probá `PATCH` cambiando `AUTO` → `MOTO` (recalcula tarifa en M7-G6) y luego `POST /cancelar` (devuelve `SIN_CARGO` y envía email de `RESERVA_CANCELADA` a Mailpit).

> **Nota conocida sobre M7-G6:** hasta la versión actual del repo `2026-06-TPI`, Grupo 6 implementó el cálculo de tarifas (`POST /api/v1/tarifas/estimaciones` anda 100%), pero todavía no subió el router de `POST /api/v1/cargos-cancelacion`. Por eso, una **cancelación tardía** (`+40 min`, menor a la ventana de 60 min) recibirá `404` de M7 hasta que G6 publique ese endpoint.

---

## 7. Logs y apagado

```bash
# Ver logs de un servicio puntual si algo falla
docker compose -f docker-compose.pruebas.yml logs --tail=50 m9-backend
docker compose -f docker-compose.pruebas.yml logs --tail=50 m5-despacho

# Apagar los 15 contenedores y borrar volúmenes temporales de prueba
docker compose -f docker-compose.pruebas.yml down -v
```
