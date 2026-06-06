#!/usr/bin/env node
/**
 * Genera flow_formulario_webhook v2 — sin Switch, sin convergencias.
 * Cada rama termina con su propio respondToWebhook.
 */
const { SHEETS, sheetsRead, sheetsAppend, sheetsUpdate, codeNode, stickyNote, saveWorkflow } = require('./shared');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

// ── Code: Validar PIN y parsear ──
const validarCode = `// Por que Code: validar PIN, parsear body, clasificar accion
const body = $input.first().json.body || $input.first().json;
const action = (body.action || '').toLowerCase();
const data = body.data || {};
const pin = String(body.pin || '');

const configRows = $('Leer config').all();
const pinConfig = configRows.find(c => (c.json.PARAMETRO || '') === 'PIN_WEB');
const pinValido = pinConfig ? String(pinConfig.json.VALOR || '') : '1234';

if (pin !== pinValido) {
  return [{ json: { error: true, mensaje: 'PIN invalido', statusCode: 401 } }];
}
const acciones = ['registrar_compra', 'registrar_pedido', 'consultar_stock', 'consultar_alertas'];
if (!acciones.includes(action)) {
  return [{ json: { error: true, mensaje: 'Accion invalida: ' + action, statusCode: 400 } }];
}
return [{ json: { error: false, action, data, statusCode: 200 } }];`;

// ── Code: Procesar compra ──
const compraCode = `// Por que Code: validar campos, buscar SKU, preparar update
const d = $input.first().json;
const stock = $('Leer stock').all();
const item = stock.find(s => s.json.SKU === d.data.sku);
if (!item) return [{ json: { ok: false, error: 'SKU no encontrado: '+d.data.sku } }];
const cant = parseInt(d.data.cantidad);
if (isNaN(cant)||cant<=0) return [{ json: { ok: false, error: 'Cantidad invalida' } }];
const precio = parseFloat(String(d.data.precio||'0').replace(/\\./g,'').replace(',','.'));
const anterior = parseInt(item.json.STOCK)||0;
const nuevo = anterior + cant;
return [{ json: {
  ok: true, _write: true,
  SKU: d.data.sku, STOCK: nuevo, PRECIO_COSTO: precio || item.json.PRECIO_COSTO,
  TIMESTAMP: new Date().toISOString(), TIPO_MOVIMIENTO: 'COMPRA',
  PRODUCTO: item.json['PRODUCTO/COLOR']||'', CANTIDAD: cant,
  STOCK_ANTERIOR: anterior, STOCK_NUEVO: nuevo,
  PRECIO_UNITARIO: precio, PROVEEDOR: d.data.proveedor||item.json.PROVEEDOR||'',
  PEDIDO_REF: '', CANAL: 'FORMULARIO_WEB', EDITADO: 'FALSE', FECHA_EDICION: '',
  resultado: { ok: true, mensaje: 'Compra registrada', sku: d.data.sku, stockAnterior: anterior, stockNuevo: nuevo },
} }];`;

// ── Code: Formatear consultas ──
const consultaCode = `// Por que Code: agrupar stock o filtrar alertas para respuesta JSON
const d = $input.first().json;
const stock = $('Leer stock').all();
if (d.action === 'consultar_alertas') {
  const alertas = stock.filter(s => { const m=parseInt(s.json.STOCK_MINIMO); return !isNaN(m)&&m>0&&(parseInt(s.json.STOCK)||0)<m; })
    .map(s => ({ sku:s.json.SKU, producto:s.json['PRODUCTO/COLOR'], stock:parseInt(s.json.STOCK)||0, minimo:parseInt(s.json.STOCK_MINIMO), proveedor:s.json.PROVEEDOR }));
  return [{ json: { resultado: JSON.stringify({ ok: true, alertas }) } }];
}
const items = stock.map(s => ({ sku:s.json.SKU, producto:s.json['PRODUCTO/COLOR'], categoria:s.json['CATEGORIA']||s.json['CATEGORÍA'], stock:parseInt(s.json.STOCK)||0, minimo:parseInt(s.json.STOCK_MINIMO)||null, precio:s.json.PRECIO_COSTO }));
return [{ json: { resultado: JSON.stringify({ ok: true, items }) } }];`;

// Helper: IF node v2.3
function ifNode(id, name, position, leftValue, rightValue, op = 'equals') {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [{ id: uuid(), leftValue, rightValue, operator: { type: 'string', operation: op } }],
        combinator: 'and',
      },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.3, position,
  };
}

// Helper: respondToWebhook
function respond(id, name, position, bodyExpr) {
  return {
    parameters: {
      respondWith: 'json',
      responseBody: bodyExpr,
      options: {},
    },
    id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position,
  };
}

