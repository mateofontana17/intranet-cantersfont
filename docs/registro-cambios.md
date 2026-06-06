# Registro de cambios — Web (Clientes & Proyectos)

> Bitácora de cada cambio que hacemos en la web. Cada entrada deja: **qué se
> cambió**, **el código**, **el razonamiento** y **cómo seguimos**. Se actualiza
> en CADA modificación, antes de avanzar.

Archivos de la web: `web-form/clientes.html`, `web-form/clientes.js`,
`web-form/styles.css`. Arquitectura: frontend estático → webhook n8n (campo
`action`) → Google Sheets. Guardar un campo nuevo de verdad toca 3 lugares (JS +
n8n + Sheets); cambios solo de frontend son seguros.

---

## Sesión 2026-06-06 — Ficha editable del proyecto (estructura + Etapa 2)

**Objetivo de la sesión:** que el vendedor pueda cargar TODA la info de cada
proyecto en un solo lugar y que cualquier empleado la encuentre. Se construyó la
ficha editable (Etapas 2-5 cargadas progresivamente) arrancando por la estructura
y la **Etapa 2 (Relevamiento)** completa. Decisiones previas: uploads = links por
ahora (upload real es V2); backend = frontend-first (la web funciona sola y el
cambio de n8n queda documentado en `docs/backend-ficha-proyecto.md`).

---

### Cambio 1 — Vista de ficha en el HTML

**Qué se cambió:** se agregó una tercera vista dentro del tab "Proyectos"
(`#ped-detail-view`), además de la lista y el formulario de alta. Es el
contenedor de la ficha: cabecera + acordeón de etapas (que se rellena por JS).

**Dónde:** `web-form/clientes.html`, dentro de `#tab-pedidos`, después de
`#ped-edit-view`.

**Código agregado:**
```html
<!-- Ficha del proyecto (detalle editable, Etapas 1-5) -->
<div id="ped-detail-view" class="hidden">
  <div class="section-header">
    <button class="btn-back" id="ped-detail-back">&larr; Volver</button>
    <h2 id="ped-detail-title">Ficha del Proyecto</h2>
  </div>
  <div id="ped-detail-meta" class="ficha-meta"></div>
  <div id="ped-etapas" class="ficha-etapas"></div>
</div>
```

**Razonamiento:** el HTML queda mínimo (solo 2 contenedores vacíos: `#ped-detail-meta`
y `#ped-etapas`). Todo el contenido de las etapas se genera por JS desde un schema,
así agregar campos/etapas no obliga a tocar el HTML. Se reusan clases existentes
(`section-header`, `btn-back`) para no romper estilos.

---

### Cambio 2 — Motor de la ficha + Etapa 2 (JS, schema-driven)

**Qué se cambió:** se agregó al final de `web-form/clientes.js` todo el motor de
la ficha: el schema de etapas, render por tipo de campo, lectura del formulario,
cálculo de completitud y guardado. La **Etapa 2** quedó 100% definida (13 campos
del spec).

**Piezas clave (nombres de funciones para ubicarlas):**
- `FICHA_ETAPAS` — array de config. Cada etapa = `{ key, num, titulo, desc, campos[] }`.
  Cada campo = `{ key, label, tipo, requerido?, opciones?, hint?, min? }`.
  **Acá se agregan/cambian campos en el futuro.**
- `renderCampo(etapaKey, campo, valor)` — dibuja un campo según `tipo`: `text`,
  `date`, `textarea`, `select`, `radio`, `multiselect`, `linklist`, `url`.
- `readEtapaForm(etapaKey)` — lee el formulario y devuelve un objeto `{key: valor}`.
- `etapaProgreso(etapa, data)` — cuenta requeridos completos → badge de completitud.
- `guardarEtapa(etapaKey)` — persiste (ver Cambio 4) y refresca el badge.

