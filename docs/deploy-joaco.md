# Deploy a producción — instrucciones para Joaco

Documento de handoff. Resume **qué se cambió** y **qué tenés que hacer vos** para
dejarlo andando en el servidor de n8n de producción (el del webhook
`fontana-stock-form`). Todo se construyó y probó en un n8n local; acá queda el
paso a paso para llevarlo a tu servidor.

Workflow de producción: **`Fontana — Formulario web webhook`** (id `7ntDbXur9JBetv23`).
Planilla: `1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ`, hoja `Estado de Pedidos` (gid `440974926`).

---

## 1. Qué se agregó (resumen)

Dos features nuevas, ambas ya verificadas punta a punta contra n8n local + la
planilla real:

### A) Persistencia de la ficha (Etapas 2-5) — "Fase 0"
Antes la ficha guardaba sólo en el navegador. Ahora todas las Etapas 2-5 se
guardan como **un bloque JSON en la columna `detalle`** de `Estado de Pedidos` y
se comparten entre todos.

- **Acción nueva `guardar_proyecto_detalle`**: `Switch → Parsear Detalle Proyecto
  (Code) → Guardar Detalle Proyecto (Google Sheets, update, match `proyecto_id`,
  `autoMapInputData`) → Responder Detalle OK`.
- **`Mapear Estado de Pedidos`** ahora devuelve también `detalle`, así
  `listar_pedidos` rehidrata la ficha desde el servidor.

### B) Subida real de archivos
Antes los archivos eran links pegados a mano. Ahora se sube el archivo desde el
formulario y se guarda el link de Drive resultante.

- **Acción nueva `subir_archivo`**: `Switch → Parsear Archivo (Code: base64 →
  binario) → Subir Archivo a Drive (Google Drive, upload) → Responder Archivo OK`.
- El frontend comprime las imágenes (canvas, máx 1600px, JPEG) y manda
  `{ proyecto_id, filename, mime, base64 }`. El flujo sube a Drive y devuelve
  `{ ok:true, link }`. Ese link se guarda en el JSON `detalle` igual que antes.

### Archivos del repo tocados
- `workflows/clean/formulario-webhook.json` — workflow con las 2 acciones nuevas (97 nodos).
- `scripts/patch-guardar-proyecto-detalle.js` y `scripts/patch-subir-archivo.js` — patches idempotentes que generan esos nodos.
- `web-form/clientes.js` — tipos de campo `archivo`/`archivolist` + subida; los 10 campos de archivo migrados; override de `WEBHOOK_URL` por `localStorage` (sólo para testeo local, en prod usa la URL de siempre).
- `web-form/styles.css` — estilos de los campos de archivo.

---

## 2. Pasos en el servidor de producción

### Paso 1 — Actualizar el workflow
Tenés el JSON actualizado en `workflows/clean/formulario-webhook.json`. Dos
opciones:

- **Opción recomendada (script):** `node scripts/push-formulario-to-n8n.js` (dry-run)
  y luego `--apply`. Lee `N8N_BASE_URL` y `N8N_API_KEY` del `.env`. Hace `PUT` del
  JSON local sobre el workflow `7ntDbXur9JBetv23`. ⚠️ Pisa lo que haya en el server,
  así que si tocaste algo directo en producción que no esté en el repo, mergealo
  antes (el script avisa si hay conflicto de `versionId`).
- **Opción manual:** importar el JSON en n8n y reconectar (ver abajo).

### Paso 2 — Credenciales (no viajan en el JSON)
- **Google Sheets:** los nodos de Sheets ya apuntan a tu credencial
  `Google Sheets OAuth2 API` (`LiTV16yWQFogsvNY`). Verificá que el nodo nuevo
  **`Guardar Detalle Proyecto`** la tenga asignada.
- **Google Drive (nuevo):** el nodo **`Subir Archivo a Drive`** viene **sin
  credencial**. Creá/asigná una credencial **`Google Drive OAuth2 API`** (podés usar
  el mismo cliente OAuth de Google que ya usás para Sheets).

### Paso 3 — Google Cloud (proyecto OAuth de producción)
- Habilitar **Google Drive API** (además de Sheets API).
- Si el n8n de producción usa otro dominio, agregar su redirect OAuth
  (`https://TU-N8N/rest/oauth2-credential/callback`) al cliente OAuth.

### Paso 4 — Planilla
- La columna **`detalle`** ya existe en `Estado de Pedidos` (la agregamos durante
  las pruebas, misma planilla que producción). Verificá que el encabezado sea
  exactamente `detalle` (minúscula).

### Paso 5 — Activar
- Publicá/activá el workflow. Confirmá que el webhook `fontana-stock-form` quede activo.

---

## 3. Cuidados importantes

- **No toques "refrescar columnas" en el nodo `Guardar Detalle Proyecto`.** Está en
  modo `autoMapInputData` justamente para sobrevivir a eso; el refresh del mapeo
  manual borra los campos (nos pasó en las pruebas).
- **Carpeta de Drive:** hoy `Subir Archivo a Drive` sube a la raíz de "My Drive" de
  la cuenta conectada. Para que el equipo vea los archivos, conviene apuntar
  `folderId` a una **carpeta compartida** del equipo (así heredan permisos). Si no,
  hay que compartir cada archivo.
- **Tamaño de archivos:** el webhook de n8n cloud tiene límite de body (~16 MB).
  Las imágenes se comprimen en el cliente (quedan chicas). Para PDFs grandes que
  superen el límite, el campo igual permite **pegar el link a mano** como fallback.

---

## 4. Cómo verificar que quedó bien

1. En la web, abrir un proyecto → **Abrir ficha** → Etapa 2 → **Guardar etapa 2**:
   el toast debe ser verde ("guardado"), no el amarillo.
2. En `Estado de Pedidos`, la celda `detalle` de esa fila debe tener un JSON.
3. En un campo de archivo, **elegir un archivo** → debe aparecer "Subiendo…" y luego
   el link; el archivo debe quedar en Drive.
4. **Recargar** y reabrir la ficha: los datos y los links siguen (vinieron del servidor).

Cualquier duda, los patches en `scripts/` muestran exactamente qué nodos se agregan
y cómo (son idempotentes y están comentados).