// ════════════════════════════════════════════════════════════
const workflow = {
  name: 'Fontana — Formulario web webhook',
  nodes: [
    // Webhook
    {
      parameters: { httpMethod: 'POST', path: 'fontana-stock-form', responseMode: 'responseNode', options: {} },
      id: 'webhook', name: 'Recibir formulario', type: 'n8n-nodes-base.webhook', typeVersion: 2,
      position: [250, 400], webhookId: 'fontana-stock-form',
    },

    sheetsRead('read-config', 'Leer config', SHEETS.CONFIG, [520, 280]),
    sheetsRead('read-stock', 'Leer stock', SHEETS.STOCK, [520, 520]),

    codeNode('validar', 'Validar PIN y parsear', [820, 400], validarCode),

    ifNode('if-valid', 'Request valido?', [1100, 400], '={{ $json.error }}', 'false'),

    // Error response
    respond('resp-error', 'Responder error', [1400, 600], '={{ JSON.stringify({ ok: false, error: $json.mensaje }) }}'),

    // ── IF chains for valid requests ──
    ifNode('if-compra', 'Es compra?', [1400, 400], '={{ $json.action }}', 'registrar_compra'),

    // ── COMPRA branch ──
    codeNode('proc-compra', 'Procesar compra', [1700, 240], compraCode),
    ifNode('if-write', 'Escritura OK?', [2000, 240], '={{ $json._write }}', 'true'),
    sheetsUpdate('upd-stock', 'Actualizar stock', SHEETS.STOCK, [2300, 160], 'SKU'),
    sheetsAppend('log-mov', 'Registrar movimiento', SHEETS.MOVIMIENTOS, [2300, 320]),
    respond('resp-compra', 'Responder compra OK', [2600, 240], '={{ JSON.stringify($json.resultado) }}'),
    respond('resp-compra-err', 'Responder compra error', [2300, 440], '={{ JSON.stringify({ ok: false, error: $json.error }) }}'),

    // ── CONSULTA branch (stock + alertas) ──
    ifNode('if-pedido', 'Es pedido?', [1400, 600], '={{ $json.action }}', 'registrar_pedido'),

    // Pedido → Execute BOM subflow
    {
      parameters: { source: 'parameter', workflowId: { __rl: true, mode: 'id', value: '' }, options: {} },
      id: 'exec-bom', name: 'Calcular materiales', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2,
      position: [1700, 560],
    },
    respond('resp-pedido', 'Responder pedido', [2000, 560], '={{ JSON.stringify($json) }}'),

    // Consultas (stock + alertas)
    codeNode('proc-consulta', 'Formatear consulta', [1700, 760], consultaCode),
    respond('resp-consulta', 'Responder consulta', [2000, 760], '={{ $json.resultado }}'),

    // Stickies
    stickyNote('s1', 'Sticky - ENTRADA', [170, 300], '## ENTRADA\nWebhook POST.', 380, 200),
    stickyNote('s2', 'Sticky - VALIDACION', [740, 300], '## VALIDACION\nPIN + parsing.', 400, 200),
    stickyNote('s3', 'Sticky - COMPRA', [1620, 100], '## COMPRA\nUpdate stock + log.', 1080, 420),
    stickyNote('s4', 'Sticky - PEDIDO', [1620, 500], '## PEDIDO\nCalculo BOM.', 480, 180),
    stickyNote('s5', 'Sticky - CONSULTA', [1620, 700], '## CONSULTAS\nStock y alertas.', 480, 180),
  ],

  connections: {
    'Recibir formulario': { main: [[{ node: 'Leer config', type: 'main', index: 0 }, { node: 'Leer stock', type: 'main', index: 0 }]] },
    'Leer config': { main: [[{ node: 'Validar PIN y parsear', type: 'main', index: 0 }]] },
    'Leer stock': { main: [[{ node: 'Validar PIN y parsear', type: 'main', index: 0 }]] },
    'Validar PIN y parsear': { main: [[{ node: 'Request valido?', type: 'main', index: 0 }]] },
    'Request valido?': {
      main: [
        [{ node: 'Es compra?', type: 'main', index: 0 }],
        [{ node: 'Responder error', type: 'main', index: 0 }],
      ],
    },
    'Es compra?': {
      main: [
        [{ node: 'Procesar compra', type: 'main', index: 0 }],
        [{ node: 'Es pedido?', type: 'main', index: 0 }],
      ],
    },
    'Procesar compra': { main: [[{ node: 'Escritura OK?', type: 'main', index: 0 }]] },
    'Escritura OK?': {
      main: [
        [{ node: 'Actualizar stock', type: 'main', index: 0 }, { node: 'Registrar movimiento', type: 'main', index: 0 }],
        [{ node: 'Responder compra error', type: 'main', index: 0 }],
      ],
    },
    'Actualizar stock': { main: [[{ node: 'Responder compra OK', type: 'main', index: 0 }]] },
    'Registrar movimiento': { main: [[{ node: 'Responder compra OK', type: 'main', index: 0 }]] },
    'Es pedido?': {
      main: [
        [{ node: 'Calcular materiales', type: 'main', index: 0 }],
        [{ node: 'Formatear consulta', type: 'main', index: 0 }],
      ],
    },
    'Calcular materiales': { main: [[{ node: 'Responder pedido', type: 'main', index: 0 }]] },
    'Formatear consulta': { main: [[{ node: 'Responder consulta', type: 'main', index: 0 }]] },
  },

  settings: { executionOrder: 'v1' },
  staticData: null, tags: [], pinData: {},
};

saveWorkflow('formulario-webhook.json', workflow);