**Schema de la Etapa 2 (los 13 campos del spec):**
```js
const FICHA_ETAPAS = [
  {
    key: 'etapa2', num: 2, titulo: 'Visita / Relevamiento técnico',
    desc: 'Se carga cuando el vendedor o el medidor va al lugar a relevar...',
    campos: [
      { key: 'fecha_visita', label: 'Fecha de visita', tipo: 'date', requerido: true, hint: 'Cuándo se fue a medir' },
      { key: 'quien_midio', label: 'Quién fue a medir', tipo: 'text', requerido: true },
      { key: 'medidas_espacio', label: 'Medidas del espacio', tipo: 'textarea', requerido: true },
      { key: 'tiene_ascensor', label: '¿Tiene ascensor?', tipo: 'radio', requerido: true, opciones: ['Sí','No'] },
      { key: 'medidas_acceso', label: 'Medidas de acceso', tipo: 'text', requerido: true },
      { key: 'hay_mochetas', label: '¿Hay mochetas?', tipo: 'radio', requerido: true, opciones: ['Sí','No'] },
      { key: 'falsas_escuadras', label: '¿Falsas escuadras?', tipo: 'radio', requerido: true, opciones: ['Sí','No'] },
      { key: 'tipo_piso', label: 'Tipo de piso', tipo: 'select', opciones: ['Cerámico','Madera','Flotante','Cemento alisado','Otro'] },
      { key: 'instalaciones', label: 'Instalaciones existentes', tipo: 'multiselect', requerido: true, opciones: ['Gas','220V','380V','Agua','Desagüe','Campana extracción'] },
      { key: 'estado_lugar', label: 'Estado general del lugar', tipo: 'select', requerido: true, opciones: ['Listo para colocar','En obra','Por terminar'] },
      { key: 'fotos', label: 'Fotos del lugar (links)', tipo: 'linklist', requerido: true, min: 3 },
      { key: 'plano', label: 'Plano del lugar (link)', tipo: 'url' },
      { key: 'notas_relevamiento', label: 'Notas del relevamiento', tipo: 'textarea' },
    ],
  },
  { key: 'etapa3', num: 3, titulo: 'Diseño', proximamente: true },
  { key: 'etapa4', num: 4, titulo: 'Cierre comercial', proximamente: true },
  { key: 'etapa5', num: 5, titulo: 'Producción y colocación', proximamente: true },
];
```

**Razonamiento:** generar la UI desde un schema (en vez de HTML a mano) es lo que
hace que "no falte nada" sea barato: el spec tiene ~100 campos entre todas las
etapas; con este patrón cada campo nuevo es una línea de config. Las Etapas 3/4/5
quedan como placeholders `proximamente: true` para mostrar el camino completo sin
construirlas todavía. El campo `fotos` usa `min: 3` para reflejar el "mínimo 3
fotos" del spec.

---

### Cambio 3 — Abrir/cerrar la ficha + botón en la card

**Qué se cambió:** (a) la card de cada proyecto ahora tiene un botón
**"📋 Abrir ficha"** que abre la vista de detalle; (b) se conectó el botón
"Volver" de la ficha.

**Dónde:** `web-form/clientes.js`.

**Código:**
```js
// En bindEvents():
$('#ped-detail-back').addEventListener('click', closeProyectoFicha);

// En renderProyectosList(), dentro del footer de la card:
${p.proyecto_id ? `<button class="btn btn-sm btn-primary ped-card-ficha"
  onclick="openProyectoFicha('${escapeHtml(p.proyecto_id)}')">&#128203; Abrir ficha</button>` : ''}

