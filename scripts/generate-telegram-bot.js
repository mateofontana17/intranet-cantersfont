#!/usr/bin/env node
/**
 * Genera flow_telegram_bot v2 — sin Switch, sin convergencias, reply_markup como string.
 * Arquitectura: IF chains, cada rama termina con su propio save session + send.
 */
const { SHEETS, sheetsRead, sheetsAppend, sheetsUpdate, codeNode, stickyNote, saveWorkflow } = require('./shared');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

// ════════════════════════════════════════════════════════════
// CODE NODE SCRIPTS
// ════════════════════════════════════════════════════════════

const parsearEntradaCode = `// Por que Code: extraer datos de Telegram (text vs callback)
const msg = $input.first().json;
const body = msg.body || msg;
const isCallback = !!body.callback_query;
let chatId, text, callbackData, firstName;

if (isCallback) {
  chatId = String(body.callback_query.message.chat.id);
  callbackData = body.callback_query.data || '';
  text = '';
  firstName = body.callback_query.from.first_name || '';
} else {
  const m = body.message || body;
  chatId = String((m.chat || {}).id || '');
  text = (m.text || '').trim();
  callbackData = '';
  firstName = (m.from || {}).first_name || '';
}

return [{ json: { chatId, text, callbackData, isCallback, firstName } }];`;

