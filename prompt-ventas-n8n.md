# PROMPT 1 — Lógica de Ventas: Descuento automático de stock por BOM

## Contexto del proyecto

Estoy construyendo un sistema de control de stock para una mueblería ("Fontana") usando **n8n** como motor de automatización y **Google Sheets** como base de datos transitoria. El sistema ya tiene funcionando:

- Un **web form** (HTML/CSS/JS estático) que envía datos vía webhook a n8n.
- Un **workflow n8n** con las etapas: ENTRADA → VALIDACIÓN (PIN + parseo) → DECISIÓN (compra o venta + validación de datos) → EJECUCIÓN.
- La **ejecución de compras** ya funciona: busca el SKU en la ficha de stock, suma la cantidad comprada, y actualiza STOCK y VALOR STOCK en la Google Sheet.

Ahora necesito construir la **ejecución de ventas**, que es más compleja porque una venta no descuenta un solo SKU — descuenta **múltiples materiales** según el tipo de mueble vendido.

---

## Qué llega del webhook de ventas

El formulario de "Registrar Venta" envía:

```json
{
  "action": "venta",
  "pin": "1234",
  "tipo_mueble": "alacena_1m",
  "largo": 1.0,
  "ancho": 0.6,
  "alto": 0.6,
  "color": "Roble Kendal Natural",
  "cantidad": 2
}
```

- `tipo_mueble`: identifica el estándar/modelo (ej: "alacena_1m", "bajo_mesada_1m", "cajonera_50cm").
- `largo`, `ancho`, `alto`: medidas en metros del mueble pedido.
- `color`: el color de melamina a usar.
- `cantidad`: cuántas unidades de ese mueble.

---

## Lógica de descuento de stock por BOM (Bill of Materials)

Cada tipo de mueble tiene un **estándar de materiales** (BOM) que define qué materiales se necesitan para fabricar UNA unidad. Ejemplo para una alacena de 1 metro:

| Material | Cantidad por unidad | Cómo se descuenta del stock |
|---|---|---|
| Placa Melamina MDF 18mm (color elegido) | 1/2 placa | Se busca por categoría "MDF 18mm" + color → resta 0.5 del STOCK |
| Placa de Fondo HDF 3mm (mismo color) | 1/4 placa | Se busca por categoría "Fondo 3mm" + color → resta 0.25 del STOCK |
| Bisagras Codo 0 Comunes | 4 unidades | SKU: HA-236 → resta 4 |
| Tornillos Fix 4.0x50mm (ensamble) | 12 unidades | SKU: FI-266 → resta 12 (o la fracción de caja correspondiente) |
| Tornillos Fix 3.5x16mm (herraje) | 16 unidades | SKU: FI-263 → resta 16 (o la fracción de caja correspondiente) |
| Filo PVC 22mm (mismo color) | 9 metros | Se busca por categoría "Filo/Canto" + color + "22mm" → resta 0.09 rollos (9m de 100m) |

**Importante sobre tornillos/fijaciones:** El stock está en cajas (ej: "Caja x1000"). Una venta de 12 tornillos no resta 12 del stock — resta 12/1000 = 0.012 cajas. O bien, se puede llevar un stock paralelo en unidades individuales. **Necesito que propongas la mejor solución para esto.**

### Flujo esperado:

1. Llega la venta → se valida PIN y datos.
2. Se identifica el `tipo_mueble` → se busca su BOM (estándar de materiales).
3. Se multiplica el BOM × `cantidad` de muebles.
4. Para cada línea del BOM:
   a. Se busca el producto en la ficha de stock (por SKU directo o por categoría + color).
   b. Se verifica que haya stock suficiente.
   c. Si hay stock → se calcula el nuevo stock.
   d. Si NO hay stock suficiente → se marca como faltante.
5. Si TODO tiene stock suficiente → se ejecutan TODOS los updates en la sheet.
6. Si algo falta → NO se ejecuta ningún update, se devuelve un error con el detalle de qué falta.
7. Se registra el movimiento (esto se hace aparte, no te preocupes por ahora).

---

## Estructura de la Google Sheet

La sheet "Materiales y Stock demo" tiene una hoja "Hoja de Cálculo de Materiales y Stock" con:

- **Fila 1**: Título "CATÁLOGO DE PRODUCTOS — MUEBLERÍA [NOMBRE EMPRESA]"
- **Fila 2**: Headers → #, CATEGORÍA, PRODUCTO / COLOR, MEDIDA / VARIANTE, SKU, STOCK, PRECIO COSTO, PRECIO VENTA, MARGEN %, VALOR STOCK, PROVEEDOR, NOTAS
- **Fila 3+**: Datos, intercalados con filas de subtítulo de categoría (ej: "PLACAS MELAMÍNICAS MDF (18mm)")

Los nodos de Google Sheets usan:
- **Data Location on Sheet**: Header Row = 2, First Data Row = 3
- **Column to match on**: SKU (para updates)

---

## Dónde se guardan los BOM/estándares

Necesito que los estándares de cada tipo de mueble se guarden en una **segunda hoja** de la misma Google Sheet (o en otra sheet), con un formato que el workflow pueda leer y procesar. Propone la estructura ideal para esta hoja de estándares.

Requisitos:
- Cada estándar tiene un `tipo_mueble` (identificador único).
- Cada estándar lista N materiales con: tipo de búsqueda (por SKU directo o por categoría+color), cantidad por unidad, unidad de medida.
- Debe ser fácil de mantener para alguien no técnico (se carga desde la Google Sheet directamente).
- Los materiales que dependen del color elegido (melamina, fondo, filo) deben poder resolverse dinámicamente.

---

## Qué necesito que hagas

1. **Diseñá la estructura de la hoja de estándares/BOM** en Google Sheets.
2. **Armá los nodos de n8n** para la ejecución de ventas:
   - Code node que lea el BOM del tipo de mueble.
   - Code node que resuelva cada línea del BOM contra la ficha de stock (buscando por SKU o por categoría+color).
   - Validación de stock suficiente para TODAS las líneas antes de ejecutar.
   - Update masivo de la sheet (solo si todo tiene stock).
   - Respuesta de error detallada si falta algo.
3. **Dame el código JavaScript** de cada Code node, listo para pegar en n8n.
4. **Dame la configuración** de cada nodo nativo (Google Sheets, IF, etc.).

### Restricciones técnicas:
- n8n community edition.
- Google Sheets como única base de datos.
- Los nodos de Google Sheets usan Header Row = 2, First Data Row = 3.
- El workflow ya tiene las etapas previas (entrada, validación, decisión). Solo necesito la parte de ejecución para ventas.
- No uses nodos que no existan en n8n. Si algo requiere lógica compleja, usá Code nodes en JavaScript.
- Priorizá nodos nativos sobre Code nodes donde sea posible, pero en este caso la lógica es lo suficientemente compleja como para justificar Code nodes.

---

## Formato de respuesta esperado

Para cada nodo:
1. Nombre del nodo
2. Tipo de nodo (Code, Google Sheets, IF, etc.)
3. Configuración completa (parámetros, expressions, etc.)
4. Código JavaScript completo (si es Code node)
5. Conexiones (de qué nodo viene, a qué nodo va)

Incluí un diagrama del flujo de nodos al final.