// openProyectoFicha(id): busca el proyecto en pedidosData, carga su detalle,
// oculta lista/alta, muestra #ped-detail-view y renderiza cabecera + etapas.
```

**Razonamiento:** se respeta el comportamiento existente (la card se sigue
expandiendo al tocar el header); el botón es un punto de entrada explícito y
claro a la ficha. Solo se muestra si el proyecto tiene `proyecto_id` (sin id no se
puede guardar el detalle).

---

### Cambio 4 — Guardado del detalle (frontend-first) + completitud

**Qué se cambió:** la lógica de persistencia. Toda la info de Etapas 2-5 se guarda
como UN bloque JSON. Hoy se persiste en `localStorage` y se INTENTA mandar al
webhook con la acción `guardar_proyecto_detalle`.

**Código (esencia de `guardarEtapa`):**
```js
currentFichaDetalle[etapaKey] = readEtapaForm(etapaKey);
currentFichaDetalle._updated_at = new Date().toISOString();
localStorage.setItem('fontana_detalle_' + proyectoId, JSON.stringify(currentFichaDetalle));
try {
  const resp = await sendToWebhook('guardar_proyecto_detalle',
    { proyecto_id: proyectoId, detalle: JSON.stringify(currentFichaDetalle) });
  serverOk = !!(resp && resp.ok !== false);
} catch (_) { serverOk = false; }
// toast verde si serverOk, amarillo "guardada en este dispositivo" si no.
```
`loadDetalle(proyecto)` rehidrata: arranca de `proyecto.detalle` (backend) y
superpone el cache local. `etapaProgreso()` marca la etapa "Completa" cuando todos
los requeridos están cargados.

**Razonamiento:** frontend-first = la web sirve YA aunque el n8n todavía no tenga
la acción (no se pierde lo que carga el vendedor). Guardar como un solo JSON en
una columna `detalle` significa tocar el backend UNA sola vez; después agregar
campos es solo frontend. El guardado NO bloquea por requeridos faltantes (la carga
es progresiva), solo avisa.

---

### Cambio 5 — Estilos de la ficha (CSS)

**Qué se cambió:** se agregó al final de `web-form/styles.css` el estilo del
acordeón de etapas, la cabecera con chips, la lista de links y los grupos de
radio/multiselect. Todo en el tema oscuro existente (usa las variables `--color-*`).

**Clases nuevas principales:** `.ficha-meta`, `.ficha-etapa(.open)`,
`.ficha-etapa-head`, `.ficha-etapa-num`, `.ficha-etapa-status`, `.ficha-ro-row`
(resumen Etapa 1), `.ficha-linklist*`, `.ficha-radio-group`. Reusa `.pry-check` y
`.badge-*` que ya existían.

**Razonamiento:** no se tocó ningún estilo existente (solo se agregó al final),
así que no hay riesgo de romper el resto de la app.

---

### Cambio 6 — Preview local + doc de backend

**Qué se cambió:** (a) se agregó la config `web-form` a `.claude/launch.json` para
poder levantar la web en `localhost:4600` y verificar cambios; (b) se creó
`docs/backend-ficha-proyecto.md` con el cambio EXACTO de n8n + Sheets pendiente de
aplicar (columna `detalle` en hoja `Estado de Pedidos`, acción
`guardar_proyecto_detalle`, sumar `detalle` al nodo `Mapear Estado de Pedidos`).

**Razonamiento:** dejar el backend documentado al detalle (con IDs de hoja,
credencial y nombres de nodos reales) para que se aplique sin re-investigar. El
preview permite probar la ficha de punta a punta sin depender del n8n vivo.

---

### Verificación de la sesión

Probado en `localhost:4600`: login con PIN, abrir ficha, llenar los 13 campos de
Etapa 2 (incl. radios, multiselect y 3 links), guardar → badge a "Completa"
verde, cerrar y reabrir → todos los campos vuelven cargados. Sin errores en
consola.

### Cómo seguimos la próxima sesión

1. **Construir la Etapa 3 — Diseño.** Tiene dos niveles:
   - **3A (general):** descripción del diseño, link al render, link a planos,
     boceto aprobado (link), fecha de aprobación. → agregar como una entrada más en
     `FICHA_ETAPAS`.
   - **3B (por mueble):** se repite N veces (1 por mueble), ~23 campos cada uno
     (medidas, color, nivel, puertas, zócalo, filo, laqueado, LED, herrajes,
     bocetos). **Esto necesita un patrón nuevo**: una sub-lista repetible de
     muebles dentro de la etapa (agregar/quitar mueble), no encaja en el render
     plano actual. Definir ese patrón es el primer paso de la próxima tanda.
2. Después seguir con **Etapa 4 (cierre comercial)** y **Etapa 5 (producción/
   colocación)**, que sí encajan en el render plano (más algún campo calculado como
   "saldo restante").
3. **Pendiente de backend (no bloquea frontend):** aplicar
   `docs/backend-ficha-proyecto.md` en el n8n de Joaquín para que el guardado sea
   real y compartido entre empleados.

---

## Sesión 2026-06-06 (cont.) — Etapa 3B: Diseño por mueble (repeater)

**Objetivo:** construir la Etapa 3B del spec, que es la más compleja: una ficha de
~23 campos **por cada mueble** del proyecto (se repite N veces), con varios campos
**condicionales** (aparecen solo si otro campo dice "Sí"). Decisiones: tipo de
mueble = **texto libre** por ahora; se hizo **3B directo** (la 3A queda como
placeholder "Próximamente").

---

### Cambio 7 — Etapa 3B: muebles repetibles con campos condicionales

**Qué se cambió (resumen):** se extendió el motor de la ficha con dos capacidades
nuevas —**etapas repetibles** (lista de sub-fichas con agregar/quitar) y **campos
condicionales**— y se definió la Etapa 3B completa (23 campos) usando ambas. Todo
en `web-form/clientes.js` y `web-form/styles.css`.

**7.1 — Schema de la Etapa 3B** (`FICHA_ETAPAS`, reemplazó al placeholder
`etapa3`): ahora hay `etapa3a` (placeholder) y `etapa3b` con `repeater: true` e
`itemCampos: [...]` (los 23 campos). Los condicionales se marcan con
`dependeDe: { campo, valor }`:
```js
{ key:'cant_puertas', label:'Cantidad de puertas / hojas', tipo:'number',
  requerido:true, min:1, dependeDe:{ campo:'lleva_puerta', valor:'Sí' } },
