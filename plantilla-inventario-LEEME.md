# Cómo cargar el inventario real — guía + plantilla

Esta guía es para **cargar el stock real del taller** en la hoja **"Materiales y
Stock"** de la Google Sheet, de la forma correcta (sin duplicar y pudiendo sumar
productos nuevos). Archivo de plantilla: **`plantilla-inventario.csv`**.

> ⚠️ **No uses el formulario "Registrar Compra" para esta carga inicial.** Ese
> formulario SUMA al stock existente (duplicaría tus números) y no puede crear
> productos nuevos. Para la carga inicial, se hace en la planilla.

---

## Hay dos casos

### Caso A — Producto que YA está en la hoja → solo actualizar cantidad

1. Abrí la Google Sheet, pestaña **"Materiales y Stock"**.
2. Buscá el producto (por Código o nombre).
3. En la columna **"Stock Actual"**, escribí la **cantidad real contada**
   (la reemplaza, NO suma). Listo.

No toques **"Precio Total"** ni **"Reponer"**: son fórmulas, se calculan solas.

### Caso B — Producto que FALTA → agregar fila nueva (usá la plantilla)

1. Abrí **`plantilla-inventario.csv`** (con Excel o Google Sheets).
2. **Borrá las 2 filas de ejemplo** (EGG-001 y HM-PISO90) — están solo para que
   veas el formato.
3. Cargá una fila por cada producto nuevo, siguiendo las columnas (ver abajo).
4. Cuando termines, copiá tus filas y **pegalas en la hoja "Materiales y Stock"**,
   en las primeras filas vacías de abajo (columnas Hoja Origen → Stock Mín.).
5. En esas filas nuevas, **copiá hacia abajo las fórmulas** de "Precio Total" y
   "Reponer" desde una fila de arriba (se arrastra desde la esquina de la celda).

---

## Las columnas (qué va en cada una)

| Columna | Qué poner | Ejemplo |
|---|---|---|
| **Hoja Origen** | Rubro grande | `Maderas`, `Herrajes`, `Servicios` |
| **Sección** | Agrupación dentro del rubro | `EGGER MDF 18mm — Nacional` |
| **Producto** | Nombre del producto | `Placa MDF 18mm` |
| **Categoría** | Categoría para filtrar | `Blanco Absoluto Soft` |
| **Color / Variante** | Color o variante (vacío si no aplica) | `Roble Bardolino Gris` |
| **Marca** | Marca / proveedor del material | `Egger` |
| **Medida** | Medida (vacío si no aplica) | `1.83x2.60m`, `900mm` |
| **Código** | **Identificador ÚNICO** (ver abajo) | `EGG-045` |
| **Precio Unit.** | Precio por unidad, **número sin $ ni puntos** | `109909` |
| **Stock Actual** | **Cantidad real contada** | `22` |
| **Stock Mín.** | Cantidad mínima antes de reponer | `10` |

### 🔑 Lo más importante: el Código tiene que ser ÚNICO

La web identifica cada producto por su **Código**. Si repetís un código, se mezclan
los productos. Recomendación: seguí el patrón que ya usás (prefijo por proveedor/
rubro + número), por ejemplo `EGG-045`, `FAP-F12`, `HM-PISO12`. Antes de inventar
un código nuevo, revisá que no exista ya en la hoja.

### Notas

- **Precio Unit.**: poné el número limpio (`109909`), sin `$` ni separador de
  miles. La planilla lo muestra formateado sola.
- **Color / Variante** y **Medida** pueden quedar **vacíos** si el producto no
  tiene (ej: un herraje sin color).
- **Stock Mín.** es el umbral de alerta "a reponer". Si no lo sabés, poné un valor
  prudente (o `0`).

---

## Al terminar: verificar en la web

1. Entrá a la web → módulo **Stock** → **Consultar Stock** → botón **Recargar**.
2. Deberían aparecer las cantidades nuevas y los productos agregados.
3. Revisá la pestaña **Alertas** para ver qué quedó "a reponer".

Cualquier duda con un caso raro (un producto que no sabés cómo clasificar), anotalo
y lo vemos.
