#!/usr/bin/env node

/**
 * Patch del workflow "Fontana — Formulario web webhook" para el nuevo flujo
 * de pedidos (Opción A: descuento parcial + registro de faltantes).
 *
 *   • Reescribe los Code nodes "Resolver BOM y verificar", "Mapeo Carga
 *     Ventas" y "Reconstruccion de Ventas".
 *   • Renombra "Resolver BOM y verificar" → "Resolver BOM del pedido".
 *   • Elimina "Normalizar y validar venta" (legacy desconectado).
 *   • Inserta nodos nuevos:
 *         - Mapeo Faltantes                 (Code)
 *         - Append Faltantes                (Google Sheets append)
 *         - Marcar pedido PENDIENTE         (Google Sheets update)
 *         - Responder pedido OK             (respondToWebhook)
 *   • Reescribe las conexiones del ramo "Ejecucion Pedido".
 *   • Ajusta el IF "Todo el stock alcanza?" para que lea
 *     $('Resolver BOM del pedido').first().json.todo_alcanza.
 *   • Ajusta el body de "Responder faltantes" para incluir el detalle
 *     de lo descontado + los faltantes registrados.
 *
 * Uso:
 *   node scripts/patch-formulario-workflow.js
 *
 * Lee el clean desde  workflows/clean/formulario-webhook.json
 * Escribe en el mismo archivo (reemplaza).
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const WF_PATH = path.join(BASE, 'workflows', 'clean', 'formulario-webhook.json');
const CODE_DIR = path.join(__dirname, 'code-nodes');

const SHEET_DOC_ID = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const SHEET_DOC_NAME = 'Materiales, Stock y Clientes demo';
const ESTADO_PEDIDOS_GID = 440974926;
const FALTANTES_SHEET_NAME = 'Faltantes';
const GOOGLE_CREDS = { id: 'LiTV16yWQFogsvNY', name: 'Google Sheets OAuth2 API' };

// ── Helpers ────────────────────────────────────────────────────────────────
function readCode(name) {
  return fs.readFileSync(path.join(CODE_DIR, name), 'utf8');
}

function findNode(wf, nombre) {
  return wf.nodes.find((n) => n.name === nombre);
}

function removeNode(wf, nombre) {
  const idx = wf.nodes.findIndex((n) => n.name === nombre);
  if (idx !== -1) wf.nodes.splice(idx, 1);

  // Limpia connections: outgoing del nodo borrado.
  delete wf.connections[nombre];

  // Limpia connections: incoming al nodo borrado.
  for (const src of Object.keys(wf.connections)) {
    const outs = wf.connections[src].main;
    if (!Array.isArray(outs)) continue;
    for (const group of outs) {
      if (!Array.isArray(group)) continue;
      for (let i = group.length - 1; i >= 0; i--) {
        if (group[i]?.node === nombre) group.splice(i, 1);
      }
    }
  }
}

function renameNode(wf, viejo, nuevo) {
  const node = findNode(wf, viejo);
  if (!node) throw new Error(`Nodo no encontrado: ${viejo}`);
  node.name = nuevo;

  // Actualizar connections: outgoing.
  if (wf.connections[viejo]) {
    wf.connections[nuevo] = wf.connections[viejo];
    delete wf.connections[viejo];
  }

  // Actualizar connections: incoming (target.node === viejo).
  for (const src of Object.keys(wf.connections)) {
    const outs = wf.connections[src].main;
    if (!Array.isArray(outs)) continue;
    for (const group of outs) {
      if (!Array.isArray(group)) continue;
      for (const target of group) {
        if (target?.node === viejo) target.node = nuevo;
      }
    }
  }
}

function setConnectionFrom(wf, src, branches) {
  // branches: Array<Array<{ node, type?, index? }>>
  wf.connections[src] = {
    main: branches.map((grp) => grp.map((t) => ({
      node: t.node,
      type: t.type || 'main',
      index: t.index ?? 0,
    }))),
  };
}

// ── 1. Cargar workflow ─────────────────────────────────────────────────────
console.log('Cargando workflow desde', WF_PATH);
const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
console.log(`  Nodos inicial: ${wf.nodes.length}`);

// ── 2. Borrar "Normalizar y validar venta" (legacy) ────────────────────────
if (findNode(wf, 'Normalizar y validar venta')) {
  removeNode(wf, 'Normalizar y validar venta');
  console.log('✓ Borrado: Normalizar y validar venta');
}

// ── 3. Reescribir + renombrar "Resolver BOM y verificar" ──────────────────
const nodeResolver = findNode(wf, 'Resolver BOM y verificar');
if (!nodeResolver) throw new Error('Nodo "Resolver BOM y verificar" no encontrado');
nodeResolver.parameters.jsCode = readCode('resolver-bom.js');
renameNode(wf, 'Resolver BOM y verificar', 'Resolver BOM del pedido');
console.log('✓ Rewrite + rename: Resolver BOM y verificar → Resolver BOM del pedido');

// ── 4. Reescribir "Mapeo Carga Ventas" ─────────────────────────────────────
const nodeMapeo = findNode(wf, 'Mapeo Carga Ventas');
if (!nodeMapeo) throw new Error('Nodo "Mapeo Carga Ventas" no encontrado');
nodeMapeo.parameters.jsCode = readCode('mapeo-carga-ventas.js');
console.log('✓ Rewrite: Mapeo Carga Ventas');

// ── 5. Reescribir "Reconstruccion de Ventas" ───────────────────────────────
const nodeReconst = findNode(wf, 'Reconstruccion de Ventas');
if (!nodeReconst) throw new Error('Nodo "Reconstruccion de Ventas" no encontrado');
nodeReconst.parameters.jsCode = readCode('reconstruccion-ventas.js');
console.log('✓ Rewrite: Reconstruccion de Ventas');

// ── 6. Ajustar IF "Todo el stock alcanza?" ─────────────────────────────────
const nodeIf = findNode(wf, 'Todo el stock alcanza?');
if (!nodeIf) throw new Error('Nodo "Todo el stock alcanza?" no encontrado');
nodeIf.parameters.conditions.conditions = [{
  id: 'f1a2b3c4-stock-ok-cond-0001',
  leftValue: "={{ $('Resolver BOM del pedido').first().json.todo_alcanza }}",
  rightValue: true,
  operator: {
    type: 'boolean',
    operation: 'true',
    singleValue: true,
  },
}];
console.log('✓ Updated: Todo el stock alcanza? (condition ← Resolver BOM del pedido.todo_alcanza)');

// ── 7. Actualizar body de "Responder faltantes" ────────────────────────────
const nodeRespFalt = findNode(wf, 'Responder faltantes');
if (!nodeRespFalt) throw new Error('Nodo "Responder faltantes" no encontrado');
nodeRespFalt.parameters.respondWith = 'json';
nodeRespFalt.parameters.responseBody = "={{ (() => { const c = $('Resolver BOM del pedido').first().json; return JSON.stringify({ ok: true, pedido_id: c.pedido_id, estado: c.estado_final, mensaje: 'Pedido registrado. Se descontó lo disponible y los faltantes quedaron pendientes de compra.', descontado: c.asignaciones.filter(a => a.asignado > 0).map(a => ({ sku: a.sku, material: a.material, producto: a.producto, cantidad: a.asignado, stock_nuevo: a.stock_nuevo })), faltantes: c.asignaciones.filter(a => a.faltante > 0).map(a => ({ sku: a.sku, material: a.material, cantidad: a.faltante, unidad: a.unidad, proveedor: a.proveedor, costo_estimado: a.costo_faltante })), errores_items: c.errores_items, costo_total_faltantes: c.costo_total_faltantes }); })() }}";
nodeRespFalt.parameters.options = { responseCode: 200 };
console.log('✓ Updated: Responder faltantes (ok:true + descontado + faltantes)');

// ── 8. Crear node "Responder pedido OK" (rama TRUE) ────────────────────────
// Reemplaza a "Responder compra OK" en la rama de pedidos.
if (!findNode(wf, 'Responder pedido OK')) {
  wf.nodes.push({
    parameters: {
      respondWith: 'json',
      responseBody: "={{ (() => { const c = $('Resolver BOM del pedido').first().json; return JSON.stringify({ ok: true, pedido_id: c.pedido_id, estado: c.estado_final, mensaje: 'Pedido registrado. Stock descontado correctamente.', descontado: c.asignaciones.map(a => ({ sku: a.sku, material: a.material, producto: a.producto, cantidad: a.asignado, stock_nuevo: a.stock_nuevo })), faltantes: [], errores_items: c.errores_items }); })() }}",
      options: {},
    },
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [2256, 720],
    id: 'f5e9a2b1-9a7d-4a77-b2c1-4d3e5f6a7b80',
    name: 'Responder pedido OK',
  });
  console.log('✓ Added: Responder pedido OK');
}

// ── 9. Crear node "Mapeo Faltantes" (Code) ─────────────────────────────────
if (!findNode(wf, 'Mapeo Faltantes')) {
  wf.nodes.push({
    parameters: { jsCode: readCode('mapeo-faltantes.js') },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1632, 960],
    id: 'a1b2c3d4-e5f6-7890-abcd-0123456789ab',
    name: 'Mapeo Faltantes',
  });
  console.log('✓ Added: Mapeo Faltantes');
}

// ── 10. Crear node "Append Faltantes" (Google Sheets append) ───────────────
if (!findNode(wf, 'Append Faltantes')) {
  wf.nodes.push({
    parameters: {
      operation: 'append',
      documentId: {
        __rl: true,
        value: SHEET_DOC_ID,
        mode: 'list',
        cachedResultName: SHEET_DOC_NAME,
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit?usp=drivesdk`,
      },
      sheetName: {
        __rl: true,
        value: FALTANTES_SHEET_NAME,
        mode: 'name',
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          faltante_id: '={{ $json.faltante_id }}',
          pedido_id: '={{ $json.pedido_id }}',
          item_id: '={{ $json.item_id }}',
          sku: '={{ $json.sku }}',
          material: '={{ $json.material }}',
          cantidad_faltante: '={{ $json.cantidad_faltante }}',
          unidad: '={{ $json.unidad }}',
          proveedor: '={{ $json.proveedor }}',
          precio_costo: '={{ $json.precio_costo }}',
          costo_estimado: '={{ $json.costo_estimado }}',
          estado: '={{ $json.estado }}',
          fecha_alta: '={{ $json.fecha_alta }}',
          fecha_resuelto: '={{ $json.fecha_resuelto }}',
          notas: '={{ $json.notas }}',
        },
        matchingColumns: [],
        schema: [
          { id: 'faltante_id', displayName: 'faltante_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'pedido_id', displayName: 'pedido_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'item_id', displayName: 'item_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'sku', displayName: 'sku', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'material', displayName: 'material', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cantidad_faltante', displayName: 'cantidad_faltante', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'unidad', displayName: 'unidad', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'proveedor', displayName: 'proveedor', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'precio_costo', displayName: 'precio_costo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'costo_estimado', displayName: 'costo_estimado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'fecha_alta', displayName: 'fecha_alta', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'fecha_resuelto', displayName: 'fecha_resuelto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'notas', displayName: 'notas', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [1840, 960],
    id: 'b2c3d4e5-f6a7-8901-bcde-1234567890ab',
    name: 'Append Faltantes',
    credentials: { googleSheetsOAuth2Api: GOOGLE_CREDS },
  });
  console.log('✓ Added: Append Faltantes');
}

// ── 10.b Crear node "Historial Venta" (Sheets append — exclusivo pedidos) ─
// Lo separamos del "Historial Compra" para no romper la rama de compras,
// que conserva su flujo original (→ Responder compra OK).
if (!findNode(wf, 'Historial Venta')) {
  // Reutilizamos el mapping del Historial Compra existente pero con el
  // campo PEDIDO_REF, para mantener trazabilidad venta ↔ pedido.
  wf.nodes.push({
    parameters: {
      operation: 'append',
      documentId: {
        __rl: true,
        value: SHEET_DOC_ID,
        mode: 'list',
        cachedResultName: 'Materiales y Stock demo',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit?usp=drivesdk`,
      },
      sheetName: {
        __rl: true,
        value: 1465950825,
        mode: 'list',
        cachedResultName: 'Historial de movimientos',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit#gid=1465950825`,
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          FECHA: '={{ $json.FECHA }}',
          TIPO: '={{ $json.TIPO }}',
          SKU: '={{ $json.SKU }}',
          'TIPO MUEBLE': "={{ $json['TIPO MUEBLE'] }}",
          MEDIDAS: '={{ $json.MEDIDAS }}',
          COLOR: '={{ $json.COLOR }}',
          CANTIDAD: '={{ $json.CANTIDAD }}',
          'PRECIO UNIT.': "={{ $json['PRECIO UNIT.'] }}",
          PROVEEDOR: '={{ $json.PROVEEDOR }}',
          TOTAL: '={{ $json.TOTAL }}',
          PEDIDO_REF: '={{ $json.PEDIDO_REF }}',
        },
        matchingColumns: [],
        schema: [
          { id: 'FECHA', displayName: 'FECHA', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'TIPO', displayName: 'TIPO', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'SKU', displayName: 'SKU', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'TIPO MUEBLE', displayName: 'TIPO MUEBLE', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'MEDIDAS', displayName: 'MEDIDAS', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'COLOR', displayName: 'COLOR', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'CANTIDAD', displayName: 'CANTIDAD', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'PRECIO UNIT.', displayName: 'PRECIO UNIT.', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'PROVEEDOR', displayName: 'PROVEEDOR', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'TOTAL', displayName: 'TOTAL', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'PEDIDO_REF', displayName: 'PEDIDO_REF', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [2256, 500],
    id: 'd4e5f6a7-b8c9-0123-defa-3456789012cd',
    name: 'Historial Venta',
    credentials: { googleSheetsOAuth2Api: GOOGLE_CREDS },
  });
  console.log('✓ Added: Historial Venta');
}

// ── 11. Crear node "Marcar pedido PENDIENTE" (Sheets update) ───────────────
if (!findNode(wf, 'Marcar pedido PENDIENTE')) {
  wf.nodes.push({
    parameters: {
      operation: 'update',
      documentId: {
        __rl: true,
        value: SHEET_DOC_ID,
        mode: 'list',
        cachedResultName: SHEET_DOC_NAME,
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit?usp=drivesdk`,
      },
      sheetName: {
        __rl: true,
        value: ESTADO_PEDIDOS_GID,
        mode: 'list',
        cachedResultName: 'Estado de Pedidos',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit#gid=${ESTADO_PEDIDOS_GID}`,
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          pedido_id: "={{ $('Resolver BOM del pedido').first().json.pedido_id }}",
          estado: "={{ $('Resolver BOM del pedido').first().json.estado_final }}",
        },
        matchingColumns: ['pedido_id'],
        schema: [
          { id: 'pedido_id', displayName: 'pedido_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [2048, 960],
    id: 'c3d4e5f6-a7b8-9012-cdef-2345678901bc',
    name: 'Marcar pedido PENDIENTE',
    credentials: { googleSheetsOAuth2Api: GOOGLE_CREDS },
  });
  console.log('✓ Added: Marcar pedido PENDIENTE');
}

// ── 12. Rewire conexiones del ramo "Ejecucion Pedido" ──────────────────────
// Necesario: Merge BOM + Stock venta → Resolver BOM del pedido
setConnectionFrom(wf, 'Merge BOM + Stock venta', [[
  { node: 'Resolver BOM del pedido' },
]]);
console.log('✓ Wire: Merge BOM + Stock venta → Resolver BOM del pedido');

// Resolver BOM del pedido → Todo el stock alcanza? (cambiamos: antes iba vía Reconstruccion+Historial)
// Pero el flujo correcto es:
//   Resolver → Mapeo Carga Ventas → Actualizar stock → Reconstruccion → Historial Compra → Todo el stock alcanza? IF
setConnectionFrom(wf, 'Resolver BOM del pedido', [[
  { node: 'Mapeo Carga Ventas' },
]]);
console.log('✓ Wire: Resolver BOM del pedido → Mapeo Carga Ventas');

setConnectionFrom(wf, 'Mapeo Carga Ventas', [[
  { node: 'Actualizar stock venta' },
]]);
console.log('✓ Wire: Mapeo Carga Ventas → Actualizar stock venta');

setConnectionFrom(wf, 'Actualizar stock venta', [[
  { node: 'Reconstruccion de Ventas' },
]]);
console.log('✓ Wire: Actualizar stock venta → Reconstruccion de Ventas');

setConnectionFrom(wf, 'Reconstruccion de Ventas', [[
  { node: 'Historial Venta' },
]]);
console.log('✓ Wire: Reconstruccion de Ventas → Historial Venta');

setConnectionFrom(wf, 'Historial Venta', [[
  { node: 'Todo el stock alcanza?' },
]]);
console.log('✓ Wire: Historial Venta → Todo el stock alcanza?');

setConnectionFrom(wf, 'Todo el stock alcanza?', [
  [{ node: 'Responder pedido OK' }],
  [{ node: 'Mapeo Faltantes' }],
]);
console.log('✓ Wire: Todo el stock alcanza? TRUE→Responder pedido OK / FALSE→Mapeo Faltantes');

setConnectionFrom(wf, 'Mapeo Faltantes', [[
  { node: 'Append Faltantes' },
]]);
setConnectionFrom(wf, 'Append Faltantes', [[
  { node: 'Marcar pedido PENDIENTE' },
]]);
setConnectionFrom(wf, 'Marcar pedido PENDIENTE', [[
  { node: 'Responder faltantes' },
]]);
console.log('✓ Wire: Faltantes branch (Mapeo → Append → Marcar PENDIENTE → Responder faltantes)');

// Asegurar que "Responder compra OK" ya no cuelga del flujo de pedidos:
// su único uso era en la rama de compras (que entra desde Update row in sheet).
// Esa rama la dejamos intacta; si "Historial Compra" antes iba a "Responder
// compra OK", ahora redirige a "Todo el stock alcanza?". El antiguo destino
// queda como nodo libre y sigue activo para la rama de compras via otra ruta.

// ── 13. Actualizar sticky note "Nota: Ejecucion Venta" → "Ejecucion Pedido" ─
const sticky = findNode(wf, 'Nota: Ejecucion Venta');
if (sticky) {
  sticky.parameters.content = '## Ejecucion Pedido\nResuelve BOM por item + color, consolida por SKU, descuenta stock disponible (política A), registra faltantes en hoja Faltantes, marca pedido PENDIENTE_MATERIAL si corresponde.';
  console.log('✓ Updated: sticky Nota: Ejecucion Venta');
}

// ── 14. Persistir ──────────────────────────────────────────────────────────
fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2), 'utf8');
console.log(`\n✓ Escrito: ${WF_PATH}`);
console.log(`  Nodos final: ${wf.nodes.length}`);
