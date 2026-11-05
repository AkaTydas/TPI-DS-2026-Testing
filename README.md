# 📚 Recursos, Extras y Documentación - TPI

Repositorio centralizado de soporte para el Trabajo Práctico Integrador. Funciona como espacio de trabajo colaborativo para gestionar la asignación de tareas, documentar las resoluciones técnicas del TPI de desarrollo y centralizar el avance del TPI de investigación.

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

## 📂 Estructura de Carpetas

```text
.
├── Explicaciones/   # Desglose conceptual y técnico del TPI principal (desarrollo)
├── Investigacion/   # Resoluciones, documentación e implementación del TPI de investigación
└── Tareas/          # Asignación de actividades, responsables y consignas
```

### 1. `Explicaciones/`
Contiene la justificación y resolución paso a paso de las tareas del **TPI principal (TPI de desarrollo)**:
* Detalla el **porqué** y el **cómo** de cada implementación resuelta en el proyecto base.
* Sirve como guía de consulta conceptual para nivelar el entendimiento técnico de todo el equipo de cara a defensas o consultas docentes.

### 2. `Investigacion/`
Almacena el material y resoluciones correspondientes al **TPI de investigación**:
* Actualmente centraliza la documentación teórica y las consignas del trabajo.
* A futuro se dividirá en dos subcarpetas:
  * `documentacion/`: Informes, marco teórico y análisis.
  * `implementacion/`: Pruebas de concepto, código y entregables prácticos.

### 3. `Tareas/`
Espacio de gestión operativa y distribución del trabajo:
* Enunciados y requerimientos específicos de cada tarea.
* Asignación del **integrante responsable** de llevarla a cabo.
* Seguimiento de estado de avance interno del grupo.

---

## 🚀 Flujo de Trabajo

### Sincronizar cambios antes de empezar
```bash
git pull origin main
```

### Subir nuevo material
```bash
git add .
git commit -m "docs(tareas): actualizar asignación de responsables"
git push origin main
```

---

## ⚙️ Reglas de Convivencia y Buenas Prácticas

1. **Pull obligatorio antes de push:** Ejecutar siempre `git pull origin main` antes de iniciar cambios o commitear para evitar conflictos innecesarios.
2. **Priorizar Markdown (`.md`):** Para notas, explicaciones teóricas y resoluciones, usar siempre Markdown en lugar de formatos propietarios (`.docx`, etc.). Esto permite visualizar el contenido directamente en GitHub y facilita la lectura desde editores e IDEs como Antigravity.
3. **Respetar la estructura de carpetas:** Cada archivo debe ubicarse estrictamente en la carpeta que le corresponde (`Explicaciones/`, `Investigacion/` o `Tareas/`). No dejar archivos sueltos en la raíz del repositorio, salvo configuraciones como `README.md` o `.gitignore`.
4. **Nombres de archivo normalizados:** Nombrar archivos en minúsculas y usar guiones medios o bajos (ejemplo: `tarea-frontend-login.md`, `resumen_investigacion.md`). Evitar espacios en blanco, tildes y caracteres especiales.
5. **Commits claros y descriptivos:** Redactar mensajes concisos indicando el área intervenida y la acción realizada (ejemplo: `docs(explicaciones): agregar detalle sobre arquitectura backend`).