#!/usr/bin/env node
/**
 * Genera flow_alerta_stock_bajo — verifica stock minimo y envia alerta por email.
 * Se ejecuta como subflow despues de cada consumo, o con trigger manual.
 */
const { SHEETS, CREDS, sheetsRead, codeNode, stickyNote, saveWorkflow } = require('./shared');

// ── Code: Filtrar insumos con stock bajo ──
const filtrarCode = `// Por que Code: clasificacion en 3 niveles + calculo de costo reposicion
// no se puede resolver con IF simple (necesita iterar + agregar)
const stock = $('Leer stock completo').all();
const sinStock = [];
const stockBajo = [];

for (const item of stock) {
  const s = item.json;
  const actual = parseInt(s.STOCK) || 0;
  const minimo = parseInt(s.STOCK_MINIMO);
  if (isNaN(minimo) || minimo <= 0) continue; // sin minimo definido, ignorar
  if (actual === 0) {
    sinStock.push({
      sku: s.SKU, producto: s['PRODUCTO/COLOR'] || s.PRODUCTO,
      stock: 0, minimo, faltante: minimo,
      proveedor: s.PROVEEDOR || '',
      costo_reposicion: (parseFloat(s.PRECIO_COSTO) || 0) * minimo,
    });
  } else if (actual < minimo) {
    stockBajo.push({
      sku: s.SKU, producto: s['PRODUCTO/COLOR'] || s.PRODUCTO,
      stock: actual, minimo, faltante: minimo - actual,
      proveedor: s.PROVEEDOR || '',
      costo_reposicion: (parseFloat(s.PRECIO_COSTO) || 0) * (minimo - actual),
    });
  }
}

if (sinStock.length === 0 && stockBajo.length === 0) {
  return [{ json: { hay_alertas: false } }];
}

const costoTotal = [...sinStock, ...stockBajo].reduce((s, i) => s + i.costo_reposicion, 0);
return [{ json: { hay_alertas: true, sinStock, stockBajo, costoTotal } }];`;

// ── Code: Generar email de alerta ──
const emailCode = `// Por que Code: generar HTML con listas dinamicas de items
const d = $input.first().json;
if (!d.hay_alertas) return [{ json: { skip: true } }];
const fecha = new Date().toLocaleDateString('es-AR');
const fmt = (n) => '$' + Number(n).toLocaleString('es-AR', {minimumFractionDigits: 0});
const li = (t) => '<li>' + t + '</li>';

let html = '<h2>Alerta de Stock — ' + fecha + '</h2>';
if (d.sinStock.length) {
  html += '<h3 style="color:red">SIN STOCK</h3><ul>';
  d.sinStock.forEach(i => { html += li(i.sku + ' ' + i.producto + ' — Stock: 0 — Proveedor: ' + i.proveedor + ' — Reposicion: ' + fmt(i.costo_reposicion)); });
  html += '</ul>';
}
if (d.stockBajo.length) {
  html += '<h3 style="color:orange">STOCK BAJO</h3><ul>';
  d.stockBajo.forEach(i => { html += li(i.sku + ' ' + i.producto + ' — Stock: ' + i.stock + ' — Min: ' + i.minimo + ' — Faltan: ' + i.faltante + ' — Proveedor: ' + i.proveedor + ' — Reposicion: ' + fmt(i.costo_reposicion)); });
  html += '</ul>';
}
html += '<p><b>COSTO TOTAL ESTIMADO DE REPOSICION: ' + fmt(d.costoTotal) + '</b></p>';

return [{ json: {
  skip: false,
  asunto: 'Alerta de Stock — ' + fecha,
  cuerpo: html,
} }];`;

// ── Workflow ──
const workflow = {
  name: 'Fontana — Alerta stock bajo',
  nodes: [
    // Trigger doble: subflow o manual
    {
      parameters: {},
      id: 'trigger-sub',
      name: 'Trigger subflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [250, 400],
    },

    sheetsRead('read-stock', 'Leer stock completo', SHEETS.STOCK, [520, 400]),
    codeNode('filtrar', 'Filtrar insumos con stock bajo', [820, 400], filtrarCode),

    sheetsRead('read-config', 'Leer configuracion', SHEETS.CONFIG, [520, 600]),

    codeNode('email-body', 'Generar email de alerta', [1120, 400], emailCode),

    // IF: hay alertas?
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '' },
          conditions: [{
            id: 'cond-alertas',
            leftValue: '={{ $json.skip }}',
            rightValue: 'true',
            operator: { type: 'string', operation: 'notEquals' },
          }],
          combinator: 'and',
        },
        options: {},
      },
      id: 'if-alertas',
      name: '\u00bfHay alertas?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1420, 400],
    },

    // Gmail
    {
      parameters: {
        sendTo: '={{ $("Leer configuracion").first().json.VALOR }}',
        subject: '={{ $json.asunto }}',
        emailType: 'html',
        message: '={{ $json.cuerpo }}',
        options: {},
      },
      id: 'send-email',
      name: 'Enviar alerta por Email',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: [1720, 300],
      credentials: CREDS.gmail,
    },

    stickyNote('s1', 'Sticky Note - LECTURA', [440, 300], '## LECTURA\nLee stock y config.', 200, 380),
    stickyNote('s2', 'Sticky Note - ANALISIS', [740, 300], '## ANALISIS\nFiltra por stock minimo, clasifica.', 420, 200),
    stickyNote('s3', 'Sticky Note - NOTIFICACION', [1340, 220], '## NOTIFICACION\nEnvia email si hay alertas.', 440, 200),
  ],

  connections: {
    'Trigger subflow': {
      main: [[
        { node: 'Leer stock completo', type: 'main', index: 0 },
        { node: 'Leer configuracion', type: 'main', index: 0 },
      ]],
    },
    'Leer stock completo': {
      main: [[{ node: 'Filtrar insumos con stock bajo', type: 'main', index: 0 }]],
    },
    'Filtrar insumos con stock bajo': {
      main: [[{ node: 'Generar email de alerta', type: 'main', index: 0 }]],
    },
    'Generar email de alerta': {
      main: [[{ node: '\u00bfHay alertas?', type: 'main', index: 0 }]],
    },
    '\u00bfHay alertas?': {
      main: [
        [{ node: 'Enviar alerta por Email', type: 'main', index: 0 }],
        [],
      ],
    },
  },

  settings: { executionOrder: 'v1' },
  staticData: null,
  tags: [],
  pinData: {},
};

saveWorkflow('alerta-stock-bajo.json', workflow);
