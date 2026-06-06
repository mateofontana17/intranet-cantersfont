// === Resolver BOM del pedido ===
//
// Entradas:
//   $input.all()                 → BOM (Estandares Materiales) + Stock concatenados por el Merge upstream.
//   $('normalizar pedido').all() → Header del pedido + N items (uno por mueble del pedido).
//
// Salida: 1 item con el contexto completo del pedido resuelto.
//         Contiene asignaciones por SKU (consolidadas), clasificación de
//         faltantes, errores de resolución y totales agregados.

// ── Helpers ────────────────────────────────────────────────────────────────
const normText = (s) => String(s ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    const match = Object.keys(row).find((rk) => normText(rk) === normText(k));
    if (match && row[match] !== undefined && row[match] !== null && row[match] !== '') {
      return row[match];
    }
  }
  return null;
};

const parseMoney = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/[^\d.,\-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const parseNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ── 1. Contexto del pedido ─────────────────────────────────────────────────
const normalizados = $('normalizar pedido').all().map((i) => i.json);
const header = normalizados.find((r) => r.tipo === 'pedido');
const items = normalizados.filter((r) => r.tipo === 'item');

if (!header) {
  throw new Error('[resolver_bom] No se encontró el header del pedido.');
}
if (items.length === 0) {
  throw new Error('[resolver_bom] El pedido no tiene items.');
}

// ── 2. Separar BOM y Stock del input concatenado ──────────────────────────
// Heurística:
//   BOM   → tiene columnas tipo_mueble + material + nivel (Estandares Materiales).
//   Stock → tiene columna SKU/sku con valor (Hoja de Cálculo de Materiales y Stock).
const rowsMerged = $input.all().map((i) => i.json);
const bomRows = rowsMerged.filter(
  (r) => r.tipo_mueble && r.material && (r.nivel !== undefined && r.nivel !== null && r.nivel !== ''),
);
const stockRows = rowsMerged.filter((r) => pick(r, 'SKU', 'sku'));

if (bomRows.length === 0) {
  throw new Error('[resolver_bom] El input no trae filas de BOM (Estandares Materiales).');
}
if (stockRows.length === 0) {
  throw new Error('[resolver_bom] El input no trae filas de Stock (Hoja de Cálculo de Materiales y Stock).');
}

// ── 3. Catálogo de stock normalizado ──────────────────────────────────────
const catalogoStock = stockRows
  .map((r) => ({
    sku: String(pick(r, 'SKU', 'sku') || '').trim(),
    categoria: String(pick(r, 'CATEGORÍA', 'CATEGORIA', 'categoria') || '').trim(),
    producto: String(pick(r, 'PRODUCTO / COLOR', 'PRODUCTO/COLOR', 'producto') || '').trim(),
    medida: String(pick(r, 'MEDIDA / VARIANTE', 'MEDIDA/VARIANTE', 'medida') || '').trim(),
    stock: parseNumber(pick(r, 'STOCK', 'stock')),
    precio_costo: parseMoney(pick(r, 'PRECIO COSTO', 'precio_costo')),
    precio_venta: parseMoney(pick(r, 'PRECIO VENTA', 'precio_venta')),
    proveedor: String(pick(r, 'PROVEEDOR', 'proveedor') || '').trim(),
    row_number: r.row_number,
  }))
  .filter((x) => x.sku);

// ── 4. Regla de coloreabilidad por material ───────────────────────────────
// Materiales cuyo SKU concreto depende del color elegido por el cliente.
const PATRON_COLOREABLE = /melamina|mdf.*(color|blanco|negro|roble)|rauvisio|perfectsense|mdf\s*crudo|fondo/i;
const esColoreable = (mat) => PATRON_COLOREABLE.test(mat || '');

// ── 5. Resolver BOM por item y consolidar requerimiento por SKU ───────────
const consumoPorSku = new Map();
const itemsResueltos = [];
const erroresItems = [];

const addConsumo = (elegido, material, unidad, cantidad, itemId) => {
  if (!consumoPorSku.has(elegido.sku)) {
    consumoPorSku.set(elegido.sku, {
      sku: elegido.sku,
      material,
      producto: elegido.producto,
      medida: elegido.medida,
      unidad,
      proveedor: elegido.proveedor,
      precio_costo: elegido.precio_costo,
      precio_venta: elegido.precio_venta,
      stock_actual: elegido.stock,
      row_number: elegido.row_number,
      requerido: 0,
      items_asociados: [],
    });
  }
  const cons = consumoPorSku.get(elegido.sku);
  cons.requerido += cantidad;
  if (!cons.items_asociados.includes(itemId)) {
    cons.items_asociados.push(itemId);
  }
};

for (const item of items) {
  const nivelNum = parseNumber(item.categoria);
  const bomItem = bomRows.filter(
    (r) => String(r.tipo_mueble || '').trim() === item.tipo_mueble
      && parseNumber(r.nivel) === nivelNum,
  );

  if (bomItem.length === 0) {
    erroresItems.push({
      item_id: item.item_id,
      tipo: 'sin_bom',
      tipo_mueble: item.tipo_mueble,
      nivel: nivelNum,
      mensaje: `No hay BOM cargado para "${item.tipo_mueble}" nivel ${nivelNum}.`,
    });
    continue;
  }

  // Agrupar BOM del item por material (soporta múltiples filas del mismo material).
  const materialesBom = new Map();
  for (const b of bomItem) {
    const matName = String(b.material || '').trim();
    if (!matName) continue;
    if (!materialesBom.has(matName)) {
      materialesBom.set(matName, {
        material: matName,
        unidad: String(b.unidad || '').trim(),
        cantidad: 0,
        notas: String(b.notas || '').trim(),
      });
    }
    materialesBom.get(matName).cantidad += parseMoney(b.cantidad);
  }

  const materialesItem = [];
  const colorNormItem = normText(item.color);

  for (const mat of materialesBom.values()) {
    const matNorm = normText(mat.material);
    const candidatos = catalogoStock.filter((c) => normText(c.categoria) === matNorm);

    if (candidatos.length === 0) {
      erroresItems.push({
        item_id: item.item_id,
        tipo: 'sin_sku',
        material: mat.material,
        mensaje: `No hay SKU en Stock con categoría "${mat.material}".`,
      });
      continue;
    }

    let elegido = null;
    if (esColoreable(mat.material)) {
      elegido = candidatos.find((c) => normText(c.producto) === colorNormItem)
        || candidatos.find((c) => normText(c.producto).includes(colorNormItem));
      if (!elegido) {
        erroresItems.push({
          item_id: item.item_id,
          tipo: 'sin_color',
          material: mat.material,
          color: item.color,
          mensaje: `No hay SKU del material "${mat.material}" en color "${item.color}".`,
        });
        continue;
      }
    } else {
      // Material no coloreable: elige el SKU con más stock disponible.
      elegido = candidatos.reduce((a, b) => (b.stock > a.stock ? b : a));
    }

    materialesItem.push({
      material: mat.material,
      sku: elegido.sku,
      producto: elegido.producto,
      unidad: mat.unidad,
      cantidad_requerida: mat.cantidad,
    });
    addConsumo(elegido, mat.material, mat.unidad, mat.cantidad, item.item_id);
  }

  itemsResueltos.push({
    item_id: item.item_id,
    tipo_mueble: item.tipo_mueble,
    nivel: nivelNum,
    color: item.color,
    alto_cm: item.alto_cm,
    ancho_cm: item.ancho_cm,
    profundidad_cm: item.profundidad_cm,
    materiales: materialesItem,
  });
}

// ── 6. Asignación parcial (política A) ────────────────────────────────────
const asignaciones = [];
for (const c of consumoPorSku.values()) {
  const requerido = Math.ceil(c.requerido);
  const disponible = Math.max(0, c.stock_actual);
  const asignado = Math.min(requerido, disponible);
  const faltante = requerido - asignado;
  const stock_nuevo = c.stock_actual - asignado;

  asignaciones.push({
    sku: c.sku,
    material: c.material,
    producto: c.producto,
    medida: c.medida,
    unidad: c.unidad,
    proveedor: c.proveedor,
    precio_costo: c.precio_costo,
    precio_venta: c.precio_venta,
    row_number: c.row_number,
    requerido,
    disponible: c.stock_actual,
    asignado,
    faltante,
    stock_nuevo,
    valor_stock_nuevo: stock_nuevo * c.precio_costo,
    costo_faltante: faltante * c.precio_costo,
    items_asociados: c.items_asociados,
  });
}

// Orden estable por SKU: idempotencia de updates y logs.
asignaciones.sort((a, b) => a.sku.localeCompare(b.sku));

// ── 7. Resumen ────────────────────────────────────────────────────────────
const hayFaltantes = asignaciones.some((a) => a.faltante > 0) || erroresItems.length > 0;
const hayDescontable = asignaciones.some((a) => a.asignado > 0);
const costoTotalFaltantes = asignaciones.reduce((s, a) => s + a.costo_faltante, 0);

return [{
  json: {
    pedido_id: header.pedido_id,
    cliente_id: header.cliente_id,
    cliente_nombre: header.cliente_nombre,
    fecha_entrega: header.fecha_entrega,
    cantidad_items: items.length,
    estado_original: header.estado,
    estado_final: hayFaltantes ? 'PENDIENTE_MATERIAL' : header.estado,
    todo_alcanza: !hayFaltantes,
    hay_descontable: hayDescontable,
    asignaciones,
    items_resueltos: itemsResueltos,
    errores_items: erroresItems,
    costo_total_faltantes: costoTotalFaltantes,
    fecha_procesado: new Date().toISOString(),
  },
}];
