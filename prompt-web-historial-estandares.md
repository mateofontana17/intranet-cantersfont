# PROMPT 2 — Web Form: Historial de Movimientos + Gestión de Estándares (BOM)

## Contexto

Tengo un sistema de control de stock para una mueblería ("Fontana") con un **web form estático** (HTML/CSS/JS puro) que se comunica con **n8n vía webhooks**. El diseño actual tiene un estilo dark/industrial con cards de navegación.

La app actual tiene 4 secciones:
- **Registrar Compra** (funcional)
- **Registrar Venta** (funcional)
- **Consultar Stock** (pendiente)
- **Ver Alertas** (pendiente)

Necesito agregar **2 secciones nuevas** al web form, manteniendo el mismo estilo visual y patrón de comunicación con n8n (webhook POST/GET).

---

## SECCIÓN 1: Historial de Movimientos

### Funcionalidad

Una vista que muestre todos los movimientos de stock registrados (compras y ventas) en orden cronológico inverso (más recientes primero).

### Datos de cada movimiento

| Campo | Descripción |
|---|---|
| Fecha/Hora | Timestamp del movimiento |
| Tipo | "COMPRA" o "VENTA" |
| SKU(s) | SKU(s) afectados |
| Producto(s) | Nombre del producto |
| Cantidad | Cantidad del movimiento |
| Detalle | Para compras: "Ingreso de X unidades". Para ventas: "Venta de [tipo_mueble] — materiales: [lista]" |
| Usuario/PIN | Quién hizo el movimiento |
| Estado | "OK" o "ERROR" |

### UI/UX requerido

- **Tabla responsive** con scroll vertical, que funcione bien en mobile.
- **Filtros**: por tipo (compra/venta/todos), por rango de fechas, por SKU o producto (búsqueda de texto).
- **Badges de color**: verde para compras (ingreso), rojo para ventas (egreso), amarillo para errores.
- **Paginación** o scroll infinito (los movimientos vienen del webhook, se piden de a 50).
- **Detalle expandible**: al tocar un movimiento, se expande y muestra el detalle completo (especialmente útil para ventas que afectan múltiples SKUs).
- **Exportar**: botón para exportar los movimientos filtrados a CSV.
- **Resumen rápido** en la parte superior: total movimientos del día, última compra, última venta.

### Comunicación con n8n

- `GET` al webhook con parámetros de filtro: `?action=historial&tipo=compra&desde=2025-01-01&hasta=2025-12-31&buscar=MDF&page=1&limit=50`
- n8n responde con JSON: `{ movimientos: [...], total: 150, page: 1, pages: 3 }`

### Backend (n8n)

Los movimientos se guardan en una **hoja separada** de Google Sheets llamada "Movimientos". Estructura:

| Timestamp | Tipo | SKUs | Productos | Cantidad | Detalle | PIN | Estado |
|---|---|---|---|---|---|---|---|

Cada vez que se ejecuta una compra o venta exitosa, el workflow agrega una fila a esta hoja (Append Row). El webhook de historial lee esta hoja con filtros.

---

## SECCIÓN 2: Gestión de Estándares (BOM — Bill of Materials)

### Funcionalidad

Un CRUD completo para gestionar los **estándares de fabricación** de cada tipo de mueble. Cada estándar define qué materiales se necesitan para fabricar una unidad de ese mueble.

### Estructura de un estándar

```json
{
  "tipo_mueble": "alacena_1m",
  "nombre_display": "Alacena 1 metro",
  "descripcion": "Módulo alacena estándar, 100x60x30cm",
  "imagen_referencia": "url_opcional",
  "materiales": [
    {
      "tipo_busqueda": "categoria_color",
      "categoria": "MDF 18mm",
      "descripcion": "Placa Melamina MDF (cuerpo + puertas)",
      "cantidad": 0.5,
      "unidad": "placas",
      "notas": "1/2 placa estándar 1.83x2.60m"
    },
    {
      "tipo_busqueda": "categoria_color",
      "categoria": "Fondo 3mm",
      "descripcion": "Placa de Fondo HDF",
      "cantidad": 0.25,
      "unidad": "placas",
      "notas": "1/4 placa"
    },
    {
      "tipo_busqueda": "sku_directo",
      "sku": "HA-236",
      "descripcion": "Bisagras Codo 0 Comunes",
      "cantidad": 4,
      "unidad": "unidades"
    },
    {
      "tipo_busqueda": "sku_directo",
      "sku": "FI-266",
      "descripcion": "Tornillos Ensamble 4.0x50mm",
      "cantidad": 12,
      "unidad": "unidades",
      "notas": "De caja x500"
    },
    {
      "tipo_busqueda": "sku_directo",
      "sku": "FI-263",
      "descripcion": "Tornillos Herraje 3.5x16mm",
      "cantidad": 16,
      "unidad": "unidades",
      "notas": "De caja x1000"
    },
    {
      "tipo_busqueda": "categoria_color",
      "categoria": "Filo/Canto",
      "filtro_extra": "22mm",
      "descripcion": "Filo PVC pre-encolado",
      "cantidad": 9,
      "unidad": "metros",
      "notas": "De rollo x100m"
    }
  ]
}
```