// The router now does EVERYTHING: routing, formatting responses, stock queries, alerts
// It outputs: text, keyboardJson (stringified), newState, newData, action, actionData
const routerCode = `// Por que Code: maquina de estados conversacional con 15+ estados
const input = $input.first().json;
const sesionRows = $('Leer sesion usuario').all();
const stockRows = $('Leer stock completo').all();

let sesion = sesionRows.length ? sesionRows[0].json : null;
let estado = sesion ? (sesion.ESTADO || 'MENU') : 'MENU';
let datos = {};
try { datos = sesion && sesion.DATOS ? JSON.parse(sesion.DATOS) : {}; } catch(e) { datos = {}; }

const txt = input.text || '';
const cb = input.callbackData || '';
const chatId = input.chatId;

const menuKb = [[{text:'📦 Compra',callback_data:'cmd:compra'}],[{text:'🔨 Pedido',callback_data:'cmd:pedido'}],[{text:'📊 Stock',callback_data:'cmd:stock'}],[{text:'⚠️ Alertas',callback_data:'cmd:alertas'}],[{text:'❓ Ayuda',callback_data:'cmd:ayuda'}]];

let resp = { text: '', keyboardJson: '', newState: estado, newData: datos, action: 'NONE', actionData: {}, sesionExiste: !!sesion };

const setKb = (kb) => { resp.keyboardJson = JSON.stringify({inline_keyboard: kb}); };
const cancelKb = [[{text:'❌ Cancelar',callback_data:'cmd:cancelar'}]];

if (cb === 'cmd:cancelar' || txt.toLowerCase() === 'cancelar' || txt === '/start') {
  resp.text = txt === '/start' ? '🏭 Menu Principal\\nHola ' + input.firstName + ', selecciona:' : 'Cancelado 👍';
  setKb(menuKb); resp.newState = 'MENU'; resp.newData = {};
  return [{ json: { chatId, ...resp } }];
}

if (estado === 'MENU') {
  if (cb === 'cmd:compra') {
    resp.text = '📦 Registrar compra\\n¿Que insumo? Escribi nombre, SKU o categoria:';
    setKb(cancelKb); resp.newState = 'COMPRA_BUSCAR';
  } else if (cb === 'cmd:pedido') {
    resp.text = '🔨 Nuevo pedido\\n¿Tipo de mueble?';
    setKb([[{text:'Mesa',callback_data:'tipo:mesa'},{text:'Rack',callback_data:'tipo:rack'}],[{text:'Estante',callback_data:'tipo:estante'},{text:'Placard',callback_data:'tipo:placard'}],[{text:'Escritorio',callback_data:'tipo:escritorio'},{text:'Otro',callback_data:'tipo:otro'}],cancelKb[0]]);
    resp.newState = 'PEDIDO_TIPO';
  } else if (cb === 'cmd:stock') {
    // Format stock inline
    const porCat = {};
    for (const s of stockRows) {
      const cat = s.json['CATEGORIA'] || s.json['CATEGORÍA'] || 'Otros';
      if (!porCat[cat]) porCat[cat] = [];
      const actual = parseInt(s.json.STOCK) || 0;
      const min = parseInt(s.json.STOCK_MINIMO);
      let ic = '✅';
      if (!isNaN(min) && min > 0) { if (actual===0) ic='🔴'; else if (actual<min) ic='⚠️'; }
      porCat[cat].push(ic+' '+s.json.SKU+' | '+(s.json['PRODUCTO/COLOR']||'')+' | '+actual);
    }
    let msg = '📊 Stock actual\\n\\n';
    for (const [c, items] of Object.entries(porCat)) { msg += c+':\\n'; items.forEach(i => msg += i+'\\n'); msg += '\\n'; }
    resp.text = msg; setKb(menuKb); resp.newState = 'MENU';
  } else if (cb === 'cmd:alertas') {
    const alertas = stockRows.filter(s => { const m=parseInt(s.json.STOCK_MINIMO); return !isNaN(m)&&m>0&&(parseInt(s.json.STOCK)||0)<m; });
    const sin = stockRows.filter(s => { const m=parseInt(s.json.STOCK_MINIMO); return !isNaN(m)&&m>0&&(parseInt(s.json.STOCK)||0)===0; });
    let msg = '⚠️ Stock bajo\\n\\n';
    if (!alertas.length && !sin.length) msg += 'Todo OK 👍';
    else { if (sin.length) { msg+='🔴 SIN STOCK:\\n'; sin.forEach(s=>msg+='  '+s.json.SKU+' '+(s.json['PRODUCTO/COLOR']||'')+'\\n'); }
    const b=alertas.filter(a=>(parseInt(a.json.STOCK)||0)>0); if(b.length){msg+='\\n⚠️ BAJO:\\n'; b.forEach(s=>msg+='  '+s.json.SKU+' '+(s.json['PRODUCTO/COLOR']||'')+' '+s.json.STOCK+'/'+s.json.STOCK_MINIMO+'\\n');}}
    resp.text = msg; setKb(menuKb); resp.newState = 'MENU';
  } else if (cb === 'cmd:ayuda') {
    resp.text = '❓ Ayuda\\n📦 Compra: ingreso insumos\\n🔨 Pedido: calcula y descuenta\\n📊 Stock: consulta\\n⚠️ Alertas: stock bajo';
    setKb(menuKb); resp.newState = 'MENU';
  } else {
    resp.text = '🏭 Menu Principal'; setKb(menuKb);
  }
} else if (estado === 'COMPRA_BUSCAR') {
  const q = txt.toLowerCase();
  const res = stockRows.filter(s => { const sk=(s.json.SKU||'').toLowerCase(); const pr=(s.json['PRODUCTO/COLOR']||'').toLowerCase(); const ca=(s.json['CATEGORIA']||s.json['CATEGORÍA']||'').toLowerCase(); return sk.includes(q)||pr.includes(q)||ca.includes(q); }).slice(0,8);
  if (!res.length) { resp.text = 'No encontre "'+txt+'". Intenta de nuevo:'; setKb(cancelKb); }
  else { resp.text = '📦 Selecciona insumo:'; const kb = res.map(r=>[{text:r.json.SKU+' — '+(r.json['PRODUCTO/COLOR']||'')+' ('+r.json.STOCK+')',callback_data:'sku:'+r.json.SKU}]); kb.push(cancelKb[0]); setKb(kb); resp.newState = 'COMPRA_SELECCIONAR'; }
} else if (estado === 'COMPRA_SELECCIONAR' && cb.startsWith('sku:')) {
  const sku = cb.replace('sku:',''); const item = stockRows.find(s=>s.json.SKU===sku);
  if (item) { resp.newData={sku,producto:item.json['PRODUCTO/COLOR']||'',stockActual:parseInt(item.json.STOCK)||0,proveedor:item.json.PROVEEDOR||'',precioCosto:item.json.PRECIO_COSTO||''}; resp.text='📦 '+sku+' — '+resp.newData.producto+'\\nStock: '+resp.newData.stockActual+'\\n\\n¿Cuantas unidades?'; setKb(cancelKb); resp.newState='COMPRA_CANTIDAD'; }
} else if (estado === 'COMPRA_CANTIDAD') {
  const c = parseInt(txt.replace(/\\./g,'')); if (isNaN(c)||c<=0) { resp.text='Numero mayor a 0:'; setKb(cancelKb); }
  else { datos.cantidad=c; resp.newData=datos; resp.text='💰 Precio por unidad? Actual: $'+datos.precioCosto; setKb([[{text:'Mantener $'+datos.precioCosto,callback_data:'precio:mantener'}],cancelKb[0]]); resp.newState='COMPRA_PRECIO'; }
} else if (estado === 'COMPRA_PRECIO') {
  let p; if (cb==='precio:mantener') p=parseFloat(String(datos.precioCosto).replace(/\\./g,'').replace(',','.')); else p=parseFloat(txt.replace(/\\$/g,'').replace(/\\./g,'').replace(',','.'));
  if (isNaN(p)||p<=0) { resp.text='Precio invalido. Ej: 45648'; setKb(cancelKb); }
  else { datos.precioNuevo=p; resp.newData=datos; resp.text='🚚 Proveedor? Habitual: '+datos.proveedor; setKb([[{text:'✅ '+(datos.proveedor||'Sin proveedor'),callback_data:'prov:mantener'}],cancelKb[0]]); resp.newState='COMPRA_PROVEEDOR'; }
} else if (estado === 'COMPRA_PROVEEDOR') {
  const prov = cb==='prov:mantener'?datos.proveedor:txt; datos.proveedorFinal=prov; resp.newData=datos;
  const ns = datos.stockActual+datos.cantidad;
  resp.text='📋 Confirmar compra:\\n'+datos.sku+' — '+datos.producto+'\\n'+datos.cantidad+' u. a $'+datos.precioNuevo+'/u\\nProveedor: '+prov+'\\nStock: '+datos.stockActual+' → '+ns;
  setKb([[{text:'✅ Confirmar',callback_data:'confirmar:compra'}],cancelKb[0]]); resp.newState='COMPRA_CONFIRMAR';
} else if (estado === 'COMPRA_CONFIRMAR' && cb==='confirmar:compra') {
  const ns = datos.stockActual+datos.cantidad;
  resp.action='EJECUTAR_COMPRA';
  resp.actionData={sku:datos.sku,producto:datos.producto,cantidad:datos.cantidad,precioNuevo:datos.precioNuevo,proveedor:datos.proveedorFinal,stockAnterior:datos.stockActual,stockNuevo:ns};
  resp.text='Compra registrada. '+datos.producto+': '+ns+' u. en stock 👍';
  setKb(menuKb); resp.newState='MENU'; resp.newData={};
} else if (estado === 'PEDIDO_TIPO' && cb.startsWith('tipo:')) {
  datos.tipoMueble=cb.replace('tipo:',''); resp.newData=datos;
  resp.text='📐 Medidas (largo x ancho x alto en metros):\\nEj: 1.20 x 0.60 x 0.75'; setKb(cancelKb); resp.newState='PEDIDO_MEDIDAS';
} else if (estado === 'PEDIDO_MEDIDAS') {
  const p=txt.replace(/,/g,'.').split(/[xX×]/); if(p.length<2){resp.text='Formato: largo x ancho x alto';setKb(cancelKb);}
  else{datos.largo=parseFloat(p[0])||0;datos.ancho=parseFloat(p[1])||0;datos.alto=p[2]?parseFloat(p[2])||0.75:0.75;resp.newData=datos;
  const colores=[...new Set(stockRows.filter(s=>(s.json['CATEGORIA']||s.json['CATEGORÍA']||'').toLowerCase().includes('mdf')).map(s=>s.json['PRODUCTO/COLOR']||'').filter(Boolean))];
  resp.text='🎨 Color?'; const kb=colores.slice(0,8).map(c=>[{text:c,callback_data:'color:'+c}]); kb.push(cancelKb[0]); setKb(kb); resp.newState='PEDIDO_COLOR';}
} else if (estado === 'PEDIDO_COLOR' && cb.startsWith('color:')) {
  datos.color=cb.replace('color:',''); resp.newData=datos;
  resp.text='🔢 Cantidad de muebles?'; setKb([[{text:'1',callback_data:'cant:1'},{text:'2',callback_data:'cant:2'},{text:'3',callback_data:'cant:3'}],cancelKb[0]]); resp.newState='PEDIDO_CANTIDAD';
} else if (estado === 'PEDIDO_CANTIDAD') {
  const c=cb.startsWith('cant:')?parseInt(cb.replace('cant:','')):parseInt(txt);
  if(isNaN(c)||c<=0){resp.text='Numero valido:';}
  else{datos.cantidad=c;resp.newData=datos;resp.action='CALCULAR_PEDIDO';resp.actionData={tipo_mueble:datos.tipoMueble,largo:datos.largo,ancho:datos.ancho,alto:datos.alto,color:datos.color,cantidad:c};resp.newState='PEDIDO_CONFIRMAR';}
} else if (estado === 'PEDIDO_CONFIRMAR' && cb==='confirmar:pedido') {
  resp.action='EJECUTAR_CONSUMO'; resp.actionData=datos;
  resp.text='Pedido confirmado, stock descontado 👍'; setKb(menuKb); resp.newState='MENU'; resp.newData={};
}

if (!resp.text && resp.action==='NONE') {
  resp.text='No entendi. Escribi /start para volver al menu.'; setKb(menuKb); resp.newState='MENU';
}
if (!resp.keyboardJson) setKb(menuKb);

return [{ json: { chatId, ...resp } }];`;

