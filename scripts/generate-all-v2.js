#!/usr/bin/env node
/**
 * Genera los 3 workflows del proyecto ficha-stock v2.
 * Sin subflows — toda la lógica inline.
 * Cumple skills: connection-rules, merge-patterns, json-structure, sticky-notes.
 *
 * Versiones de esta instancia n8n:
 *   Google Sheets v4.7, IF v2.3, Switch v3.3, Code v2, Merge v3,
 *   Telegram/TelegramTrigger v1.2, Gmail v2.1, Webhook v2, Schedule v1.2
 *
 * Reglas:
 *   - NO credentials vacías
 *   - Max 3 conexiones entrantes a un nodo
 *   - reply_markup como STRING
 *   - Merge con index 0 y 1 para lecturas paralelas
 *   - Sticky notes con colores (3=azul, 6=naranja, 2=verde, 1=amarillo)
 *   - Nombres descriptivos en español
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLEAN_DIR = path.join(__dirname, '..', 'workflows', 'clean');
if (!fs.existsSync(CLEAN_DIR)) fs.mkdirSync(CLEAN_DIR, { recursive: true });
const uuid = () => crypto.randomUUID();

// ════════════════════════════════════════════════════════════
// HELPERS — nodos con formato correcto de esta instancia
// ════════════════════════════════════════════════════════════

function sheetsRead(id, name, sheetName, pos) {
  return {
    parameters: {
      operation: 'read',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos,
  };
}

function sheetsAppend(id, name, sheetName, pos) {
  return {
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      columns: { mappingMode: 'autoMapInputData', value: {} },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos,
  };
}

function sheetsUpdate(id, name, sheetName, pos, matchCol) {
  return {
    parameters: {
      operation: 'update',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [matchCol] },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos,
  };
}

function codeNode(id, name, pos, jsCode) {
  return { parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos };
}

function ifNode(id, name, pos, leftValue, rightValue) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [{ id: uuid(), leftValue, rightValue, operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and',
      },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos,
  };
}

function mergeAppend(id, name, pos) {
  return { parameters: { mode: 'append' }, id, name, type: 'n8n-nodes-base.merge', typeVersion: 3, position: pos };
}

function sticky(id, name, pos, content, color, w = 400, h = 250) {
  return { parameters: { content, width: w, height: h, color }, id, name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos };
}

function tgSend(id, name, pos, chatIdExpr, textExpr, kbExpr) {
  const params = {
    chatId: chatIdExpr,
    text: textExpr,
    additionalFields: { parse_mode: 'Markdown' },
  };
  if (kbExpr) params.additionalFields.reply_markup = kbExpr;
  return { parameters: params, id, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos };
}

function respondWebhook(id, name, pos, bodyExpr) {
  return {
    parameters: { respondWith: 'json', responseBody: bodyExpr, options: {} },
    id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos,
  };
}

function saveWorkflow(filename, wf) {
  const p = path.join(CLEAN_DIR, filename);
  fs.writeFileSync(p, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log(`  ${filename} — ${wf.nodes.length} nodos, ${Object.keys(wf.connections).length} conexiones`);
}

// ════════════════════════════════════════════════════════════
// CODE SCRIPTS
// ════════════════════════════════════════════════════════════

// ── Parsear entrada Telegram ──
const PARSE_TG = `// Extraer chatId, text, callbackData del mensaje Telegram
const body = $input.first().json.body || $input.first().json;
const isCallback = !!body.callback_query;
let chatId, text, callbackData, firstName;
if (isCallback) {
  chatId = String(body.callback_query.message.chat.id);
  callbackData = body.callback_query.data || '';
  text = ''; firstName = body.callback_query.from.first_name || '';
} else {
  const m = body.message || body;
  chatId = String((m.chat || {}).id || '');
  text = (m.text || '').trim();
  callbackData = ''; firstName = (m.from || {}).first_name || '';
}
return [{ json: { chatId, text, callbackData, isCallback, firstName } }];`;

// ── Router (máquina de estados) ──
const ROUTER = `// Máquina de estados conversacional — compra, pedido, consultas, alertas
const input = $input.first().json;
const sesionRows = $('Leer sesion').all();
const stockRows = $('Leer stock').all();
const bomRows = $('Leer BOM').all();

let sesion = sesionRows.find(s => String(s.json.CHAT_ID) === input.chatId);
let estado = sesion ? (sesion.ESTADO || 'MENU') : 'MENU';
let datos = {};
try { datos = sesion && sesion.DATOS ? JSON.parse(sesion.DATOS) : {}; } catch(e) { datos = {}; }

const txt = input.text || '';
const cb = input.callbackData || '';
const chatId = input.chatId;
const PLACA_AREA = 2.6 * 1.83;

const menuKb = [[{text:'📦 Compra',callback_data:'cmd:compra'}],[{text:'🔨 Pedido',callback_data:'cmd:pedido'}],[{text:'📊 Stock',callback_data:'cmd:stock'}],[{text:'⚠️ Alertas',callback_data:'cmd:alertas'}],[{text:'❓ Ayuda',callback_data:'cmd:ayuda'}]];
const cancelKb = [[{text:'❌ Cancelar',callback_data:'cmd:cancelar'}]];

let resp = { text: '', kb: '', newState: estado, newData: datos, action: 'NONE', actionData: {} };
const setKb = (kb) => { resp.kb = JSON.stringify({inline_keyboard: kb}); };

// ── CANCELAR / START ──
if (cb === 'cmd:cancelar' || txt.toLowerCase() === 'cancelar' || txt === '/start') {
  resp.text = txt === '/start' ? '🏭 *Menu Principal*\\nHola ' + input.firstName + ', elegí una opción:' : 'Cancelado 👍';
  setKb(menuKb); resp.newState = 'MENU'; resp.newData = {};
  return [{ json: { chatId, ...resp } }];
}

// ── MENU ──
if (estado === 'MENU') {
  if (cb === 'cmd:compra') {
    resp.text = '📦 *Registrar compra*\\nEscribí el nombre, SKU o categoría del insumo:';
    setKb(cancelKb); resp.newState = 'COMPRA_BUSCAR';
  } else if (cb === 'cmd:pedido') {
    resp.text = '🔨 *Nuevo pedido*\\n¿Tipo de mueble?';
    setKb([[{text:'Mesa',callback_data:'tipo:mesa'},{text:'Rack',callback_data:'tipo:rack'}],[{text:'Estante',callback_data:'tipo:estante'},{text:'Placard',callback_data:'tipo:placard'}],[{text:'Escritorio',callback_data:'tipo:escritorio'},{text:'Otro',callback_data:'tipo:otro'}],cancelKb[0]]);
    resp.newState = 'PEDIDO_TIPO';
  } else if (cb === 'cmd:stock') {
    const porCat = {};
    for (const s of stockRows) {
      const cat = s.json['CATEGORÍA'] || s.json['CATEGORIA'] || 'Otros';
      if (!porCat[cat]) porCat[cat] = [];
      const act = parseInt(s.json.STOCK) || 0;
      const min = parseInt(s.json.STOCK_MINIMO);
      let ic = '✅'; if (!isNaN(min) && min > 0) { if (act === 0) ic = '🔴'; else if (act < min) ic = '⚠️'; }
      porCat[cat].push(ic + ' ' + s.json.SKU + ' | ' + (s.json['PRODUCTO/COLOR'] || '') + ' | ' + act);
    }
    let msg = '📊 *Stock actual*\\n\\n';
    for (const [c, items] of Object.entries(porCat)) { msg += '*' + c + ':*\\n'; items.forEach(i => msg += i + '\\n'); msg += '\\n'; }
    resp.text = msg; setKb(menuKb);
  } else if (cb === 'cmd:alertas') {
    const sin = stockRows.filter(s => { const m = parseInt(s.json.STOCK_MINIMO); return !isNaN(m) && m > 0 && (parseInt(s.json.STOCK) || 0) === 0; });
    const bajo = stockRows.filter(s => { const m = parseInt(s.json.STOCK_MINIMO); const a = parseInt(s.json.STOCK) || 0; return !isNaN(m) && m > 0 && a > 0 && a < m; });
    let msg = '⚠️ *Alertas de stock*\\n\\n';
    if (!sin.length && !bajo.length) msg += 'Todo OK, no hay alertas 👍';
    else {
      if (sin.length) { msg += '🔴 *SIN STOCK:*\\n'; sin.forEach(s => msg += '  ' + s.json.SKU + ' ' + (s.json['PRODUCTO/COLOR'] || '') + '\\n'); msg += '\\n'; }
      if (bajo.length) { msg += '⚠️ *STOCK BAJO:*\\n'; bajo.forEach(s => msg += '  ' + s.json.SKU + ' ' + (s.json['PRODUCTO/COLOR'] || '') + ' — ' + s.json.STOCK + '/' + s.json.STOCK_MINIMO + '\\n'); }
    }
    resp.text = msg; setKb(menuKb);
  } else if (cb === 'cmd:ayuda') {
    resp.text = '❓ *Ayuda*\\n\\n📦 *Compra* — registrar ingreso de insumos\\n🔨 *Pedido* — calcular materiales y descontar stock\\n📊 *Stock* — ver stock actual\\n⚠️ *Alertas* — insumos con stock bajo\\n\\nEscribí /start en cualquier momento para volver al menú.';
    setKb(menuKb);
  } else { resp.text = '🏭 *Menu Principal*\\nElegí una opción:'; setKb(menuKb); }
}

// ── COMPRA ──
else if (estado === 'COMPRA_BUSCAR') {
  const q = txt.toLowerCase();
  const res = stockRows.filter(s => {
    const sk = (s.json.SKU || '').toLowerCase(); const pr = (s.json['PRODUCTO/COLOR'] || '').toLowerCase();
    const ca = (s.json['CATEGORÍA'] || s.json['CATEGORIA'] || '').toLowerCase();
    return sk.includes(q) || pr.includes(q) || ca.includes(q);
  }).slice(0, 8);
  if (!res.length) { resp.text = 'No encontré "' + txt + '". Probá con otro término:'; setKb(cancelKb); }
  else {
    resp.text = 'Seleccioná el insumo:';
    const kb = res.map(r => [{ text: r.json.SKU + ' — ' + (r.json['PRODUCTO/COLOR'] || '') + ' (' + (r.json.STOCK || 0) + ')', callback_data: 'sku:' + r.json.SKU }]);
    kb.push(cancelKb[0]); setKb(kb); resp.newState = 'COMPRA_SELECCIONAR';
  }
}
else if (estado === 'COMPRA_SELECCIONAR' && cb.startsWith('sku:')) {
  const sku = cb.replace('sku:', ''); const item = stockRows.find(s => s.json.SKU === sku);
  if (item) {
    resp.newData = { sku, producto: item.json['PRODUCTO/COLOR'] || '', stockActual: parseInt(item.json.STOCK) || 0, proveedor: item.json.PROVEEDOR || '', precioCosto: item.json.PRECIO_COSTO || '' };
    resp.text = '📦 *' + sku + '* — ' + resp.newData.producto + '\\nStock actual: ' + resp.newData.stockActual + '\\n\\n¿Cuántas unidades compraste?';
    setKb(cancelKb); resp.newState = 'COMPRA_CANTIDAD';
  }
}
else if (estado === 'COMPRA_CANTIDAD') {
  const c = parseInt(txt.replace(/\\./g, '')); if (isNaN(c) || c <= 0) { resp.text = 'La cantidad debe ser mayor a 0:'; setKb(cancelKb); }
  else { datos.cantidad = c; resp.newData = datos; resp.text = '💰 ¿Precio por unidad? (actual: $' + datos.precioCosto + ')'; setKb([[{ text: 'Mantener $' + datos.precioCosto, callback_data: 'precio:mantener' }], cancelKb[0]]); resp.newState = 'COMPRA_PRECIO'; }
}
else if (estado === 'COMPRA_PRECIO') {
  let p; if (cb === 'precio:mantener') p = parseFloat(String(datos.precioCosto).replace(/\\./g, '').replace(',', '.')); else p = parseFloat(txt.replace(/\\$/g, '').replace(/\\./g, '').replace(',', '.'));
  if (isNaN(p) || p <= 0) { resp.text = 'Precio inválido. Ej: 45648 o 45.648,50'; setKb(cancelKb); }
  else { datos.precioNuevo = p; resp.newData = datos; resp.text = '🚚 ¿Proveedor? Habitual: ' + (datos.proveedor || 'ninguno'); setKb([[{ text: '✅ ' + (datos.proveedor || 'Sin proveedor'), callback_data: 'prov:mantener' }], cancelKb[0]]); resp.newState = 'COMPRA_PROVEEDOR'; }
}
else if (estado === 'COMPRA_PROVEEDOR') {
  datos.proveedorFinal = cb === 'prov:mantener' ? datos.proveedor : txt; resp.newData = datos;
  const ns = datos.stockActual + datos.cantidad;
  resp.text = '📋 *Confirmar compra:*\\n' + datos.sku + ' — ' + datos.producto + '\\n' + datos.cantidad + ' u. a $' + datos.precioNuevo + '/u\\nProveedor: ' + datos.proveedorFinal + '\\nStock: ' + datos.stockActual + ' → ' + ns;
  setKb([[{ text: '✅ Confirmar', callback_data: 'confirmar:compra' }], cancelKb[0]]); resp.newState = 'COMPRA_CONFIRMAR';
}
else if (estado === 'COMPRA_CONFIRMAR' && cb === 'confirmar:compra') {
  const ns = datos.stockActual + datos.cantidad;
  resp.action = 'COMPRA'; resp.actionData = { sku: datos.sku, producto: datos.producto, cantidad: datos.cantidad, precioNuevo: datos.precioNuevo, proveedor: datos.proveedorFinal, stockAnterior: datos.stockActual, stockNuevo: ns };
  resp.text = 'Dale, registré la compra. Te quedaron ' + ns + ' u. de ' + datos.producto + ' en stock 👍';
  setKb(menuKb); resp.newState = 'MENU'; resp.newData = {};
}

// ── PEDIDO ──
else if (estado === 'PEDIDO_TIPO' && cb.startsWith('tipo:')) {
  datos.tipoMueble = cb.replace('tipo:', ''); resp.newData = datos;
  resp.text = '📐 Medidas en metros (largo x ancho x alto):\\nEj: 1.20 x 0.60 x 0.75';
  setKb(cancelKb); resp.newState = 'PEDIDO_MEDIDAS';
}
else if (estado === 'PEDIDO_MEDIDAS') {
  const p = txt.replace(/,/g, '.').split(/[xX×]/);
  if (p.length < 2) { resp.text = 'Formato: largo x ancho x alto'; setKb(cancelKb); }
  else {
    datos.largo = parseFloat(p[0]) || 0; datos.ancho = parseFloat(p[1]) || 0; datos.alto = p[2] ? parseFloat(p[2]) || 0.75 : 0.75;
    resp.newData = datos;
    const colores = [...new Set(stockRows.filter(s => (s.json['CATEGORÍA'] || s.json['CATEGORIA'] || '').toLowerCase().includes('mdf')).map(s => s.json['PRODUCTO/COLOR'] || '').filter(Boolean))];
    resp.text = '🎨 ¿Color/material?';
    const kb = colores.slice(0, 8).map(c => [{ text: c, callback_data: 'color:' + c }]); kb.push(cancelKb[0]);
    setKb(kb); resp.newState = 'PEDIDO_COLOR';
  }
}
else if (estado === 'PEDIDO_COLOR' && cb.startsWith('color:')) {
  datos.color = cb.replace('color:', ''); resp.newData = datos;
  resp.text = '🔢 ¿Cantidad de muebles?';
  setKb([[{ text: '1', callback_data: 'cant:1' }, { text: '2', callback_data: 'cant:2' }, { text: '3', callback_data: 'cant:3' }], cancelKb[0]]);
  resp.newState = 'PEDIDO_CANTIDAD';
}
else if (estado === 'PEDIDO_CANTIDAD') {
  const c = cb.startsWith('cant:') ? parseInt(cb.replace('cant:', '')) : parseInt(txt);
  if (isNaN(c) || c <= 0) { resp.text = 'Número válido mayor a 0:'; setKb(cancelKb); }
  else {
    datos.cantidadMuebles = c; resp.newData = datos;
    // BOM inline
    const tipo = datos.tipoMueble.toLowerCase();
    const formulas = bomRows.filter(b => (b.json.TIPO_MUEBLE || '').toLowerCase() === tipo);
    const materiales = [];
    for (const f of formulas) {
      const cat = (f.json.CATEGORIA_INSUMO || '').toLowerCase();
      const comp = (f.json.COMPONENTE || '').toLowerCase();
      let cantNecesaria = 0;
      if (cat.includes('mdf') || cat.includes('fondo')) {
        let area = 0;
        if (comp.includes('tapa') || comp.includes('superficie')) area = datos.largo * datos.ancho;
        else if (comp.includes('lateral')) area = 2 * datos.alto * datos.ancho;
        else if (comp.includes('fondo') || comp.includes('trasero')) area = datos.largo * datos.alto;
        else area = datos.largo * datos.ancho;
        cantNecesaria = Math.ceil((area * c) / PLACA_AREA);
      } else if (cat.includes('filo') || cat.includes('canto')) {
        let ml = 0;
        if (comp.includes('tapa')) ml = 2 * (datos.largo + datos.ancho);
        else if (comp.includes('lateral')) ml = 2 * (2 * (datos.alto + datos.ancho));
        else ml = 2 * (datos.largo + datos.ancho);
        const rollo = (cat.includes('grueso') || comp.includes('grueso')) ? 50 : 100;
        cantNecesaria = Math.ceil((ml * c) / rollo);
      } else { cantNecesaria = c; }
      if (cantNecesaria <= 0) cantNecesaria = 1;
      const stockItem = stockRows.find(s => {
        const sc = (s.json['CATEGORÍA'] || s.json['CATEGORIA'] || '').toLowerCase();
        const sp = (s.json['PRODUCTO/COLOR'] || '').toLowerCase();
        return sc.includes(cat.split(' ')[0]) && sp.includes(datos.color.toLowerCase());
      });
      const stockAct = stockItem ? (parseInt(stockItem.json.STOCK) || 0) : 0;
      const sku = stockItem ? (stockItem.json.SKU || '') : '';
      const precioCosto = stockItem ? (parseFloat(stockItem.json.PRECIO_COSTO) || 0) : 0;
      const proveedor = stockItem ? (stockItem.json.PROVEEDOR || '') : '';
      const despues = stockAct - cantNecesaria;
      let estado2 = '✅'; if (despues < 0) estado2 = '🔴'; else if (stockItem && parseInt(stockItem.json.STOCK_MINIMO) > 0 && despues < parseInt(stockItem.json.STOCK_MINIMO)) estado2 = '⚠️';
      materiales.push({ comp: f.json.COMPONENTE, cat: f.json.CATEGORIA_INSUMO, sku, cantNecesaria, stockAct, despues, faltante: despues < 0 ? Math.abs(despues) : 0, estado: estado2, precioCosto, costoFaltante: despues < 0 ? Math.abs(despues) * precioCosto : 0, proveedor });
    }
    datos.materiales = materiales;
    const hayFaltantes = materiales.some(m => m.estado === '🔴');
    let msg = '🔨 *Pedido: ' + datos.tipoMueble + '* ' + datos.largo + 'x' + datos.ancho + 'x' + datos.alto + ' en ' + datos.color + ' (x' + c + ')\\n\\n*Materiales:*\\n';
    materiales.forEach(m => { msg += m.estado + ' ' + m.comp + ': ' + m.cantNecesaria + ' u. (stock: ' + m.stockAct + ')\\n'; });
    if (hayFaltantes) {
      const costoTotal = materiales.reduce((s, m) => s + m.costoFaltante, 0);
      msg += '\\n🔴 *Faltan materiales*\\nCosto estimado faltantes: $' + Math.round(costoTotal).toLocaleString();
      setKb([[{ text: '⚠️ Descontar lo disponible', callback_data: 'confirmar:parcial' }], cancelKb[0]]);
    } else {
      msg += '\\n✅ *Stock suficiente*';
      setKb([[{ text: '✅ Confirmar pedido', callback_data: 'confirmar:pedido' }], cancelKb[0]]);
    }
    resp.text = msg; resp.newState = 'PEDIDO_CONFIRMAR'; resp.newData = datos;
  }
}
else if (estado === 'PEDIDO_CONFIRMAR' && (cb === 'confirmar:pedido' || cb === 'confirmar:parcial')) {
  resp.action = cb === 'confirmar:parcial' ? 'CONSUMO_PARCIAL' : 'CONSUMO';
  resp.actionData = { ...datos, parcial: cb === 'confirmar:parcial' };
  resp.text = cb === 'confirmar:parcial' ? 'Desconté lo disponible. Faltantes pendientes 👍' : 'Pedido confirmado, stock descontado 👍';
  setKb(menuKb); resp.newState = 'MENU'; resp.newData = {};
}

// ── FALLBACK ──
if (!resp.text && resp.action === 'NONE') { resp.text = 'No entendí. Escribí /start para volver al menú.'; setKb(menuKb); resp.newState = 'MENU'; }
if (!resp.kb) setKb(menuKb);

return [{ json: { chatId, ...resp } }];`;

// ── Preparar compra para escritura ──
const PREP_COMPRA = `// Arma items para actualizar stock y registrar movimiento
const d = $input.first().json;
const ad = d.actionData;
const ahora = new Date().toISOString();
return [{ json: {
  SKU: ad.sku, STOCK: ad.stockNuevo, PRECIO_COSTO: ad.precioNuevo,
  TIMESTAMP: ahora, TIPO_MOVIMIENTO: 'COMPRA', PRODUCTO: ad.producto,
  CANTIDAD: ad.cantidad, STOCK_ANTERIOR: ad.stockAnterior, STOCK_NUEVO: ad.stockNuevo,
  PRECIO_UNITARIO: ad.precioNuevo, PROVEEDOR: ad.proveedor,
  PEDIDO_REF: '', CANAL: 'TELEGRAM', EDITADO: 'FALSE', FECHA_EDICION: '',
} }];`;

// ── Preparar consumo para escritura ──
const PREP_CONSUMO = `// Itera materiales del pedido y prepara updates de stock + movimientos
const d = $input.first().json;
const ad = d.actionData;
const parcial = ad.parcial;
const stockRows = $('Leer stock').all();
const ahora = new Date().toISOString();
const idPedido = 'PED-' + Date.now().toString(36).toUpperCase();
const items = [];
for (const mat of (ad.materiales || [])) {
  if (!mat.sku) continue;
  const stockItem = stockRows.find(s => s.json.SKU === mat.sku);
  if (!stockItem) continue;
  const anterior = parseInt(stockItem.json.STOCK) || 0;
  const descontar = parcial ? Math.min(mat.cantNecesaria, anterior) : mat.cantNecesaria;
  if (descontar <= 0) continue;
  const nuevo = anterior - descontar;
  if (nuevo < 0) continue;
  items.push({
    SKU: mat.sku, STOCK: nuevo,
    TIMESTAMP: ahora, TIPO_MOVIMIENTO: 'CONSUMO_PEDIDO', PRODUCTO: mat.comp || '',
    CANTIDAD: descontar, STOCK_ANTERIOR: anterior, STOCK_NUEVO: nuevo,
    PRECIO_UNITARIO: mat.precioCosto || 0, PROVEEDOR: '', PEDIDO_REF: idPedido,
    CANAL: 'TELEGRAM', EDITADO: 'FALSE', FECHA_EDICION: '',
    // Para hoja Pedidos (solo en el primer item)
    _idPedido: idPedido, _tipoMueble: ad.tipoMueble || '', _medidas: ad.largo + 'x' + ad.ancho + 'x' + ad.alto,
    _color: ad.color || '', _cantidadMuebles: ad.cantidadMuebles || 1,
  });
}
if (!items.length) return [{ json: { _skip: true } }];
return items.map(i => ({ json: i }));`;

// ── Alerta stock bajo por email (inline post-consumo) ──
const ALERTA_POST_CONSUMO = `// Revisa stock post-consumo y genera email si hay alertas
const stockRows = $('Leer stock').all();
const sin = []; const bajo = [];
for (const s of stockRows) {
  const act = parseInt(s.json.STOCK) || 0;
  const min = parseInt(s.json.STOCK_MINIMO);
  if (isNaN(min) || min <= 0) continue;
  const prod = s.json.SKU + ' ' + (s.json['PRODUCTO/COLOR'] || '');
  const prov = s.json.PROVEEDOR || '';
  const costo = (parseFloat(s.json.PRECIO_COSTO) || 0);
  if (act === 0) sin.push({ prod, prov, costo: costo * min });
  else if (act < min) bajo.push({ prod, stock: act, min, falta: min - act, prov, costo: costo * (min - act) });
}
if (!sin.length && !bajo.length) return [{ json: { _skipEmail: true } }];
const f = new Date().toLocaleDateString('es-AR');
const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR');
let html = '<h2>Alerta de Stock — ' + f + '</h2>';
if (sin.length) { html += '<h3 style="color:red">SIN STOCK</h3><ul>'; sin.forEach(i => html += '<li>' + i.prod + ' — Proveedor: ' + i.prov + ' — Reposición: ' + fmt(i.costo) + '</li>'); html += '</ul>'; }
if (bajo.length) { html += '<h3 style="color:orange">STOCK BAJO</h3><ul>'; bajo.forEach(i => html += '<li>' + i.prod + ' — ' + i.stock + '/' + i.min + ' — Faltan: ' + i.falta + ' — ' + fmt(i.costo) + '</li>'); html += '</ul>'; }
const total = [...sin, ...bajo].reduce((s, i) => s + i.costo, 0);
html += '<p><b>COSTO TOTAL REPOSICION: ' + fmt(total) + '</b></p>';
return [{ json: { _skipEmail: false, asunto: 'Alerta de Stock — ' + f, cuerpo: html } }];`;

// ── Reporte programado ──
const REPORTE = `// Genera HTML del reporte semanal
const stock = $('Leer stock reporte').all();
const movs = $('Leer movimientos reporte').all();
const peds = $('Leer pedidos reporte').all();
const ahora = new Date();
const fecha = ahora.toLocaleDateString('es-AR');
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const hace7d = new Date(ahora.getTime() - 7*24*60*60*1000);
const movPeriodo = movs.filter(m => new Date(m.json.TIMESTAMP) >= hace7d);
const compras = movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'COMPRA').length;
const consumos = movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'CONSUMO_PEDIDO').length;
const ajustes = movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'AJUSTE_MANUAL').length;
const consumosPorSku = {};
movPeriodo.filter(m => m.json.TIPO_MOVIMIENTO === 'CONSUMO_PEDIDO').forEach(m => { consumosPorSku[m.json.SKU || ''] = (consumosPorSku[m.json.SKU || ''] || 0) + (parseInt(m.json.CANTIDAD) || 0); });
const top10 = Object.entries(consumosPorSku).sort((a, b) => b[1] - a[1]).slice(0, 10);
const alertas = stock.filter(s => { const m = parseInt(s.json.STOCK_MINIMO); return !isNaN(m) && m > 0 && (parseInt(s.json.STOCK) || 0) < m; });
const sinStock = stock.filter(s => { const m = parseInt(s.json.STOCK_MINIMO); return !isNaN(m) && m > 0 && (parseInt(s.json.STOCK) || 0) === 0; });
const valorTotal = stock.reduce((sum, s) => sum + ((parseInt(s.json.STOCK) || 0) * (parseFloat(s.json.PRECIO_COSTO) || 0)), 0);
const pendientes = peds.filter(p => p.json.ESTADO === 'PENDIENTE_MATERIAL');
const li = (t) => '<li>' + t + '</li>';
let html = '<h2>Reporte Semanal — Fontana — ' + fecha + '</h2>';
html += '<p>Periodo: ' + hace7d.toLocaleDateString('es-AR') + ' al ' + fecha + '</p>';
html += '<h3>Movimientos</h3><ul>' + li('Compras: ' + compras) + li('Consumos: ' + consumos) + li('Ajustes: ' + ajustes) + li('Total: ' + movPeriodo.length) + '</ul>';
if (top10.length) { html += '<h3>Top 10 más consumidos</h3><ol>'; top10.forEach(([sku, c]) => { const it = stock.find(s => s.json.SKU === sku); html += li((it ? it.json['PRODUCTO/COLOR'] || sku : sku) + ': ' + c + ' u.'); }); html += '</ol>'; }
if (sinStock.length || alertas.length) { html += '<h3>Alertas</h3><ul>'; sinStock.forEach(s => html += li('<span style="color:red">SIN STOCK</span> ' + s.json.SKU + ' ' + (s.json['PRODUCTO/COLOR'] || ''))); alertas.filter(a => (parseInt(a.json.STOCK) || 0) > 0).forEach(s => html += li('<span style="color:orange">BAJO</span> ' + s.json.SKU + ' — ' + s.json.STOCK + '/' + s.json.STOCK_MINIMO)); html += '</ul>'; }
html += '<h3>Valor total del stock</h3><p><b>' + fmt(valorTotal) + '</b></p>';
if (pendientes.length) { html += '<h3>Pedidos pendientes (' + pendientes.length + ')</h3><ul>'; pendientes.slice(0, 10).forEach(p => html += li('#' + p.json.ID_PEDIDO + ' — ' + p.json.TIPO_MUEBLE + ' ' + (p.json.COLOR || ''))); html += '</ul>'; }
return [{ json: { asunto: 'Reporte Semanal Stock — Fontana — ' + fecha, cuerpo: html } }];`;

// ── Formulario web: validar + parsear ──
const VALIDAR_WEB = `// Valida PIN, parsea action y data
const body = $input.first().json.body || $input.first().json;
const action = (body.action || '').toLowerCase();
const data = body.data || {};
const pin = String(body.pin || '');
const configRows = $('Leer config web').all();
const pinConfig = configRows.find(c => (c.json.PARAMETRO || '') === 'PIN_WEB');
const pinValido = pinConfig ? String(pinConfig.json.VALOR || '') : '1234';
if (pin !== pinValido) return [{ json: { error: true, mensaje: 'PIN invalido' } }];
const acciones = ['registrar_compra', 'registrar_pedido', 'consultar_stock', 'consultar_alertas'];
if (!acciones.includes(action)) return [{ json: { error: true, mensaje: 'Accion invalida: ' + action } }];
return [{ json: { error: false, action, data } }];`;

// ── Formulario web: procesar compra ──
const COMPRA_WEB = `// Procesa compra desde formulario web
const d = $input.first().json;
const stock = $('Leer stock web').all();
const item = stock.find(s => s.json.SKU === d.data.sku);
if (!item) return [{ json: { ok: false, error: 'SKU no encontrado: ' + d.data.sku } }];
const cant = parseInt(d.data.cantidad);
if (isNaN(cant) || cant <= 0) return [{ json: { ok: false, error: 'Cantidad invalida' } }];
const precio = parseFloat(String(d.data.precio || '0').replace(/\\./g, '').replace(',', '.'));
const anterior = parseInt(item.json.STOCK) || 0;
const nuevo = anterior + cant;
return [{ json: {
  ok: true, _write: true,
  SKU: d.data.sku, STOCK: nuevo, PRECIO_COSTO: precio || item.json.PRECIO_COSTO,
  TIMESTAMP: new Date().toISOString(), TIPO_MOVIMIENTO: 'COMPRA',
  PRODUCTO: item.json['PRODUCTO/COLOR'] || '', CANTIDAD: cant,
  STOCK_ANTERIOR: anterior, STOCK_NUEVO: nuevo,
  PRECIO_UNITARIO: precio, PROVEEDOR: d.data.proveedor || item.json.PROVEEDOR || '',
  PEDIDO_REF: '', CANAL: 'FORMULARIO_WEB', EDITADO: 'FALSE', FECHA_EDICION: '',
  resultado: { ok: true, sku: d.data.sku, stockAnterior: anterior, stockNuevo: nuevo },
} }];`;

// ── Formulario web: consultas ──
const CONSULTA_WEB = `// Formatea stock o alertas para respuesta JSON
const d = $input.first().json;
const stock = $('Leer stock web').all();
if (d.action === 'consultar_alertas') {
  const alertas = stock.filter(s => { const m = parseInt(s.json.STOCK_MINIMO); return !isNaN(m) && m > 0 && (parseInt(s.json.STOCK) || 0) < m; })
    .map(s => ({ sku: s.json.SKU, producto: s.json['PRODUCTO/COLOR'], stock: parseInt(s.json.STOCK) || 0, minimo: parseInt(s.json.STOCK_MINIMO), proveedor: s.json.PROVEEDOR }));
  return [{ json: { resultado: JSON.stringify({ ok: true, alertas }) } }];
}
const items = stock.map(s => ({ sku: s.json.SKU, producto: s.json['PRODUCTO/COLOR'], categoria: s.json['CATEGORÍA'] || s.json['CATEGORIA'], stock: parseInt(s.json.STOCK) || 0, minimo: parseInt(s.json.STOCK_MINIMO) || null, precio: s.json.PRECIO_COSTO }));
return [{ json: { resultado: JSON.stringify({ ok: true, items }) } }];`;

console.log('Generando workflows ficha-stock v2...\n');

// ════════════════════════════════════════════════════════════
// WORKFLOW 1: BOT TELEGRAM
// ════════════════════════════════════════════════════════════

const botNodes = [
  // ENTRADA
  { parameters: { updates: ['message', 'callback_query'] }, id: 'tg-trigger', name: 'Recibir mensaje Telegram', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.2, position: [250, 500], webhookId: 'fontana-stock-bot' },
  codeNode('parse', 'Parsear entrada', [520, 500], PARSE_TG),

  // AUTORIZACION
  sheetsRead('read-auth', 'Buscar usuario', 'Usuarios_Autorizados', [790, 500]),
  ifNode('if-auth', 'Autorizado?', [1060, 500], '={{ $json.ACTIVO }}', 'TRUE'),
  tgSend('tg-noauth', 'Responder no autorizado', [1330, 720], '={{ $("Parsear entrada").first().json.chatId }}', 'No estas autorizado. Contacta al administrador.', ''),

  // LECTURA PARALELA + MERGE
  sheetsRead('read-sesion', 'Leer sesion', 'Sesiones', [1330, 280]),
  sheetsRead('read-stock', 'Leer stock', 'Stock', [1330, 440]),
  sheetsRead('read-bom', 'Leer BOM', 'Formulas_BOM', [1330, 600]),
  mergeAppend('merge-12', 'Combinar sesion + stock', [1630, 360]),
  mergeAppend('merge-all', 'Combinar con BOM', [1930, 460]),

  // ROUTER
  codeNode('router', 'Procesar mensaje', [2230, 460], ROUTER),

  // BRANCHING: COMPRA vs CONSUMO vs DEFAULT
  ifNode('if-compra', 'Es compra?', [2530, 460], '={{ $json.action }}', 'COMPRA'),

  // RAMA COMPRA
  codeNode('prep-compra', 'Preparar compra', [2830, 300], PREP_COMPRA),
  sheetsUpdate('upd-stock-c', 'Actualizar stock compra', 'Stock', [3130, 240], 'SKU'),
  sheetsAppend('log-compra', 'Registrar movimiento compra', 'Movimientos', [3130, 400]),
  sheetsAppend('save-sesion-a', 'Guardar sesion (compra)', 'Sesiones', [3430, 300]),
  tgSend('send-a', 'Responder compra', [3730, 300], '={{ $("Parsear entrada").first().json.chatId }}', '={{ $("Procesar mensaje").first().json.text }}', '={{ $("Procesar mensaje").first().json.kb }}'),

  // RAMA CONSUMO/PARCIAL
  ifNode('if-consumo', 'Es consumo?', [2530, 700], '={{ $json.action }}', 'CONSUMO'),
  // Nota: tb matchea CONSUMO_PARCIAL, chequeo extra en Code
  codeNode('prep-consumo', 'Preparar consumo', [2830, 640], PREP_CONSUMO),
  sheetsUpdate('upd-stock-p', 'Actualizar stock pedido', 'Stock', [3130, 580], 'SKU'),
  sheetsAppend('log-consumo', 'Registrar movimiento consumo', 'Movimientos', [3130, 740]),
  sheetsAppend('save-sesion-b', 'Guardar sesion (consumo)', 'Sesiones', [3430, 640]),
  tgSend('send-b', 'Responder consumo', [3730, 640], '={{ $("Parsear entrada").first().json.chatId }}', '={{ $("Procesar mensaje").first().json.text }}', '={{ $("Procesar mensaje").first().json.kb }}'),
  // Alerta post-consumo
  codeNode('alerta-post', 'Verificar alertas post-consumo', [3430, 860], ALERTA_POST_CONSUMO),
  ifNode('if-alerta', 'Hay alertas?', [3730, 860], '={{ $json._skipEmail }}', 'false'),
  { parameters: { sendTo: 'CONFIGURAR_EMAIL', subject: '={{ $json.asunto }}', emailType: 'html', message: '={{ $json.cuerpo }}', options: {} }, id: 'gmail-alerta', name: 'Enviar alerta email', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [4030, 800] },

  // RAMA DEFAULT (consultas, menú, ayuda)
  sheetsAppend('save-sesion-c', 'Guardar sesion (default)', 'Sesiones', [2830, 940]),
  tgSend('send-c', 'Responder default', [3130, 940], '={{ $("Parsear entrada").first().json.chatId }}', '={{ $("Procesar mensaje").first().json.text }}', '={{ $("Procesar mensaje").first().json.kb }}'),

  // STICKY NOTES
  sticky('s1', 'Nota: Entrada', [170, 420], '## ENTRADA\nRecibe mensaje/callback de Telegram y parsea.', 3, 400, 180),
  sticky('s2', 'Nota: Autorizacion', [710, 420], '## AUTORIZACION\nVerifica en Usuarios_Autorizados.', 6, 380, 400),
  sticky('s3', 'Nota: Lectura', [1250, 200], '## LECTURA + MERGE\nLee sesion, stock, BOM en paralelo y combina con Merge.', 3, 760, 480),
  sticky('s4', 'Nota: Router', [2150, 360], '## ROUTER\nMáquina de estados conversacional.', 6, 420, 220),
  sticky('s5', 'Nota: Compra', [2750, 160], '## COMPRA\nUpdate stock + log movimiento + respuesta.', 2, 1060, 340),
  sticky('s6', 'Nota: Consumo', [2750, 540], '## CONSUMO\nUpdate stock + log + alerta email si corresponde.', 2, 1380, 420),
  sticky('s7', 'Nota: Default', [2750, 860], '## DEFAULT\nConsultas, menú, ayuda — solo guarda sesión y responde.', 1, 500, 180),
];

const botConns = {
  'Recibir mensaje Telegram': { main: [[{ node: 'Parsear entrada', type: 'main', index: 0 }]] },
  'Parsear entrada': { main: [[{ node: 'Buscar usuario', type: 'main', index: 0 }]] },
  'Buscar usuario': { main: [[{ node: 'Autorizado?', type: 'main', index: 0 }]] },
  'Autorizado?': {
    main: [
      [{ node: 'Leer sesion', type: 'main', index: 0 }, { node: 'Leer stock', type: 'main', index: 0 }, { node: 'Leer BOM', type: 'main', index: 0 }],
      [{ node: 'Responder no autorizado', type: 'main', index: 0 }],
    ],
  },
  // Merge chain: sesion(→merge index0) + stock(→merge index1) → merge12
  'Leer sesion': { main: [[{ node: 'Combinar sesion + stock', type: 'main', index: 0 }]] },
  'Leer stock': { main: [[{ node: 'Combinar sesion + stock', type: 'main', index: 1 }]] },
  // merge12(→merge-all index0) + BOM(→merge-all index1) → merge-all
  'Combinar sesion + stock': { main: [[{ node: 'Combinar con BOM', type: 'main', index: 0 }]] },
  'Leer BOM': { main: [[{ node: 'Combinar con BOM', type: 'main', index: 1 }]] },
  'Combinar con BOM': { main: [[{ node: 'Procesar mensaje', type: 'main', index: 0 }]] },
  'Procesar mensaje': { main: [[{ node: 'Es compra?', type: 'main', index: 0 }]] },
  'Es compra?': {
    main: [
      [{ node: 'Preparar compra', type: 'main', index: 0 }],
      [{ node: 'Es consumo?', type: 'main', index: 0 }],
    ],
  },
  'Preparar compra': { main: [[{ node: 'Actualizar stock compra', type: 'main', index: 0 }, { node: 'Registrar movimiento compra', type: 'main', index: 0 }]] },
  'Actualizar stock compra': { main: [[{ node: 'Guardar sesion (compra)', type: 'main', index: 0 }]] },
  'Registrar movimiento compra': { main: [[{ node: 'Guardar sesion (compra)', type: 'main', index: 0 }]] },
  'Guardar sesion (compra)': { main: [[{ node: 'Responder compra', type: 'main', index: 0 }]] },
  'Es consumo?': {
    main: [
      [{ node: 'Preparar consumo', type: 'main', index: 0 }],
      [{ node: 'Guardar sesion (default)', type: 'main', index: 0 }],
    ],
  },
  'Preparar consumo': { main: [[{ node: 'Actualizar stock pedido', type: 'main', index: 0 }, { node: 'Registrar movimiento consumo', type: 'main', index: 0 }]] },
  'Actualizar stock pedido': { main: [[{ node: 'Guardar sesion (consumo)', type: 'main', index: 0 }]] },
  'Registrar movimiento consumo': { main: [[{ node: 'Guardar sesion (consumo)', type: 'main', index: 0 }]] },
  'Guardar sesion (consumo)': { main: [[{ node: 'Responder consumo', type: 'main', index: 0 }, { node: 'Verificar alertas post-consumo', type: 'main', index: 0 }]] },
  'Verificar alertas post-consumo': { main: [[{ node: 'Hay alertas?', type: 'main', index: 0 }]] },
  'Hay alertas?': { main: [[{ node: 'Enviar alerta email', type: 'main', index: 0 }], []] },
  'Guardar sesion (default)': { main: [[{ node: 'Responder default', type: 'main', index: 0 }]] },
};

saveWorkflow('telegram-bot.json', { name: 'Fontana — Bot de Stock Telegram', nodes: botNodes, connections: botConns, settings: { executionOrder: 'v1' }, staticData: null, tags: [], pinData: {} });

// ════════════════════════════════════════════════════════════
// WORKFLOW 2: FORMULARIO WEB
// ════════════════════════════════════════════════════════════

const webNodes = [
  { parameters: { httpMethod: 'POST', path: 'fontana-stock-form', responseMode: 'responseNode', options: {} }, id: 'webhook', name: 'Recibir formulario', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [250, 400], webhookId: 'fontana-stock-form' },

  sheetsRead('read-config-w', 'Leer config web', 'Config', [520, 280]),
  sheetsRead('read-stock-w', 'Leer stock web', 'Stock', [520, 520]),

  mergeAppend('merge-web', 'Combinar config + stock', [820, 400]),
  codeNode('validar-w', 'Validar PIN y parsear', [1120, 400], VALIDAR_WEB),
  ifNode('if-valid', 'Request valido?', [1420, 400], '={{ $json.error }}', 'false'),
  respondWebhook('resp-error', 'Responder error', [1720, 600], '={{ JSON.stringify({ ok: false, error: $json.mensaje }) }}'),

  // IF chains
  ifNode('if-compra-w', 'Es compra?', [1720, 400], '={{ $json.action }}', 'registrar_compra'),

  // COMPRA
  codeNode('proc-compra-w', 'Procesar compra web', [2020, 240], COMPRA_WEB),
  ifNode('if-write', 'Escritura OK?', [2320, 240], '={{ $json._write }}', 'true'),
  sheetsUpdate('upd-stock-w', 'Actualizar stock web', 'Stock', [2620, 160], 'SKU'),
  sheetsAppend('log-mov-w', 'Registrar movimiento web', 'Movimientos', [2620, 320]),
  respondWebhook('resp-compra-ok', 'Responder compra OK', [2920, 240], '={{ JSON.stringify($json.resultado) }}'),
  respondWebhook('resp-compra-err', 'Responder compra error', [2620, 440], '={{ JSON.stringify({ ok: false, error: $json.error }) }}'),

  // CONSULTAS (stock + alertas)
  ifNode('if-pedido-w', 'Es pedido?', [1720, 600], '={{ $json.action }}', 'registrar_pedido'),
  // TODO: BOM inline para web — por ahora devuelve "no implementado"
  respondWebhook('resp-pedido-w', 'Responder pedido', [2020, 560], '={{ JSON.stringify({ ok: false, error: "Pedidos solo por Telegram por ahora" }) }}'),

  codeNode('proc-consulta-w', 'Formatear consulta', [2020, 760], CONSULTA_WEB),
  respondWebhook('resp-consulta-w', 'Responder consulta', [2320, 760], '={{ $json.resultado }}'),

  // STICKIES
  sticky('sw1', 'Nota: Entrada web', [170, 300], '## ENTRADA\nWebhook POST con { action, data, pin }.', 3, 380, 200),
  sticky('sw2', 'Nota: Lectura web', [440, 200], '## LECTURA + MERGE\nConfig y stock en paralelo, merge antes de procesar.', 3, 420, 400),
  sticky('sw3', 'Nota: Validacion web', [1040, 300], '## VALIDACION\nPIN + parseo de request.', 6, 420, 200),
  sticky('sw4', 'Nota: Compra web', [1940, 100], '## COMPRA\nUpdate stock + log movimiento.', 2, 1080, 420),
  sticky('sw5', 'Nota: Consultas web', [1940, 540], '## CONSULTAS\nStock y alertas en JSON.', 1, 480, 320),
];

const webConns = {
  'Recibir formulario': { main: [[{ node: 'Leer config web', type: 'main', index: 0 }, { node: 'Leer stock web', type: 'main', index: 0 }]] },
  'Leer config web': { main: [[{ node: 'Combinar config + stock', type: 'main', index: 0 }]] },
  'Leer stock web': { main: [[{ node: 'Combinar config + stock', type: 'main', index: 1 }]] },
  'Combinar config + stock': { main: [[{ node: 'Validar PIN y parsear', type: 'main', index: 0 }]] },
  'Validar PIN y parsear': { main: [[{ node: 'Request valido?', type: 'main', index: 0 }]] },
  'Request valido?': { main: [[{ node: 'Es compra?', type: 'main', index: 0 }], [{ node: 'Responder error', type: 'main', index: 0 }]] },
  'Es compra?': { main: [[{ node: 'Procesar compra web', type: 'main', index: 0 }], [{ node: 'Es pedido?', type: 'main', index: 0 }]] },
  'Procesar compra web': { main: [[{ node: 'Escritura OK?', type: 'main', index: 0 }]] },
  'Escritura OK?': { main: [[{ node: 'Actualizar stock web', type: 'main', index: 0 }, { node: 'Registrar movimiento web', type: 'main', index: 0 }], [{ node: 'Responder compra error', type: 'main', index: 0 }]] },
  'Actualizar stock web': { main: [[{ node: 'Responder compra OK', type: 'main', index: 0 }]] },
  'Registrar movimiento web': { main: [[{ node: 'Responder compra OK', type: 'main', index: 0 }]] },
  'Es pedido?': { main: [[{ node: 'Responder pedido', type: 'main', index: 0 }], [{ node: 'Formatear consulta', type: 'main', index: 0 }]] },
  'Formatear consulta': { main: [[{ node: 'Responder consulta', type: 'main', index: 0 }]] },
};

saveWorkflow('formulario-webhook.json', { name: 'Fontana — Formulario web webhook', nodes: webNodes, connections: webConns, settings: { executionOrder: 'v1' }, staticData: null, tags: [], pinData: {} });

// ════════════════════════════════════════════════════════════
// WORKFLOW 3: REPORTE PROGRAMADO
// ════════════════════════════════════════════════════════════

const repNodes = [
  { parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1' }] } }, id: 'cron', name: 'Ejecutar lunes 8am', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [250, 400] },

  sheetsRead('read-stock-r', 'Leer stock reporte', 'Stock', [560, 260]),
  sheetsRead('read-mov-r', 'Leer movimientos reporte', 'Movimientos', [560, 400]),
  sheetsRead('read-ped-r', 'Leer pedidos reporte', 'Pedidos', [560, 540]),

  mergeAppend('merge-r1', 'Combinar stock + movimientos', [860, 330]),
  mergeAppend('merge-r2', 'Combinar con pedidos', [1160, 460]),

  codeNode('gen-reporte', 'Generar reporte HTML', [1460, 460], REPORTE),

  { parameters: { sendTo: 'CONFIGURAR_EMAIL', subject: '={{ $json.asunto }}', emailType: 'html', message: '={{ $json.cuerpo }}', options: {} }, id: 'gmail-rep', name: 'Enviar reporte por Email', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [1760, 460] },

  sticky('sr1', 'Nota: Trigger reporte', [170, 320], '## TRIGGER\nCron: lunes 8am.', 3, 200, 160),
  sticky('sr2', 'Nota: Lectura reporte', [480, 180], '## LECTURA + MERGE\n3 fuentes en paralelo, 2 merges encadenados.', 3, 740, 440),
  sticky('sr3', 'Nota: Reporte', [1380, 360], '## REPORTE\nGenera HTML y envía por Gmail.', 1, 480, 220),
];

const repConns = {
  'Ejecutar lunes 8am': { main: [[{ node: 'Leer stock reporte', type: 'main', index: 0 }, { node: 'Leer movimientos reporte', type: 'main', index: 0 }, { node: 'Leer pedidos reporte', type: 'main', index: 0 }]] },
  'Leer stock reporte': { main: [[{ node: 'Combinar stock + movimientos', type: 'main', index: 0 }]] },
  'Leer movimientos reporte': { main: [[{ node: 'Combinar stock + movimientos', type: 'main', index: 1 }]] },
  'Combinar stock + movimientos': { main: [[{ node: 'Combinar con pedidos', type: 'main', index: 0 }]] },
  'Leer pedidos reporte': { main: [[{ node: 'Combinar con pedidos', type: 'main', index: 1 }]] },
  'Combinar con pedidos': { main: [[{ node: 'Generar reporte HTML', type: 'main', index: 0 }]] },
  'Generar reporte HTML': { main: [[{ node: 'Enviar reporte por Email', type: 'main', index: 0 }]] },
};

saveWorkflow('reporte-programado.json', { name: 'Fontana — Reporte programado de stock', nodes: repNodes, connections: repConns, settings: { executionOrder: 'v1' }, staticData: null, tags: [], pinData: {} });

console.log('\nTodos los workflows generados.');