### UI/UX requerido

#### Vista lista
- **Cards** por cada estándar con: nombre, descripción corta, cantidad de materiales, botones editar/eliminar.
- **Botón "Nuevo Estándar"** prominente.
- **Búsqueda** por nombre.

#### Vista detalle / edición
- **Formulario** con campos del estándar (nombre, descripción, tipo_mueble).
- **Tabla editable de materiales**:
  - Cada fila es un material del BOM.
  - Dropdown para "tipo_busqueda": "Por categoría + color" o "Por SKU directo".
  - Si es "categoría + color": campo de categoría (dropdown con las categorías del catálogo: MDF 18mm, Fondo 3mm, Filo/Canto) + campo de filtro extra opcional.
  - Si es "SKU directo": campo de SKU con autocomplete desde el catálogo.
  - Campos de cantidad, unidad, notas.
  - Botón para agregar/eliminar filas.
- **Preview visual**: al costado o abajo, un resumen del BOM como se vería en ejecución.
- **Botón guardar** que envía al webhook de n8n.

#### Vista previa de cálculo
- Un mini-simulador donde ingresás color y cantidad, y te muestra:
  - Qué materiales se van a descontar.
  - SKUs específicos que se van a afectar.
  - Si hay stock suficiente (semáforo verde/rojo por material).

### Comunicación con n8n

- **Listar estándares**: `GET ?action=listar_estandares`
- **Obtener un estándar**: `GET ?action=obtener_estandar&tipo_mueble=alacena_1m`
- **Crear/actualizar estándar**: `POST { action: "guardar_estandar", estandar: {...} }`
- **Eliminar estándar**: `POST { action: "eliminar_estandar", tipo_mueble: "alacena_1m" }`
- **Simular venta**: `POST { action: "simular_venta", tipo_mueble: "alacena_1m", color: "Roble Kendal Natural", cantidad: 2 }`

### Backend (n8n)

Los estándares se guardan en una **hoja separada** de Google Sheets llamada "Estándares BOM". Estructura sugerida (una fila por material, agrupados por tipo_mueble):

| tipo_mueble | nombre_display | material_descripcion | tipo_busqueda | categoria | sku | filtro_extra | cantidad | unidad | notas |
|---|---|---|---|---|---|---|---|---|---|

O bien en formato JSON serializado (una fila por estándar con el array de materiales como JSON string). **Proponé la mejor opción.**

---

## Diseño visual

### Estilo actual (mantener coherencia)
- **Dark theme** — fondo oscuro (#1a1d23 o similar), cards con bordes sutiles, texto claro.
- **Accent color**: azul (#3b82f6 o similar).
- **Cards con iconos** para navegación principal.
- **Formularios** con inputs dark, bordes sutiles, labels claras.
- **Responsive**: funciona en desktop y mobile.

### Navegación
- El menú principal (las 4 cards actuales) pasa a tener **6 cards**:
  1. Registrar Compra 📦
  2. Registrar Venta 📋
  3. Consultar Stock 📊
  4. Ver Alertas ⚠️
  5. **Historial de Movimientos** 📜
  6. **Gestión de Estándares** 🔧

### Requerimientos técnicos
- HTML/CSS/JS puro (sin frameworks — el form actual es vanilla JS).
- Comunicación con n8n vía `fetch()` a webhooks.
- Todo en un solo archivo HTML o con estructura de archivos simple (index.html + pages/).
- Datos del catálogo de productos (para autocomplete de SKU, lista de categorías y colores) se cargan al inicio via webhook GET.
- La autenticación es por PIN (ya implementada).

---

## Formato de respuesta

1. **Estructura de archivos** propuesta.
2. **HTML/CSS/JS completo** para cada nueva sección.
3. **Modificaciones al index.html** existente (agregar las 2 cards nuevas).
4. **Endpoints de webhook** que necesito crear en n8n (lista con método, parámetros, response esperado).
5. Cualquier **hoja nueva de Google Sheets** que haga falta con su estructura.

Dame el código completo y funcional, no fragmentos. El código debe ser production-ready, con manejo de errores, estados de carga, y UX pulida.