```
Grupos condicionales: puerta → (cant_puertas, material_puerta, tipo_apertura);
laqueado → (detalle_laqueado); LED → (tipo_led, desc_led).

**7.2 — Tipos de campo nuevos en `renderCampo`** (ahora `renderCampo(campo, valor, ns)`):
- `number` — input numérico (módulos, puertas, cajones).
- `datalist` — input con autocompletar; `opcionesRef:'colores'` usa el datalist de
  76 colores que ya existía. (Color del catálogo, buscable.)
- `dim3` — 3 inputs Alto/Largo/Profundo en una fila; se guarda como objeto
  `{ alto, largo, profundo }`.
- El parámetro **`ns` (namespace)** hace únicos los `id`/`name` de inputs por
  mueble, así los radios de un mueble no chocan con los de otro.
- Si el campo tiene `dependeDe`, el `.form-group` sale con clase `ficha-cond` +
  `data-depende-campo/valor`.

**7.3 — Motor de etapa repetible (muebles):**
```js
renderEtapaRepeater(etapa, muebles)  // lista de cards + "Agregar/Guardar"
renderMuebleCard(etapa, m, i)        // card colapsable, título y badge auto
readMuebles(etapaKey)                // lee TODAS las cards del DOM (preserva lo tipeado)
addMueble / removeMueble / rerenderRepeater  // agregar/quitar sin perder datos
```
`addMueble`/`removeMueble` leen el DOM actual → modifican el array → re-renderizan,
así no se pierde lo que el vendedor ya tipeó en otros muebles. Cada mueble en datos
es un objeto dentro de `detalle.etapa3b = [ {...}, {...} ]`.

**7.4 — Campos condicionales (mostrar/ocultar):**
```js
bindConditionals(scope)   // 1 listener 'change' por form
applyConditionals(form)   // oculta cada .ficha-cond cuyo padre != valor esperado
condActiva(campo, data)   // para la completitud: un requerido oculto NO cuenta como faltante
```

**7.5 — Lectura/guardado generalizados:** se extrajo `readCampos(container, campos)`
(sirve para etapa plana y para cada mueble). `guardarEtapa` detecta `etapa.repeater`
y guarda el array de muebles. `etapaProgreso` para repeater devuelve
`{ count, completos }` → badge "N muebles" / "x/N listos".

**7.6 — CSS** (`styles.css`): `.ficha-mueble(.open)`, `.ficha-mueble-head/body/del`,
`.ficha-dim3`, `.ficha-repeater-actions`. Solo se agregó; no se tocó nada existente.

**Razonamiento:** el patrón repeater + condicionales es genérico: la 3B fue el caso
que lo justificó, pero queda disponible para la Etapa 5A (producción por mueble) y
para cualquier sub-lista futura. Mantener todo dirigido por el schema
(`FICHA_ETAPAS`) significa que sumar/cambiar campos sigue siendo una línea de
config. El guardado sigue siendo el mismo bloque JSON → el backend no cambia
respecto del Cambio 4 (la columna `detalle` ya contempla `etapa3b` como un array
más dentro del JSON).

**Verificado** en `localhost:4600`: agregar mueble (23 campos), condicionales
ocultos→visibles al marcar "Sí" en puerta/LED, completitud 19/19 "Listo", guardar
→ badge "1 mueble", cerrar y reabrir → rehidrata todo (incluido el re-mostrado de
condicionales según el radio guardado, dim3 y color). Sin errores en consola.

### Cómo seguimos la próxima sesión

1. **Etapa 3A — Diseño general** (la parte fácil que quedó pendiente): descripción
   del diseño, link al render, link a planos técnicos, boceto aprobado (link),
   fecha de aprobación. Es una etapa plana → agregar su entrada en `FICHA_ETAPAS`
   (reemplazar el placeholder `etapa3a`).
2. **Etapa 4 — Cierre comercial** (4A plata, 4B fechas, 4C documentación). Plana,
   pero con un campo **calculado** ("saldo restante = total − seña") y campos que
   dependen de un select (detalle si pago "En cuotas"/"Otro") → reusa el patrón
   `dependeDe`. Quizás haya que sumar un tipo `calculado`.
3. **Etapa 5 — Producción y colocación** (5A por mueble, 5B/5C a nivel proyecto).
   La 5A vuelve a usar el repeater (estado por mueble, trabas).
4. **Backend (no bloquea):** aplicar `docs/backend-ficha-proyecto.md` en n8n.

---

## Sesión 2026-06-06 (cont.) — Catálogos editables por los empleados

**Contexto:** Mateo no tiene acceso al Netlify del desarrollador (el sitio
`ficha-stock-fontana.netlify.app` está en la cuenta de Joaquín). Conclusión
importante: el **frontend es independiente** del desarrollador — se puede publicar
en la cuenta propia de Mateo (Netlify "Deploy manually", arrastrar `web-form`) y
sigue hablando con el mismo backend n8n (la URL está fija en el código). El único
pendiente que sí depende del dev es el cambio de n8n para el guardado real.

Pedido de Mateo: en los desplegables sobran/faltan opciones; quiere un **botón
para que los propios empleados agreguen (y quiten) opciones** y vayan puliendo la
app.

---

### Cambio 8 — Botón "+" para editar las opciones de cada desplegable

**Qué se cambió:** cada `<select>` de la ficha ahora tiene a la derecha un botón
**"+"** que abre un mini-editor: input "Nueva opción… / Agregar" + chips de las
opciones actuales, cada una con una **✕** para quitarla. Aplica a todos los selects
de la ficha (Etapa 2: tipo de piso, estado del lugar; Etapa 3B: espacio, nivel,
material/apertura de puerta, zócalo, filo, LED, herraje).

**Dónde:** `web-form/clientes.js` (motor de catálogos) y `web-form/styles.css`.

**Modelo de datos (localStorage, por dispositivo):**
```js
// clave: fontana_catalogo_<campo.key>
{ add: ["opciones nuevas"], hide: ["opciones base que se quitaron"] }
// opciones efectivas = base del schema − hide + add
```

**Funciones nuevas:**
```js
getOpciones(campo)               // base − hide + add  → la usa renderCampo del select
toggleOpcionesEditor / buildEditor   // abre/arma el mini-editor (lazy)
addOpcion(campoKey, val, editor) // agrega, persiste, deja la opción seleccionada
removeOpcion(campoKey, val)      // quita (si es base → la oculta; si es custom → la borra)
rebuildSelects(campoKey)         // reconstruye TODOS los selects de esa lista preservando lo elegido
```

**Razonamiento:**
- **Catálogo por `campo.key`, compartido entre instancias:** si agregás un zócalo
  nuevo en el Mueble 1, aparece también en el Mueble 2 (mismo `tipo_zocalo`). El
  catálogo es global a la lista, no por mueble.
- **Quitar una opción base = ocultarla (`hide`), no borrarla del schema:** así se
  puede "des-ocultar" agregándola de nuevo, y el schema queda como fuente de
  verdad.
- **localStorage (frontend-first), igual que el resto:** funciona ya, sin backend.
  Limitación honesta (y avisada en el propio editor): los cambios son **por
  dispositivo**; para que TODOS los empleados compartan el mismo catálogo hay que
  promoverlo al backend (ver doc).
- **`rebuildSelects` quirúrgico:** actualiza los `<option>` de los selects en el DOM
  sin re-renderizar la ficha entera → no se pierde nada de lo tipeado.

**Verificado** en `localhost:4600`: aparece el "+" en los selects; agregar opción la
deja elegida y disponible en otros muebles; quitar una base la saca de todos;
persiste en localStorage (`add`/`hide`); sin errores en consola.

### Cómo seguimos la próxima sesión

1. **(Opcional, recomendado) Publicar en el Netlify propio de Mateo** para que los
   empleados entren: Netlify → Add new site → Deploy manually → arrastrar `web-form`.
2. **Promover catálogos a compartidos (backend):** hoy son por dispositivo. Para que
   sean iguales para todos, guardarlos en una hoja de catálogos y que `listar_*` los
   devuelva (mismo patrón que el catálogo `colores`). Anotado en
   `docs/backend-ficha-proyecto.md`.
3. **Seguir las etapas que faltan:** 3A (diseño general), 4 (cierre comercial, con
   campo calculado), 5 (producción/colocación; 5A usa repeater).
4. Aplicar el backend de la ficha (`guardar_proyecto_detalle`) cuando haya acceso al
   n8n.

---

## Sesión 2026-06-06 (cont.) — Etapa 3A: Diseño general

### Cambio 9 — Etapa 3A (Diseño a nivel proyecto)

**Qué se cambió:** se reemplazó el placeholder `etapa3a` por la etapa real (5
campos del spec). Con esto la **Etapa 3 queda completa** (3A general + 3B por
mueble).

**Dónde:** `web-form/clientes.js` → `FICHA_ETAPAS`.

**Campos (todos ya soportados por el motor, no hubo que tocar nada más):**
```js
{ key:'etapa3a', num:'3A', titulo:'Diseño general',
  campos: [
    { key:'descripcion_diseno', tipo:'textarea', requerido:true },
    { key:'link_render',        tipo:'url',      requerido:true },   // V2: upload directo
    { key:'link_planos',        tipo:'url' },                        // opcional
    { key:'boceto_aprobado',    tipo:'url',      requerido:true },   // doc firmado (link)
    { key:'fecha_aprobacion',   tipo:'date',     requerido:true },   // dispara pase a Producción
  ] }