const prepararCompraCode = `// Por que Code: armar datos para update stock y append movimiento
const d = $input.first().json;
const ad = d.actionData;
const ahora = new Date().toISOString();
return [{ json: {
  ...d,
  SKU: ad.sku, STOCK: ad.stockNuevo, PRECIO_COSTO: ad.precioNuevo,
  TIMESTAMP: ahora, TIPO_MOVIMIENTO: 'COMPRA', PRODUCTO: ad.producto,
  CANTIDAD: ad.cantidad, STOCK_ANTERIOR: ad.stockAnterior, STOCK_NUEVO: ad.stockNuevo,
  PRECIO_UNITARIO: ad.precioNuevo, PROVEEDOR: ad.proveedor,
  PEDIDO_REF: '', CANAL: 'TELEGRAM', EDITADO: 'FALSE', FECHA_EDICION: '',
} }];`;

// ════════════════════════════════════════════════════════════
// HELPER: build IF node (correct v2.3 format)
// ════════════════════════════════════════════════════════════
function ifNode(id, name, position, leftValue, rightValue) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [{
          id: uuid(),
          leftValue,
          rightValue,
          operator: { type: 'string', operation: 'equals' },
        }],
        combinator: 'and',
      },
      options: {},
    },
    id, name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.3,
    position,
  };
}

