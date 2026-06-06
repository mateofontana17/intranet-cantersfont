# Backend para la Ficha del Proyecto (Etapas 2-5)

Esta es la **única** vez que hay que tocar el backend (n8n + Google Sheets) para
que la ficha editable funcione de punta a punta. Después de aplicar esto,
**agregar o cambiar campos de las Etapas 2-5 es 100% trabajo de frontend** — no
se vuelve a tocar n8n ni la hoja.

## Cómo funciona

Toda la info extendida del proyecto (Etapas 2, 3, 4 y 5) viaja y se guarda como
**un solo bloque JSON** en una columna nueva llamada `detalle` de la hoja de
proyectos. El frontend la serializa con `JSON.stringify` y la manda; n8n solo la
escribe tal cual en esa celda. No hay que crear una columna por campo.

```
Frontend (clientes.js)  ──action: guardar_proyecto_detalle──►  n8n  ──►  celda "detalle" (JSON)
Frontend (clientes.js)  ◄──── listar_pedidos (incluye "detalle") ◄────  n8n  ◄──  hoja
```

Mientras el backend no esté aplicado, el frontend **ya funciona**: guarda el JSON
en `localStorage` del navegador (frontend-first). Al guardar muestra el aviso
"guardada en este dispositivo, el guardado en servidor todavía no está activo".
Cuando se aplica este backend, el mismo JSON queda guardado en la hoja y
disponible para todos los empleados, sin cambiar una línea de frontend.

## Datos del entorno (ya en uso por el workflow)

- **Spreadsheet ID:** `1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ`
- **Hoja de proyectos:** `Estado de Pedidos` (gid `440974926`)
- **Credencial Google Sheets:** `Google Sheets OAuth2 API` (id `LiTV16yWQFogsvNY`)
- **Workflow:** `formulario-webhook` (el del webhook `fontana-stock-form`)

---

## Paso 1 — Google Sheets (1 minuto, lo puede hacer Mateo)

En la hoja **`Estado de Pedidos`**, agregar una columna nueva al final con el
encabezado exacto (fila 1):

```
detalle
```

Eso es todo en la hoja. Las filas existentes quedan con la celda vacía (se
interpretan como "sin datos de Etapas 2-5", que es lo correcto).

---

## Paso 2 — n8n: que `listar_pedidos` devuelva `detalle`

El listado de proyectos se arma con un whitelist explícito de campos, así que hay
que sumar `detalle` ahí o no va a llegar al frontend.

Abrir el nodo **`Mapear Estado de Pedidos`** (tipo Code) y, dentro del objeto que
se devuelve por cada fila (`.map(r => ({ json: { ... } }))`), agregar una línea:

```js
detalle: norm(r.detalle),
```

> Queda junto a `proyecto_id`, `estado`, etc. Con eso el frontend rehidrata la
> ficha con lo último guardado en la hoja.

---

## Paso 3 — n8n: nueva acción `guardar_proyecto_detalle`

### 3.1 — Agregar la rama en el nodo `Switch`

En el nodo **`Switch`** (el que rutea por `{{ $json.body.action }}`), agregar una
salida nueva con la condición:

```
{{ $json.body.action }}  ==  guardar_proyecto_detalle
```

Nombrar la salida, por ejemplo, **`Guardar Detalle Proyecto`**.

### 3.2 — Nodo Code: `Parsear Detalle Proyecto`

Conectar la salida nueva del Switch a un nodo **Code** nuevo con este código.
Valida el PIN igual que el resto del workflow y normaliza el payload:

```js
// Parsear y validar guardar_proyecto_detalle
const PIN_ESPERADO = '0708';
const b = $json.body || {};

if (String(b.pin || '') !== PIN_ESPERADO) {
  return [{ json: { ok: false, error: 'PIN inválido' } }];
}
const proyecto_id = String((b.data && b.data.proyecto_id) || '').trim();
if (!proyecto_id) {
  return [{ json: { ok: false, error: 'Falta proyecto_id' } }];
}
// `detalle` ya viene como string JSON desde el frontend; lo guardamos tal cual.
let detalle = (b.data && b.data.detalle) || '';
if (typeof detalle !== 'string') detalle = JSON.stringify(detalle);

return [{ json: { proyecto_id, detalle } }];
```