```

**Razonamiento:** 3A es una etapa plana → fue solo agregar config al schema, sin
tocar el motor. Confirma la ventaja del diseño schema-driven: cada campo es una
línea. Uploads = links (decisión vigente). El guardado sigue siendo el mismo bloque
JSON `detalle.etapa3a` → backend sin cambios respecto del Cambio 4.

**Verificado** en `localhost:4600`: 5 campos, badge `0/4` → `Completa` al llenar los
4 requeridos, guarda y rehidrata al reabrir. Sin errores en consola. (El tool de
screenshot se colgó, pero la verificación por DOM pasó completa.)

### Cómo seguimos la próxima sesión

1. **Etapa 4 — Cierre comercial** (4A plata, 4B fechas, 4C documentación). Plana,
   pero estrena un campo **calculado** ("saldo restante = monto total − seña") y
   campos condicionales (detalle si pago "En cuotas"/"Otro" → reusa `dependeDe`).
   Probablemente sumar un tipo `calculado` al motor.
2. **Etapa 5 — Producción y colocación** (5A por mueble → repeater; 5B/5C a nivel
   proyecto).
3. Publicar en el Netlify propio de Mateo y aplicar el backend del n8n
   (`guardar_proyecto_detalle`) cuando haya acceso.

---

## Sesión 2026-06-06 (cont.) — Etapa 4: Cierre comercial

### Cambio 10 — Etapa 4 (4A plata + 4B fechas + 4C documentación)

**Qué se cambió:** se construyó la Etapa 4 completa (18 campos del spec en 3
secciones) y se extendió el motor con **dos tipos de campo nuevos**: `seccion`
(sub-título) y `calculado` (valor de solo lectura derivado de otros campos).

**Dónde:** `web-form/clientes.js` y `web-form/styles.css`.

**10.1 — Tipo `seccion`:** sub-título divisor (4A/4B/4C). En `renderCampo` retorna
`<h4 class="ficha-seccion">` y se ignora en lectura/completitud (no es dato).

**10.2 — Tipo `calculado`:** campo de solo lectura que se completa solo. Cada uno
trae una función `compute(data)` en el schema:
```js
{ key:'saldo_restante', tipo:'calculado',
  compute:(d)=>{ const v=(Number(d.monto_total)||0)-(Number(d.sena)||0);
    return { value:v, display:(d.moneda?d.moneda+' ':'')+formatArgentineNumber(v) }; } }
{ key:'limite_cambios', tipo:'calculado',   // cierre + 14 días
  compute:(d)=>{ /* fecha_cierre + 14 → iso + display */ } }
