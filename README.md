# 📚 Recursos, Extras y Documentación — TPI Grupo 8

Espacio de trabajo centralizado y colaborativo del **Grupo 8** para la materia **Desarrollo de Software (UTN FRRe 2026)**.  
Aquí se gestiona la asignación de tareas, el análisis y soporte técnico del desarrollo del **Módulo 9 (M9 - Reservas de Viajes)** y la investigación práctica con PoC ejecutable sobre **Consistencia (Patrón Saga Orquestado)** y **Persistencia (Database per Service)**.

---

## 👥 Integrantes del Equipo

* **Alcaraz, Fabricio Nahuel** — Legajo: `29192`
* **Benítez, Agustín Nicolas** — Legajo: `28372`
* **Fernández D'Elia, Sol** — Legajo: `29286`
* **López, Gustavo Javier** — Legajo: `28818`
* **Lopez, Mateo Jeremias** — Legajo: `29868`
* **Machuca, Avril Micaela** — Legajo: `29061`
* **Maciel Sanchez, Gabriel Angel** — Legajo: `28872`
* **Rosin, Gianna Florencia** — Legajo: `28951`
* **Salas, Milagros Nadir** — Legajo: `28816`
* **Sanabria Cayre, Ernesto Pablo** — Legajo: `28909`

---

## 📂 Estructura del Repositorio

El repositorio se encuentra organizado de la siguiente manera:

```text
.
├── Documentacion/       # Base documental de investigación sobre la que se fundamentó la PoC
├── Explicaciones/       # Guías técnicas, resoluciones y análisis conceptuales
│   ├── TPI-Principal/   # Tareas, análisis de arquitectura y soporte del desarrollo M9
│   └── TPI-Investigacion/# Manual de la Saga, guion de coloquio, auditorías y hardening
├── Implementacion/      # Código fuente y PoC ejecutable en Node.js / TypeScript
└── Tareas/              # Consignas de cátedra, distribución de tareas y planes de acción
```

---

### 1. `Documentacion/`
Esta carpeta contiene los informes teóricos originales, propuestas de arquitectura y documentos de análisis elaborados durante la etapa de investigación preliminar (tanto en formato Markdown como en los PDFs entregados).

> [!NOTE]
> **¿Por qué se llama `Documentacion/`?**  
> Porque representa la **base documental y bibliográfica en la que se fundamentó y diseñó la implementación práctica**. Todo el bosquejo del flujo de la saga, la definición de las bases aisladas y las reglas de consistencia nacieron de estos documentos previos.

---

### 2. `Explicaciones/`
Centraliza los documentos conceptuales y guías paso a paso generadas por el equipo, divididas en dos grandes ejes:

* **`TPI-Principal/`**:
  * Resoluciones detalladas de las tareas del proyecto principal de desarrollo del Módulo 9 (Tareas 1, 3, 4, 10, etc.).
  * Informes y notas técnicas (análisis de resiliencia y circuit breakers, observaciones de arquitectura, mapeo de endpoints y alineación de commits).
  * Diapositivas y material de apoyo para la defensa del proyecto base.

* **`TPI-Investigacion/`**:
  * **Manual Maestro de Implementación:** Documento exhaustivo del funcionamiento de la Saga Orquestada y el aislamiento de persistencia con SQLite nativo.
  * **Guion de Exposición para 10 Integrantes:** Cronograma de 20 minutos con guion hablado, analogías y respuestas a preguntas trampa del tribunal.
  * **Informe Consolidado:** Resumen unificado de la arquitectura y decisiones de diseño.
  * **Auditorías de Hardening (Tareas Gianna 1 a 4):** Registro técnico de las mejoras de seguridad implementadas (candado atómico anti-TOCTOU, compensación defensiva en $C_2$, control de concurrencia optimista OCC y switches didácticos).

---

### 3. `Implementacion/`
Contiene la **Prueba de Concepto (PoC) real y ejecutable** en Node.js (v24) y TypeScript:
* **Aislamiento real de persistencia:** 3 bases de datos SQLite independientes (`m9_reservas.db`, `m7_pagos.db`, `m5_despacho.db`) sin Foreign Keys cruzadas ni acoplamiento SQL.
* **Orquestador de Saga (`ActivationSagaOrchestrator`):** Máquina de estados con transacciones locales, pivotante ($T_p$) en M5 y rollback compensatorio inverso ($C_2 \to C_1$).
* **Blindaje Concurrente:** Candado atómico en `idempotencia` contra carreras TOCTOU, control de concurrencia optimista (`WHERE estado = 'CONFIRMADA'`) y compensación defensiva con trazabilidad `REQUIERE_RECONCILIACION_MANUAL`.

#### Comandos rápidos para probar la PoC:
```bash
cd Implementacion
npm install
npm run build

# 1. Demostración interactiva completa con tablas visuales
npm run demo

# 2. Tests de aserción funcional (Happy path y Fallo compensado)
npm run test:all

# 3. Suite de blindaje y concurrencia (TOCTOU, OCC y C2)
npm run test:hardening

# 4. Demostración comparativa (vulnerable vs blindado) con switches didácticos
node scripts/test-reproducir-fallas.js
```

---

### 4. `Tareas/`
Gestión organizativa y operativa del equipo:
* Enunciados y pautas formales de cátedra en PDF.
* Tablas de distribución de tareas por integrante para entregas y correcciones.
* Planes de acción para el seguimiento del cronograma.

---

## 💡 Buenas Prácticas del Repositorio

Para mantener el trabajo ordenado y evitar pérdidas de tiempo:

1. **Sincronizar siempre al empezar:** Ejecutar `git pull origin main` antes de iniciar cualquier cambio local para evitar conflictos.
2. **Respetar la ubicación de carpetas:** Colocar cada archivo en la carpeta que le corresponde según sea documentación teórica, explicación técnica, código o tarea organizativa.
3. **Mensajes de commit claros:** Escribir mensajes breves que describan qué se agregó o modificó (por ejemplo: `docs: actualizar guía de coloquio`, `fix: corregir ruta en scripts`).
