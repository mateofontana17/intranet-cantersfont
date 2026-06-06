// === Mapeo carga ventas ===
//
// A partir del contexto del pedido resuelto, emite UN item por SKU con el
// stock nuevo y el valor de stock recalculado, listo para el Google Sheets
// Update (matchingColumns = [SKU]) de "Actualizar stock venta".
//
// IMPORTANTE: emite TODAS las asignaciones, incluso las que tienen
// asignado = 0. Esto mantiene el pipeline con ≥1 item fluyendo y no rompe
// el IF "Todo el stock alcanza?" aguas abajo. Para asignado = 0 el update
// escribe el mismo valor que ya estaba → no-op idempotente.

const ctx = $('Resolver BOM del pedido').first().json;

if (!ctx || !Array.isArray(ctx.asignaciones)) {
  throw new Error('[mapeo_stock] No se encontró el contexto del pedido resuelto.');
}

if (ctx.asignaciones.length === 0) {
  // Sin asignaciones → probablemente todos los items tienen error de BOM.
  // Emitimos un sentinel para mantener el flujo; el matching por SKU vacío
  // no va a actualizar ninguna fila.
  return [{
    json: {
      SKU: '',
      STOCK: '',
      'VALOR STOCK': '',
      __sin_asignaciones: true,
      pedido_id: ctx.pedido_id,
    },
  }];
}

return ctx.asignaciones.map((a) => ({
  json: {
    SKU: a.sku,
    STOCK: a.stock_nuevo,
    'VALOR STOCK': a.valor_stock_nuevo,
    row_number: a.row_number,
  },
}));