// HELPER: session save node
function sessionSave(id, name, position) {
  return {
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: SHEETS.SESIONES },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          CHAT_ID: '={{ $("Procesar mensaje").first().json.chatId }}',
          ESTADO: '={{ $("Procesar mensaje").first().json.newState }}',
          DATOS: '={{ JSON.stringify($("Procesar mensaje").first().json.newData || {}) }}',
          UPDATED_AT: '={{ new Date().toISOString() }}',
        },
      },
      options: {},
    },
    id, name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position,
  };
}

// HELPER: telegram send node (reply_markup as STRING in additionalFields)
function tgSend(id, name, position) {
  return {
    parameters: {
      chatId: '={{ $("Parsear entrada").first().json.chatId }}',
      text: '={{ $("Procesar mensaje").first().json.text || "Menu" }}',
      additionalFields: {
        parse_mode: 'Markdown',
        reply_markup: '={{ $("Procesar mensaje").first().json.keyboardJson || "" }}',
      },
    },
    id, name,
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position,
  };
}

// ════════════════════════════════════════════════════════════
// WORKFLOW
// ════════════════════════════════════════════════════════════
const workflow = {
  name: 'Fontana — Bot de Stock Telegram',
  nodes: [
    // ── ENTRADA ──
    {
      parameters: { updates: ['message', 'callback_query'] },
      id: 'trigger-tg', name: 'Recibir mensaje Telegram',
      type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.2,
      position: [250, 500], webhookId: 'fontana-stock-bot',
    },
    codeNode('parse', 'Parsear entrada', [520, 500], parsearEntradaCode),

    // ── AUTORIZACION ──
    sheetsRead('read-auth', 'Buscar usuario', SHEETS.USUARIOS, [790, 500]),
    ifNode('if-auth', 'Autorizado?', [1060, 500], '={{ $json.ACTIVO }}', 'TRUE'),
    {
      parameters: { chatId: '={{ $("Parsear entrada").first().json.chatId }}', text: 'No estas autorizado.', additionalFields: {} },
      id: 'tg-noauth', name: 'Responder no autorizado',
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1330, 700],
    },

    // ── SESION + STOCK ──
    sheetsRead('read-sesion', 'Leer sesion usuario', SHEETS.SESIONES, [1330, 400]),
    sheetsRead('read-stock', 'Leer stock completo', SHEETS.STOCK, [1330, 240]),

    // ── ROUTER ──
    codeNode('router', 'Procesar mensaje', [1660, 400], routerCode),

    // ── BRANCHING: IF chains (no Switch) ──
    ifNode('if-compra', 'Es compra?', [1960, 400], '={{ $json.action }}', 'EJECUTAR_COMPRA'),

    // ── BRANCH A: COMPRA → prep → update → log → save → send ──
    codeNode('prep-compra', 'Preparar compra', [2260, 240], prepararCompraCode),
    sheetsUpdate('upd-stock-c', 'Actualizar stock', SHEETS.STOCK, [2560, 180], 'SKU'),
    sheetsAppend('log-compra', 'Registrar movimiento', SHEETS.MOVIMIENTOS, [2560, 340]),
    sessionSave('save-a', 'Guardar sesion A', [2860, 240]),
    tgSend('send-a', 'Enviar respuesta A', [3160, 240]),

    // ── BRANCH B: NOT COMPRA → check consumo ──
    ifNode('if-consumo', 'Es consumo?', [1960, 620], '={{ $json.action }}', 'EJECUTAR_CONSUMO'),

    // ── BRANCH B1: CONSUMO → update → log → pedido → save → send ──
    sheetsUpdate('upd-stock-p', 'Actualizar stock pedido', SHEETS.STOCK, [2260, 560], 'SKU'),
    sheetsAppend('log-consumo', 'Registrar consumo', SHEETS.MOVIMIENTOS, [2560, 500]),
    sheetsAppend('log-pedido', 'Registrar pedido', SHEETS.PEDIDOS, [2560, 660]),
    sessionSave('save-b', 'Guardar sesion B', [2860, 560]),
    tgSend('send-b', 'Enviar respuesta B', [3160, 560]),

    // ── BRANCH C: DEFAULT (menu, consultas, ayuda) → save → send ──
    sessionSave('save-c', 'Guardar sesion C', [2260, 840]),
    tgSend('send-c', 'Enviar respuesta C', [2560, 840]),

    // ── STICKY NOTES ──
    stickyNote('s1', 'Sticky - ENTRADA', [170, 420], '## ENTRADA\nTelegram trigger + parse.', 380, 160),
    stickyNote('s2', 'Sticky - AUTH', [710, 420], '## AUTORIZACION\nVerifica en Usuarios_Autorizados.', 380, 380),
    stickyNote('s3', 'Sticky - SESION', [1250, 160], '## SESION + DATOS\nLee sesion y stock.', 440, 300),
    stickyNote('s4', 'Sticky - ROUTER', [1580, 300], '## ROUTER\nMaquina de estados.', 420, 220),
    stickyNote('s5', 'Sticky - COMPRA', [2180, 120], '## COMPRA\nUpdate stock + log.', 1060, 300),
    stickyNote('s6', 'Sticky - CONSUMO', [2180, 440], '## CONSUMO\nUpdate stock + log + pedido.', 1060, 320),
    stickyNote('s7', 'Sticky - DEFAULT', [2180, 770], '## DEFAULT\nMenu, consultas, ayuda.', 480, 180),
  ],

  connections: {
    'Recibir mensaje Telegram': { main: [[{ node: 'Parsear entrada', type: 'main', index: 0 }]] },
    'Parsear entrada': { main: [[{ node: 'Buscar usuario', type: 'main', index: 0 }]] },
    'Buscar usuario': { main: [[{ node: 'Autorizado?', type: 'main', index: 0 }]] },
    'Autorizado?': {
      main: [
        [{ node: 'Leer sesion usuario', type: 'main', index: 0 }, { node: 'Leer stock completo', type: 'main', index: 0 }],
        [{ node: 'Responder no autorizado', type: 'main', index: 0 }],
      ],
    },
    'Leer sesion usuario': { main: [[{ node: 'Procesar mensaje', type: 'main', index: 0 }]] },
    'Leer stock completo': { main: [[{ node: 'Procesar mensaje', type: 'main', index: 0 }]] },
    'Procesar mensaje': { main: [[{ node: 'Es compra?', type: 'main', index: 0 }]] },
    'Es compra?': {
      main: [
        [{ node: 'Preparar compra', type: 'main', index: 0 }],
        [{ node: 'Es consumo?', type: 'main', index: 0 }],
      ],
    },
    'Preparar compra': { main: [[{ node: 'Actualizar stock', type: 'main', index: 0 }, { node: 'Registrar movimiento', type: 'main', index: 0 }]] },
    'Actualizar stock': { main: [[{ node: 'Guardar sesion A', type: 'main', index: 0 }]] },
    'Registrar movimiento': { main: [[{ node: 'Guardar sesion A', type: 'main', index: 0 }]] },
    'Guardar sesion A': { main: [[{ node: 'Enviar respuesta A', type: 'main', index: 0 }]] },
    'Es consumo?': {
      main: [
        [{ node: 'Actualizar stock pedido', type: 'main', index: 0 }],
        [{ node: 'Guardar sesion C', type: 'main', index: 0 }],
      ],
    },
    'Actualizar stock pedido': { main: [[{ node: 'Registrar consumo', type: 'main', index: 0 }, { node: 'Registrar pedido', type: 'main', index: 0 }]] },
    'Registrar consumo': { main: [[{ node: 'Guardar sesion B', type: 'main', index: 0 }]] },
    'Registrar pedido': { main: [[{ node: 'Guardar sesion B', type: 'main', index: 0 }]] },
    'Guardar sesion B': { main: [[{ node: 'Enviar respuesta B', type: 'main', index: 0 }]] },
    'Guardar sesion C': { main: [[{ node: 'Enviar respuesta C', type: 'main', index: 0 }]] },
  },

  settings: { executionOrder: 'v1' },
  staticData: null, tags: [], pinData: {},
};

saveWorkflow('telegram-bot.json', workflow);
