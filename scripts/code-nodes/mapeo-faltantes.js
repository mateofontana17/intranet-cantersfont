// === Mapeo Faltantes ===
//
// A partir del contexto del pedido resuelto, emite UN item por SKU faltante
// (faltante > 0), listo para append a la hoja "Faltantes".
//
// Idempotencia: cada faltante se identifica con
//   FALT-{pedido_id}-{NN}
// donde NN es el índice secuencial ordenado por SKU. Un reenvío del mismo
// pedido genera los mismos faltante_id, así que un upsert por faltante_id
// no duplica filas.

const ctx = $('Resolver BOM del pedido').first().json;

if (!ctx || !Array.isArray(ctx.asignaciones)) {
  throw new Error('[mapeo_faltantes] No se encontró el contexto del pedido.');
}

const fechaAlta = (ctx.fecha_procesado || new Date().toISOString()).slice(0, 10);
const faltantes = ctx.asignaciones
  .filter((a) => a.faltante > 0)
  .sort((a, b) => a.sku.localeCompare(b.sku));

return faltantes.map((a, idx) => {
  const itemIdPrincipal = a.items_asociados[0] || '';
  const faltanteId = `FALT-${ctx.pedido_id}-${String(idx + 1).padStart(2, '0')}`;

  const notas = a.items_asociados.length > 1
    ? `Cubre items: ${a.items_asociados.join(', ')}`
    : '';

  return {
    json: {
      faltante_id: faltanteId,
      pedido_id: ctx.pedido_id,
      item_id: itemIdPrincipal,
      sku: a.sku,
      material: a.material,
      cantidad_faltante: a.faltante,
      unidad: a.unidad || '',
      proveedor: a.proveedor || '',
      precio_costo: a.precio_costo,
      costo_estimado: a.costo_faltante,
      estado: 'PENDIENTE',
      fecha_alta: fechaAlta,
      fecha_resuelto: '',
      notas,
    },
  };
});