### 3.3 — Nodo Google Sheets: `Guardar Detalle (update)`

Conectar el Code anterior a un nodo **Google Sheets** nuevo:

- **Resource:** `Sheet Within Document`
- **Operation:** `Update Row`
- **Document:** `1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ`
- **Sheet:** `Estado de Pedidos` (gid `440974926`)
- **Mapping Column Mode:** `Map Each Column Manually` (defineBelow)
- **Column to match on:** `proyecto_id`
- **Valores:**
  - `proyecto_id` → `={{ $json.proyecto_id }}`
  - `detalle` → `={{ $json.detalle }}`
- **Credencial:** `Google Sheets OAuth2 API` (`LiTV16yWQFogsvNY`)

> Al matchear por `proyecto_id`, el nodo encuentra la fila del proyecto y solo
> pisa la celda `detalle` (no toca el resto de los campos de la Etapa 1).

### 3.4 — Nodo Respond: `Responder Detalle OK`

Conectar el Google Sheets a un nodo **Respond to Webhook** nuevo que devuelva:

```json
{ "ok": true, "proyecto_id": "={{ $json.proyecto_id }}" }
```

El frontend considera éxito cualquier respuesta con `ok !== false`. Si algo
falla, conviene devolver `{ "ok": false, "error": "..." }` para que el aviso del
frontend sea correcto.

---

## Paso 4 — Verificación

1. Abrir un proyecto en la web → **Abrir ficha** → completar la **Etapa 2** →
   **Guardar etapa 2**.
2. El toast debe decir **"Etapa 2 guardada"** (verde), no el aviso amarillo.
3. En la hoja `Estado de Pedidos`, la celda `detalle` de esa fila debe tener un
   JSON tipo `{"etapa2":{...},"_updated_at":"..."}`.
4. Recargar la lista (botón **Recargar**) y volver a abrir la ficha: los datos de
   Etapa 2 deben seguir ahí (vinieron del servidor, no solo del navegador).

---

## Catálogos editables compartidos (pendiente, fuera de esta tanda)

Hoy los empleados pueden agregar/quitar opciones de cada desplegable con el botón
"+", pero esos cambios se guardan **por dispositivo** (`localStorage`, clave
`fontana_catalogo_<campo>`). Para que el catálogo sea **el mismo para todos**:

- Crear una hoja `Catalogos` con columnas `campo | opcion` (una fila por opción).
- n8n: acción `listar_catalogos` que la lea, y acciones `agregar_opcion` /
  `quitar_opcion` que escriban en ella (mismo patrón que el resto).
- Frontend: `getOpciones()` ya está centralizado en `clientes.js` — solo habría que
  alimentarlo desde el backend en vez de (o además de) `localStorage`. Es el mismo
  patrón con el que hoy funciona el catálogo de `colores`.

No bloquea nada: la edición por dispositivo ya sirve para que cada uno limpie sus
listas; esto es para unificarlas entre empleados.

## V2 — Upload real de archivos (pendiente, fuera de esta tanda)

Hoy los campos de archivo (fotos del lugar, plano, boceto, comprobantes, etc.)
son **links** (se pega la URL de Drive). Para subir archivos de verdad desde el
formulario haría falta:

- Frontend: input `type=file` → leer como base64 → mandar en el payload.
- n8n: nodo **Google Drive → Upload** que guarde el binario en una carpeta del
  proyecto y devuelva el link; ese link se guarda en el JSON `detalle`.

Se deja documentado para cuando haya tiempo/acceso; no bloquea nada de lo
anterior.
