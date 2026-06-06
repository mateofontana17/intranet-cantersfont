// === Reconstrucción de Ventas ===
//
// Construye los movimientos de VENTA a registrar en la hoja "Historial de
// movimientos", uno por cada SKU con asignación efectiva (asignado > 0).
//
// Cada fila consolida los items del pedido que comparten el mismo SKU:
// concatena tipos de mueble, medidas y colores para que la fila de historial
// muestre de un vistazo qué muebles consumieron ese material.

const ctx = $('Resolver BOM del pedido').first().json;

if (!ctx || !Array.isArray(ctx.asignaciones)) {
  throw new Error('[reconstruccion_ventas] No se encontró el contexto del pedido.');
}

const fecha = ctx.fecha_procesado || new Date().toISOString();
const asignadas = ctx.asignaciones.filter((a) => a.asignado > 0);

if (asignadas.length === 0) {
  // Nada descontable: dejamos una fila marcador para no romper el flujo
  // downstream. El SKU vacío hace que el append al historial sea innocuo.
  return [{
    json: {
      FECHA: fecha,
      TIPO: 'VENTA',
      SKU: '',
      'TIPO MUEBLE': '',
      MEDIDAS: '',
      COLOR: '',
      CANTIDAD: 0,
      'PRECIO UNIT.': 0,
      PROVEEDOR: '',
      TOTAL: 0,
      PEDIDO_REF: ctx.pedido_id,
      __sin_descuento: true,
    },
  }];
}

return asignadas.map((a) => {
  const itemsAsoc = ctx.items_resueltos.filter((i) => a.items_asociados.includes(i.item_id));
  const tiposMueble = [...new Set(itemsAsoc.map((i) => i.tipo_mueble))].join(' + ');
  const medidasList = itemsAsoc
    .map((i) => `${i.alto_cm}x${i.ancho_cm}x${i.profundidad_cm}`)
    .join(' | ');
  const colores = [...new Set(itemsAsoc.map((i) => i.color))].join(' + ');

  return {
    json: {
      FECHA: fecha,
      TIPO: 'VENTA',
      SKU: a.sku,
      'TIPO MUEBLE': tiposMueble,
      MEDIDAS: medidasList,
      COLOR: colores,
      CANTIDAD: a.asignado,
      'PRECIO UNIT.': a.precio_costo,
      PROVEEDOR: a.proveedor,
      TOTAL: a.asignado * a.precio_costo,
      PEDIDO_REF: ctx.pedido_id,
    },
  };
});
