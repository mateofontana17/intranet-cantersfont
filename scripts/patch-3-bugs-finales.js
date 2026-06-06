#!/usr/bin/env node
/**
 * Fix definitivo de los 3 bugs reportados:
 *
 * BUG 1: Compras no actualizan stock
 *   CAUSA: La columna "Código" en la sheet tiene espacios (" EGG-001 ")
 *          y el Update busca por "EGG-001" sin espacios → no matchea → no-op silencioso.
 *   FIX:  Mapeo emite `codigo_sheet` con el valor exacto de la fila; el Update
 *         usa ese campo para matchear.
 *
 * BUG 2: Compras no aparecen en Historial
 *   CAUSA: No hay nodo que appendee a "Historial de movimientos" en el flujo de compra.
 *   FIX:  Agregar nodo "Append Historial Compra" entre Update y Responder.
 *
 * BUG 3: Items debajo de stock mínimo no aparecen en Alertas
 *   CAUSA: No existe la ruta `consultar_alertas` en el Switch.
 *   FIX:  Agregar regla al Switch + nodos: Leer Stock → Filtrar Bajos → Responder Alertas.
 *
 * Uso: node patch-3-bugs-finales.js --apply
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_WF = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';
const SHEETS_CRED_ID = 'LiTV16yWQFogsvNY';
const SHEET_DOC_ID = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const GID_MATERIALES = 1758986104;
const GID_HISTORIAL = 1465950825;

function loadEnv(p) {
  const v = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    v[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return v;
}
function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 10); }

const wf = JSON.parse(fs.readFileSync(LOCAL_WF, 'utf8'));

// ═══════════════════════════════════════════════════════════════════════════
// BUG 1: Mapeo emite codigo_sheet con espacios preservados
// ═══════════════════════════════════════════════════════════════════════════
const mapeoNode = wf.nodes.find((n) => n.name === 'Mapeo de carga de stock');
if (!mapeoNode) throw new Error('No se encontró nodo Mapeo de carga de stock');

const newMapeoCode = `// Calcular nuevos valores para update en Sheets.
// IMPORTANTE: emite codigo_sheet con el valor EXACTO de la fila (con espacios
// si los hay) para que el matching del Update no falle.
const catalogo = $('Filter1').all();
const compras  = $input.all();

const norm = (v) => String(v ?? '').trim().toUpperCase();
const toNum = (v) => {
  const n = Number(String(v ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const byCodigo = new Map();
for (const item of catalogo) {
  byCodigo.set(norm(item.json['Código']), item.json);
}

return compras.map(item => {
  const d = item.json;
  const row = byCodigo.get(norm(d.codigo)) ?? {};

  const stockActual = toNum(row['Stock Actual']);
  const precioUnit  = toNum(row['Precio Unit.']);
  const cantidadNueva = toNum(d.cantidad);
  const precioNuevo   = toNum(d.precio);
  const nuevoStock = stockActual + cantidadNueva;
  const nuevoValor = nuevoStock * (precioNuevo || precioUnit);

  return {
    json: {
      ...d,
      // row_number es la forma confiable de matchear en Update (el match
      // por columna "Código" fallaba con typeVersion 4.7 silenciosamente).
      row_number: row.row_number,
      // La sheet guarda los códigos con espacios: " EGG-001 ". n8n trimea
      // al leer pero NO al hacer match en Update. Padded para que matchee.
      codigo_sheet: row['Código'] != null
        ? ' ' + String(row['Código']).trim() + ' '
        : ' ' + String(d.codigo).trim() + ' ',
      stock_anterior: stockActual,
      nuevo_stock: nuevoStock,
      nuevo_valor: nuevoValor,
      precio_unit_sheet: precioUnit,
    },
  };
});`;

mapeoNode.parameters.jsCode = newMapeoCode;
console.log('✔ Bug 1a: Mapeo emite codigo_sheet con formato exacto');

// Update row in sheet ahora matchea por codigo_sheet
const updateNode = wf.nodes.find((n) => n.name === 'Update row in sheet');
if (!updateNode) throw new Error('No se encontró nodo Update row in sheet');
// Reescribir el schema usando los nombres EXACTOS que ya estaban en el workflow
// original (preserva el encoding correcto del carácter "ó"). Solo limpiamos
// las columnas inexistentes (STOCK, VALOR STOCK, PROVEEDOR) y ajustamos el
// "removed" para mantener Código y Stock Actual activos.
updateNode.parameters.operation = 'update';
const existingSchema = (updateNode.parameters.columns.schema || []).filter(s =>
  !['STOCK', 'VALOR STOCK', 'PROVEEDOR', 'row_number'].includes(s.id)
);
// Marcar todos como removed=true excepto Código y Stock Actual.
existingSchema.forEach(s => {
  if (s.id === 'Código' || s.id === 'Stock Actual') {
    s.removed = false;
  } else if (s.removed !== false) {
    s.removed = true;
  }
});
updateNode.parameters.columns.schema = existingSchema;
// El matchingColumn debe usar el MISMO id que está en el schema (encoding preservado)
const codigoEntry = existingSchema.find(s => s.id.toLowerCase().includes('digo'));
const codigoId = codigoEntry ? codigoEntry.id : 'Código';
updateNode.parameters.columns.matchingColumns = [codigoId];
updateNode.parameters.columns.value = {
  [codigoId]: '={{ $json.codigo_sheet }}',
  'Stock Actual': '={{ $json.nuevo_stock }}',
};
// CRÍTICO: la sheet tiene fila 1 = título mergeado, fila 2 = headers reales.
// Sin locationDefine, n8n lee headers de fila 1 y NO encuentra Código.
updateNode.parameters.options = updateNode.parameters.options || {};
updateNode.parameters.options.locationDefine = {
  values: { headerRow: 2, firstDataRow: 3 },
};
console.log('✔ Bug 1b: Update con schema limpio, locationDefine headerRow=2, firstDataRow=3, match id=', JSON.stringify(codigoId));

// ═══════════════════════════════════════════════════════════════════════════
// BUG 2: agregar Append Historial Compra después de Update
// ═══════════════════════════════════════════════════════════════════════════
let historialCompraNode = wf.nodes.find((n) => n.name === 'Append Historial Compra');
const _hcExisting = historialCompraNode;
historialCompraNode = null; // forzar regeneración para que tome los values nuevos
if (!historialCompraNode) {
  historialCompraNode = {
    parameters: {
      operation: 'append',
      documentId: {
        __rl: true,
        value: SHEET_DOC_ID,
        mode: 'list',
        cachedResultName: 'Materiales, Stock y Clientes demo',
      },
      sheetName: {
        __rl: true,
        value: GID_HISTORIAL,
        mode: 'list',
        cachedResultName: 'Historial de movimientos',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit#gid=${GID_HISTORIAL}`,
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          FECHA: '={{ new Date().toISOString().substring(0,16).replace("T"," ") }}',
          TIPO: 'COMPRA',
          // Referenciar al nodo Mapeo de carga de stock que TIENE los datos
          // originales de la compra. El input directo (Update) ya no los tiene.
          Codigo: '={{ $("Mapeo de carga de stock").first().json.codigo }}',
          'TIPO MUEBLE': '',
          MEDIDAS: '',
          COLOR: '',
          CANTIDAD: '={{ $("Mapeo de carga de stock").first().json.cantidad }}',
          'PRECIO UNIT.': '={{ $("Mapeo de carga de stock").first().json.precio }}',
          PROVEEDOR: '={{ $("Mapeo de carga de stock").first().json.proveedor }}',
          TOTAL: '={{ ($("Mapeo de carga de stock").first().json.cantidad || 0) * ($("Mapeo de carga de stock").first().json.precio || 0) }}',
          PEDIDO_ID: '',
          CLIENTE: '',
          NOTAS: '',
        },
        schema: [
          { id: 'FECHA', displayName: 'FECHA', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'TIPO', displayName: 'TIPO', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'Codigo', displayName: 'Codigo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'TIPO MUEBLE', displayName: 'TIPO MUEBLE', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'MEDIDAS', displayName: 'MEDIDAS', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'COLOR', displayName: 'COLOR', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'CANTIDAD', displayName: 'CANTIDAD', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'PRECIO UNIT.', displayName: 'PRECIO UNIT.', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'PROVEEDOR', displayName: 'PROVEEDOR', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'TOTAL', displayName: 'TOTAL', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'PEDIDO_ID', displayName: 'PEDIDO_ID', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'CLIENTE', displayName: 'CLIENTE', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'NOTAS', displayName: 'NOTAS', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [updateNode.position[0] + 240, updateNode.position[1] + 200],
    id: uid('hist-compra'),
    name: 'Append Historial Compra',
    credentials: {
      googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' },
    },
  };
  if (_hcExisting) {
    // Reemplazar in place preservando id y position originales
    historialCompraNode.id = _hcExisting.id;
    historialCompraNode.position = _hcExisting.position;
    const idx = wf.nodes.findIndex(n => n.name === 'Append Historial Compra');
    wf.nodes[idx] = historialCompraNode;
    console.log('✔ Bug 2a: nodo Append Historial Compra actualizado (in place)');
  } else {
    wf.nodes.push(historialCompraNode);
    console.log('✔ Bug 2a: nodo Append Historial Compra agregado');
  }
}

// Rewireado limpio del flujo de compra:
//   Update row in sheet → Append Historial Compra → Responder compra OK
// (Salteamos el nodo viejo "Historial Compra" que tiene schema con "SKU"
// inexistente y "Reconstruccion de Compra" que sólo servía para reformatear
// para el nodo viejo.)
wf.connections['Update row in sheet'] = {
  main: [[{ node: 'Append Historial Compra', type: 'main', index: 0 }]],
};
wf.connections['Append Historial Compra'] = {
  main: [[{ node: 'Responder compra OK', type: 'main', index: 0 }]],
};
console.log('✔ Bug 2b: flujo Update → Append Historial Compra → Responder compra OK (bypass del nodo viejo)');

// ═══════════════════════════════════════════════════════════════════════════
// BUG 3: agregar ruta consultar_alertas
// ═══════════════════════════════════════════════════════════════════════════
const switchNode = wf.nodes.find((n) => n.name === 'Switch');
const rules = switchNode.parameters.rules.values;
const hasAlertas = rules.some((r) =>
  r.conditions.conditions.some((c) => String(c.rightValue).includes('consultar_alertas'))
);
if (!hasAlertas) {
  rules.push({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [{
        id: uid('cond'),
        leftValue: '={{ $json.body.action }}',
        rightValue: 'consultar_alertas',
        operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
      }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: 'Alertas',
  });
  console.log('✔ Bug 3a: regla consultar_alertas agregada al Switch');
}

// Nodos para el flujo de alertas
let leerStockAlertas = wf.nodes.find((n) => n.name === 'Leer Stock Alertas');
if (!leerStockAlertas) {
  leerStockAlertas = {
    parameters: {
      documentId: {
        __rl: true,
        value: SHEET_DOC_ID,
        mode: 'list',
        cachedResultName: 'Materiales, Stock y Clientes demo',
      },
      sheetName: {
        __rl: true,
        value: GID_MATERIALES,
        mode: 'list',
        cachedResultName: 'Materiales y Stock',
      },
      options: {
        dataLocationOnSheet: {
          values: { rangeDefinition: 'specifyRangeA1', range: 'A2:M' },
        },
      },
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [-200, 1600],
    id: uid('leer-stock-alertas'),
    name: 'Leer Stock Alertas',
    credentials: {
      googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' },
    },
  };
  wf.nodes.push(leerStockAlertas);
  console.log('✔ Bug 3b: nodo Leer Stock Alertas agregado');
}

let filtrarAlertas = wf.nodes.find((n) => n.name === 'Filtrar Alertas');
if (!filtrarAlertas) {
  filtrarAlertas = {
    parameters: {
      jsCode: `// Filtra items con stock_actual < stock_min o stock_actual = 0.
const items = $input.all().map(i => i.json);
const out = [];
const toNum = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

for (const r of items) {
  const codigo = String(r['Código'] || r['codigo'] || '').trim();
  if (!codigo) continue;
  const stockAct = toNum(r['Stock Actual']);
  const stockMin = toNum(r['Stock Mín.'] || r['Stock Min.'] || r['stock_min']);
  if (stockMin <= 0) continue; // ignorar si no hay mínimo definido

  let estado = null;
  if (stockAct === 0) estado = 'SIN_STOCK';
  else if (stockAct < stockMin) estado = 'BAJO';
  if (!estado) continue;

  out.push({
    codigo: codigo,
    nombre: String(r['Producto'] || '').trim() + ' ' + String(r['Color / Variante'] || '').trim(),
    categoria: String(r['Categoría'] || '').trim(),
    proveedor: String(r['Marca'] || '').trim(),
    cantidad: stockAct,
    minimo: stockMin,
    faltante: Math.max(0, stockMin - stockAct),
    estado,
  });
}

return [{ json: { ok: true, items: out, total: out.length } }];`,
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 1600],
    id: uid('filtrar-alertas'),
    name: 'Filtrar Alertas',
  };
  wf.nodes.push(filtrarAlertas);
  console.log('✔ Bug 3c: nodo Filtrar Alertas agregado');
}

let responderAlertas = wf.nodes.find((n) => n.name === 'Responder Alertas');
if (!responderAlertas) {
  responderAlertas = {
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify($json) }}',
      options: {},
    },
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [200, 1600],
    id: uid('resp-alertas'),
    name: 'Responder Alertas',
  };
  wf.nodes.push(responderAlertas);
  console.log('✔ Bug 3d: nodo Responder Alertas agregado');
}

// Conectar: Switch[output Alertas] → Leer Stock Alertas → Filtrar → Responder
const idxAlertas = rules.findIndex((r) => r.outputKey === 'Alertas');
while (wf.connections.Switch.main.length < rules.length) wf.connections.Switch.main.push([]);
wf.connections.Switch.main[idxAlertas] = [{ node: 'Leer Stock Alertas', type: 'main', index: 0 }];
wf.connections['Leer Stock Alertas'] = { main: [[{ node: 'Filtrar Alertas', type: 'main', index: 0 }]] };
wf.connections['Filtrar Alertas'] = { main: [[{ node: 'Responder Alertas', type: 'main', index: 0 }]] };
console.log(`✔ Bug 3e: conexiones Switch[${idxAlertas}] → Leer → Filtrar → Responder`);

// Guardar local
fs.writeFileSync(LOCAL_WF, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('\n✔ Workflow local actualizado');
console.log(`  Nodos: ${wf.nodes.length} | Reglas Switch: ${rules.length}`);

// Push a n8n
if (!process.argv.includes('--apply')) {
  console.log('\n── DRY RUN ── Usá --apply para pushear');
  return;
}

(async () => {
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.N8N_API_KEY || '';
  const endpoint = `${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' },
  };
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.error('✖', res.status, await res.text()); process.exit(1); }
  const r = JSON.parse(await res.text());
  console.log('✔ PUT OK. versionId:', r.versionId);
  const act = await fetch(endpoint + '/activate', { method: 'POST', headers: { 'X-N8N-API-KEY': apiKey } });
  console.log('✔ Activate:', act.status);
})();