```
- `recomputeCalculados(form)` lee el form y reescribe el texto + `data-calc-value`.
- `bindCalculados(scope)` engancha `input`/`change` en los forms con calculados →
  el saldo y el límite se actualizan **en vivo** mientras se tipea, y se recomputan
  al reabrir (rehidratación) y antes de guardar.
- En `readCampos`, el calculado se lee del atributo `data-calc-value` (no recursivo).

**10.3 — Schema Etapa 4** (`FICHA_ETAPAS`, reemplazó el placeholder): 4A (moneda
radio, monto, descuento, facturación, seña, fecha/forma de seña, **saldo
calculado**, forma de pago del saldo + detalles **condicionales** "En cuotas"/"Otro"
vía `dependeDe`), 4B (fecha de cierre, **límite de cambios calculado**, entrega
prometida, colocación tentativa), 4C (contrato y comprobante como links, cláusulas,
notas).

**Razonamiento:** `calculado` y `seccion` son genéricos y reutilizables (5C tendrá
cálculos de atraso; cualquier etapa larga puede usar secciones). El saldo y el
límite de cambios quedan **guardados** en el JSON (no solo mostrados) para que el
backend/reportes los usen sin recalcular. Uploads = links (decisión vigente).
Backend sin cambios respecto del Cambio 4 (todo va en `detalle.etapa4`).

**Verificado** en `localhost:4600`: 3 secciones, 2 calculados; saldo
`ARS 700.000,00` (1.000.000−300.000) y límite `20/06/2026` (cierre+14); "En cuotas"
revela su detalle (y se cuenta como requerido sólo cuando aplica); completitud
12/12 "Completa"; al reabrir, saldo `USD 3.500,00` y límite `15/07/2026` se
recomputan solos. Sin errores en consola.

### Cómo seguimos la próxima sesión

1. **Etapa 5 — Producción y colocación** (la última):
   - **5A Producción (por mueble)** → vuelve a usar el **repeater**: estado del
     mueble, operario, fechas auto, fotos (links), y bloque "si está trabado"
     (motivo/qué necesita/responsable) → condicionales `dependeDe` sobre el estado.
   - **5B Colocación** (nivel proyecto) → plana: fecha agendada, horario, colocador,
     ayudantes (multiselect), vehículo, entrega completa/por partes, notas.
   - **5C Post-colocación** → plana + calculado de **atraso real** (fecha real −
     prometida), conformidad, observaciones, fotos, saldo final cobrado.
2. Publicar en el Netlify propio de Mateo + aplicar el backend del n8n.

---

## Sesión 2026-06-06 (cont.) — Etapa 5: Producción y colocación (FICHA COMPLETA)

### Cambio 11 — Etapa 5 (5A producción por mueble + 5B colocación + 5C post-colocación)

**Qué se cambió:** se construyó la Etapa 5 completa (las 3 sub-etapas) y se cerró
la ficha entera (Etapas 1-5). Se sumaron al motor dos capacidades: **etapa espejo**
(`mirrorOf`) y **condicionales con múltiples valores**.

**Dónde:** `web-form/clientes.js`.

**11.1 — Etapa espejo (`mirrorOf`) para la 5A:** la producción es por mueble, pero
los muebles ya existen en 3B. En vez de recargarlos, la 5A **espeja** la lista de
3B: una sub-ficha de producción por cada mueble, titulada con el nombre del mueble,
sin agregar/quitar (la lista la manda el diseño).
```js
{ key:'etapa5a', num:'5A', mirrorOf:'etapa3b', itemCampos:[...] }
// renderEtapaMirror(etapa, muebles3b, prod)  → 1 card por mueble de 3B
// los datos se guardan en detalle.etapa5a alineados por índice a detalle.etapa3b
```
`renderMuebleCard` se generalizó (acepta `tituloOverride`; oculta el botón borrar
cuando `etapa.mirrorOf`). `readMuebles`, `etapaProgreso`, `guardarEtapa` y
`refreshEtapaStatus` ya manejan el espejo igual que un repeater. Si no hay muebles
en 3B, la 5A muestra un aviso ("cargá primero los muebles").

**11.2 — Condicionales multi-valor:** `dependeDe.valor` ahora puede ser un array
(cualquiera de esos valores activa el campo). Se usa en 5C: "Observaciones del
cliente" aparece si conforme = `["No","Parcial"]`.
- `condActiva` y `applyConditionals` interpretan string **o** array.
- **Bug encontrado y corregido:** el array se serializa a JSON en el atributo
  `data-depende-valor`, y las comillas dobles rompían el atributo HTML. Fix:
  escapar `"` → `&quot;` al renderizar.

