# Tarea 1: Higiene del Repositorio Git y Gestión de Secretos (RNF-06)

## 1. Resumen de la Tarea
El objetivo de esta tarea es sanear el repositorio Git del proyecto **M9 (Reservas de Viajes)** para cumplir con los requerimientos no funcionales de la cátedra (específicamente **RNF-06**) y las buenas prácticas de la industria de software.

Se configuró el archivo `.gitignore` y se eliminaron del seguimiento de Git:
1. `.env` (Secretos y variables de entorno).
2. `dist/` (Archivos compilados de TypeScript).
3. `node_modules/` (Dependencias externas de terceros).

---

## 2. Comandos Paso a Paso

### Paso A: Crear el archivo `.gitignore`
En la raíz del proyecto (`2026-08-TPI/.gitignore`), crear el archivo con las reglas de exclusión:

```gitignore
# Dependencias externas
node_modules/

# Salida de compilación
dist/
*.tsbuildinfo

# Secretos y variables de entorno (RNF-06)
.env
.env.*
!.env.example

# Reportes y cobertura de tests
coverage/
playwright-report/
test-results/

# Logs del sistema
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Archivos de sistema operativo y editores
.DS_Store
Thumbs.db
.vscode/
.idea/
```

### Paso B: Desrastrear archivos sin borrarlos localmente
Ejecutar dentro de la carpeta `2026-08-TPI/`:

```bash
# Desrastrear archivo de secretos
git rm --cached .env

# Desrastrear compilados y dependencias
git rm -r --cached dist/
git rm -r --cached node_modules/
```

### Paso C: Confirmar los cambios en Git
```bash
# Agregar el nuevo .gitignore
git add .gitignore

# Comitear la limpieza
git commit -m "chore: agregar .gitignore y remover secretos, dependencias y compilados (RNF-06)"
```

### Paso D: Subir los cambios a GitHub
```bash
git push origin main
```

---

## 3. Justificación Técnica: ¿Por qué se hizo cada paso?

### A. ¿Por qué usar `git rm --cached` en lugar de `git rm` simple?
* **El porqué:** Si ejecutamos `git rm`, Git borra los archivos físicamente del disco. Si hiciéramos eso con `node_modules/` o `.env`, romperíamos el entorno local y dejarían de funcionar los tests y la base de datos.
* Al usar el flag `--cached`, le indicamos a Git: *"Eliminá estos archivos del índice y del control de versiones, pero conservalos intactos en el sistema de archivos local"*.

### B. ¿Por qué sacar `dist/`?
* **Código generado/redundante:** `dist/` contiene los archivos `.js` y `.map` producidos al compilar TypeScript (`npm run build`). En Git solo debe guardarse el código fuente original (`src/`).
* **Conflictos de merge falsos:** Cuando dos desarrolladores compilan en momentos distintos, las marcas de tiempo y el formato de los archivos generados cambian, produciendo conflictos de Git innecesarios en archivos que nadie escribió manualmente.
* **Reproducibilidad:** Cada entorno (desarrollo, Docker, CI/CD) debe compilar sus propios binarios desde el código fuente garantizando consistencia.

### C. ¿Por qué sacar `node_modules/`?
* **Volumen masivo:** La carpeta `node_modules/` contiene más de **7.800 archivos** y **1.200.000 líneas de código**. Subir esto satura el repositorio, ralentiza drásticamente los `git clone`, `git pull` y `git push`.
* **Incompatibilidad binaria:** Algunas dependencias de npm compilan extensiones en C/C++ adaptadas al sistema operativo donde se ejecutan. Un `node_modules/` generado en Windows suele romperse al correr dentro de Linux o un contenedor Docker.
* **Garantía mediante `package.json` y `package-lock.json`:** Con ambos archivos versionados en Git, cualquier desarrollador o servidor solo debe correr `npm install` (o `npm ci`) para descargar exactamente las mismas librerías en segundos.

### D. ¿Por qué sacar `.env`? (RNF-06)
* **Seguridad y secretos:** El archivo `.env` guarda credenciales sensibles: contraseñas de bases de datos, llaves maestras de JWT (`JWT_SECRET`) y configuraciones de red.
* **Norma de la cátedra:** El requerimiento RNF-06 prohíbe explícitamente incluir credenciales en repositorios compartidos.
* **Solución estándar:** Se mantiene versionado únicamente `.env.example`, que define la estructura requerida sin revelar credenciales reales.

---

## 4. Consideraciones sobre `git push`
* **Flujo limpio:** Si nadie más comiteó en la rama remota, `git push origin main` impactará directamente.
* **Si el remoto tiene cambios nuevos:** Ejecutar previamente `git pull --rebase origin main` para integrar los cambios ajenos y poner tu commit de limpieza en la cima del historial antes de volver a intentar el push.

