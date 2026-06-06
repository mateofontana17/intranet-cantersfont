#!/usr/bin/env node
/**
 * Genera flow_reporte_programado — reporte periodico por email.
 * Trigger: cron configurable (default semanal lunes 8am).
 */
const { SHEETS, CREDS, sheetsRead, codeNode, stickyNote, saveWorkflow } = require('./shared');

// ── Code: Generar reporte HTML completo ──
const reporteCode = `// Por que Code: generar HTML con metricas agregadas, top consumidos,
// valor total de stock — no se puede con Set/IF
const stock = $('Leer stock').all();
const movimientos = $('Leer movimientos').all();
const pedidos = $('Leer pedidos').all();
const ahora = new Date();
const fecha = ahora.toLocaleDateString('es-AR');
const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR', {minimumFractionDigits: 0});

// Periodo: ultimos 7 dias
const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
const movPeriodo = movimientos.filter(m => new Date(m.json.TIMESTAMP) >= hace7d);

// Contar por tipo
const compras = movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'COMPRA').length;
const consumos = movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'CONSUMO_PEDIDO').length;
const ajustes = movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'AJUSTE_MANUAL').length;

// Top 10 insumos mas consumidos
const consumosPorSku = {};
movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'CONSUMO_PEDIDO').forEach(m => {
  const sku = m.json.SKU || '';
  consumosPorSku[sku] = (consumosPorSku[sku] || 0) + (parseInt(m.json.CANTIDAD) || 0);
});
const top10 = Object.entries(consumosPorSku)
  .sort((a, b) => b[1] - a[1]).slice(0, 10);

// Stock bajo
const alertas = stock.filter(s => {
  const min = parseInt(s.json.STOCK_MINIMO);
  return !isNaN(min) && min > 0 && (parseInt(s.json.STOCK) || 0) < min;
});
const sinStock = stock.filter(s => (parseInt(s.json.STOCK) || 0) === 0
  && parseInt(s.json.STOCK_MINIMO) > 0);

// Valor total
const valorTotal = stock.reduce((sum, s) => {
  return sum + ((parseInt(s.json.STOCK) || 0) * (parseFloat(s.json.PRECIO_COSTO) || 0));
}, 0);

// Pedidos pendientes
const pendientes = pedidos.filter(p => p.json.ESTADO === 'PENDIENTE_MATERIAL');

// HTML
const li = (t) => '<li>' + t + '</li>';
let html = '<h2>Reporte Semanal de Stock — Fontana</h2>';
html += '<p><b>Periodo:</b> ' + hace7d.toLocaleDateString('es-AR') + ' al ' + fecha + '</p>';

html += '<h3>Resumen de movimientos</h3><ul>';
html += li('Compras: ' + compras);
html += li('Consumos por pedido: ' + consumos);
html += li('Ajustes manuales: ' + ajustes);
html += li('Total: ' + movPeriodo.length);
html += '</ul>';

if (top10.length) {
  html += '<h3>Top 10 insumos mas consumidos</h3><ol>';
  top10.forEach(([sku, cant]) => {
    const item = stock.find(s => s.json.SKU === sku);
    const nombre = item ? (item.json['PRODUCTO/COLOR'] || sku) : sku;
    html += li(nombre + ' (' + sku + '): ' + cant + ' u.');
  });
  html += '</ol>';
}

if (sinStock.length || alertas.length) {
  html += '<h3>Alertas de stock</h3><ul>';
  sinStock.forEach(s => html += li('<span style="color:red">SIN STOCK</span> ' + s.json.SKU + ' ' + (s.json['PRODUCTO/COLOR'] || '')));
  alertas.filter(a => (parseInt(a.json.STOCK) || 0) > 0).forEach(s => {
    html += li('<span style="color:orange">BAJO</span> ' + s.json.SKU + ' ' + (s.json['PRODUCTO/COLOR'] || '') + ' — Stock: ' + s.json.STOCK + '/' + s.json.STOCK_MINIMO);
  });
  html += '</ul>';
}

html += '<h3>Valor total del stock</h3><p><b>' + fmt(valorTotal) + '</b></p>';

if (pendientes.length) {
  html += '<h3>Pedidos pendientes de material (' + pendientes.length + ')</h3><ul>';
  pendientes.slice(0, 10).forEach(p => {
    html += li('#' + p.json.ID_PEDIDO + ' — ' + p.json.TIPO_MUEBLE + ' ' + p.json.MEDIDAS + ' (' + p.json.COLOR + ')');
  });
  html += '</ul>';
}

return [{ json: {
  asunto: 'Reporte Semanal de Stock — Fontana — ' + fecha,
  cuerpo: html,
} }];`;

// ── Workflow ──
const workflow = {
  name: 'Fontana — Reporte programado de stock',
  nodes: [
    // Schedule trigger: lunes 8am
    {
      parameters: {
        rule: {
          interval: [{
            field: 'cronExpression',
            expression: '0 8 * * 1',
          }],
        },
      },
      id: 'trigger-cron',
      name: 'Ejecutar reporte semanal',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [250, 500],
    },

    sheetsRead('read-stock', 'Leer stock', SHEETS.STOCK, [560, 340]),
    sheetsRead('read-mov', 'Leer movimientos', SHEETS.MOVIMIENTOS, [560, 500]),
    sheetsRead('read-ped', 'Leer pedidos', SHEETS.PEDIDOS, [560, 660]),

    codeNode('gen-reporte', 'Generar reporte completo', [960, 500], reporteCode),

    // Gmail
    {
      parameters: {
        sendTo: 'CONFIGURAR_EMAIL_DESTINO',
        subject: '={{ $json.asunto }}',
        emailType: 'html',
        message: '={{ $json.cuerpo }}',
        options: {},
      },
      id: 'send-email',
      name: 'Enviar reporte por Email',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: [1260, 500],
      credentials: CREDS.gmail,
    },

    stickyNote('s1', 'Sticky Note - TRIGGER', [170, 420], '## TRIGGER\nCron: Lunes 8am (configurable).', 200, 160),
    stickyNote('s2', 'Sticky Note - LECTURA', [480, 260], '## LECTURA\nStock, movimientos, pedidos.', 200, 480),
    stickyNote('s3', 'Sticky Note - REPORTE', [880, 400], '## REPORTE\nGenera HTML con metricas y envia por email.', 480, 220),
  ],

  connections: {
    'Ejecutar reporte semanal': {
      main: [[
        { node: 'Leer stock', type: 'main', index: 0 },
        { node: 'Leer movimientos', type: 'main', index: 0 },
        { node: 'Leer pedidos', type: 'main', index: 0 },
      ]],
    },
    'Leer stock': {
      main: [[{ node: 'Generar reporte completo', type: 'main', index: 0 }]],
    },
    'Leer movimientos': {
      main: [[{ node: 'Generar reporte completo', type: 'main', index: 0 }]],
    },
    'Leer pedidos': {
      main: [[{ node: 'Generar reporte completo', type: 'main', index: 0 }]],
    },
    'Generar reporte completo': {
      main: [[{ node: 'Enviar reporte por Email', type: 'main', index: 0 }]],
    },
  },

  settings: { executionOrder: 'v1' },
  staticData: null,
  tags: [],
  pinData: {},
};

saveWorkflow('reporte-programado.json', workflow);