**11.3 — Schema Etapa 5:**
- **5A (espejo):** estado del mueble (Pendiente→Trabado), inicio/fin de producción,
  operario, notas, fotos (links), y bloque **condicional "trabado"** (motivo / qué
  se necesita / responsable) que aparece sólo si estado = `Trabado`.
- **5B (plana):** fecha agendada, horario (`time`), colocador, ayudantes (texto),
  vehículo (select), entrega completa/por partes (radio), notas.
- **5C (plana):** fecha real, **atraso real calculado** (fecha real − entrega
  prometida de la Etapa 4), conforme (Sí/No/Parcial), observaciones (condicional
  multi-valor), pendientes, fotos (links), conformidad firmada (link), saldo
  cobrado (radio) + fecha/forma de cobro (condicionales si "Sí").

**Razonamiento:** `mirrorOf` evita duplicar la carga de muebles y mantiene 3B como
única fuente de la lista. El atraso calculado cruza etapas (lee
`currentFichaDetalle.etapa4`) reutilizando el tipo `calculado` del Cambio 10. Todo
sigue guardándose en el mismo bloque JSON (`detalle.etapa5a/5b/5c`) → backend sin
cambios.

**Verificado** en `localhost:4600`: 5A espeja 2 muebles de 3B (sin botón borrar),
"Trabado" revela los 3 campos de traba, estado por mueble se guarda alineado por
índice y rehidrata; 5B 7 campos con time/select/radio y 4/4; 5C atraso "9 día(s)
tarde", observaciones visible con "No"/"Parcial" y oculta con "Sí", fecha de cobro
oculta si saldo no cobrado. Sin errores en consola.

### Estado: FICHA COMPLETA (Etapas 1 a 5)

| Etapa | Estado |
|-------|--------|
| 1 Alta · 2 Relevamiento · 3A · 3B · 4 · 5A · 5B · 5C | ✅ todas |

### Cómo seguimos la próxima sesión

1. **Publicar** en el Netlify propio de Mateo (Deploy manually → arrastrar
   `web-form`) para que entren los empleados.
2. **Backend n8n** (`docs/backend-ficha-proyecto.md`): aplicar la acción
   `guardar_proyecto_detalle` + columna `detalle` para que el guardado sea real y
   compartido. Hasta entonces, todo guarda en el dispositivo (frontend-first).
3. **Pulidos opcionales:** upload real de archivos (hoy links), catálogos de selects
   compartidos por backend, auto-timestamps de producción (hoy fechas manuales),
   vincular más fuerte 5A↔3B si cambian muebles, y revisar/ajustar campos con uso
   real.

---

<!-- Próximos cambios se agregan ACÁ abajo, numerados, con la misma estructura:
     Qué se cambió / Código / Razonamiento / Cómo seguimos. -->
