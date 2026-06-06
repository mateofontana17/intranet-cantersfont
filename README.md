# Intranet Cantersfont / Fontana

Intranet de la carpintería: gestión de **clientes, proyectos, stock y producción**.

## Arquitectura

Son 3 piezas acopladas (no es una web tradicional):

- **Frontend estático** → `web-form/` (HTML/CSS/JS vanilla, sin framework).
  - `index.html` + `app.js` → módulo **Stock**.
  - `clientes.html` + `clientes.js` → módulo **Clientes & Proyectos** (incluye la
    **ficha del proyecto**, Etapas 1 a 5).
- **Backend** → workflows de **n8n** (cloud), exportados en `workflows/`. El
  frontend manda todo a un único webhook con un campo `action` que n8n enruta.
- **Base de datos** → **Google Sheets**. Los `.csv` de la raíz son snapshots, no la
  base viva.

> Acople a tener en cuenta: para que un campo nuevo se **guarde** hay que tocar 3
> lugares (JS + workflow n8n + columna en Sheets). Los cambios solo visuales son
> 100% frontend.

## Cómo correr el frontend localmente

No necesita build. Servir la carpeta `web-form/` con cualquier servidor estático:

```bash
npx serve web-form -l 4600
# abrir http://localhost:4600/clientes.html
```

## Ficha del proyecto (Etapas 1-5)

La ficha editable vive en `web-form/clientes.js`, dirigida por un schema
(`FICHA_ETAPAS`): agregar/cambiar campos es editar ese array. Estado actual:
Etapas 1, 2, 3A, 3B, 4, 5A, 5B y 5C completas.

## Documentación

- `docs/registro-cambios.md` → **bitácora de cada cambio** (qué, código, razón, cómo
  seguir). Se actualiza en cada modificación.
- `docs/backend-ficha-proyecto.md` → cambio exacto pendiente en n8n + Sheets para el
  guardado real de la ficha.
- `claude.md` → spec del formulario de nuevo proyecto (Etapas 1-5).
- `docs/setup-guide.md` / `docs/manual-usuario.md` → setup y manual.

## Estructura

```
web-form/     Frontend (la app)
workflows/    Workflows de n8n (backend) exportados
scripts/      Tooling de dev para parchear/generar workflows de n8n
sheets-setup/ Scripts de inicialización de Google Sheets
docs/         Documentación + registro de cambios
*.csv         Snapshots de las pestañas de Sheets
```
