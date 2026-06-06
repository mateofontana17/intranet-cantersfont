#!/usr/bin/env node
/**
 * Etapa 1 — Proyectos. Retoolea el flujo "pedido" → "proyecto" (alta liviana).
 *
 * - registrar_pedido (Switch[4]): nuevo flujo simple
 *     Parsear Proyecto (valida 12 campos) → Crear Proyecto (append a
 *     "Estado de Pedidos") → Responder Proyecto. Bypass del pipeline viejo
 *     (normalizar pedido / BOM / items / descuento de stock).
 * - listar_pedidos (Switch[5]): Leer Estados de Pedidos → Mapear (proyecto) →
 *     Responder. Se saca la rama de Items/Merge (Etapa 1 no tiene muebles).
 * - editar_cliente (Switch[9]): se quita el cascade a pedidos (ya no aplica).
 *     Parsear → Update Cliente Row → Responder.
 *
 * Tabs intactos: stock, compras, alertas, historial, estandares, clientes.
 *
 * Uso: node patch-proyectos-etapa1.js --apply
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_WF = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';
const DOC = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const CRED = 'LiTV16yWQFogsvNY';
const GID_PEDIDOS = 440974926; // "Estado de Pedidos" (ahora Proyectos)

function loadEnv(p){const v={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>-1)v[t.slice(0,i).trim()]=t.slice(i+1).trim();}return v;}
function uid(p){return p+'-'+Math.random().toString(36).slice(2,10);}

const wf = JSON.parse(fs.readFileSync(LOCAL_WF,'utf8'));
const byName = n => wf.nodes.find(x=>x.name===n);

// ───────── 1. Nodo Parsear Proyecto ─────────
const parseCode = `// Etapa 1 — validar y normalizar alta de proyecto
const body = $json.body || $json;
const data = body.data || {};
const errores = [];
const limpiar = s => (typeof s === 'string' ? s.trim() : (s == null ? '' : String(s)));

const nombre = limpiar(data.nombre);
const apellidos = limpiar(data.apellidos);
const telefono = limpiar(data.telefono);
const direccion = limpiar(data.direccion_colocacion);
const vendedor = limpiar(data.vendedor);
let espacios = data.espacios;
if (Array.isArray(espacios)) espacios = espacios.map(x => limpiar(x)).filter(Boolean).join(', ');
else espacios = limpiar(espacios);

if (!nombre) errores.push('Nombre');
if (!apellidos) errores.push('Apellidos');
if (!telefono) errores.push('Telefono');
if (!direccion) errores.push('Direccion de colocacion');
if (!espacios) errores.push('Espacios (al menos uno)');
if (!vendedor) errores.push('Vendedor');
if (errores.length) throw new Error('Faltan campos obligatorios: ' + errores.join(', '));

const now = new Date();
const yy = String(now.getFullYear()).slice(-2);
const mm = String(now.getMonth()+1).padStart(2,'0');
const dd = String(now.getDate()).padStart(2,'0');
const hh = String(now.getHours()).padStart(2,'0');
const mi = String(now.getMinutes()).padStart(2,'0');
const ss = String(now.getSeconds()).padStart(2,'0');

return [{ json: {
  proyecto_id: 'PRY-' + yy+mm+dd + '-' + hh+mi+ss,
  fecha_alta: now.getFullYear() + '-' + mm + '-' + dd,
  estado: 'en_ventas',
  nombre, apellidos, telefono,
  email: limpiar(data.email),
  direccion_colocacion: direccion,
  clasificacion_cliente: limpiar(data.clasificacion_cliente),
  como_nos_conocio: limpiar(data.como_nos_conocio),
  espacios,
  que_te_dijo: limpiar(data.que_te_dijo),
  fecha_tentativa: limpiar(data.fecha_tentativa),
  notas: limpiar(data.notas),
  vendedor,
}}];`;

const COLS = ['proyecto_id','fecha_alta','estado','nombre','apellidos','telefono','email','direccion_colocacion','clasificacion_cliente','como_nos_conocio','espacios','que_te_dijo','fecha_tentativa','notas','vendedor'];
const schema = COLS.map(id => ({ id, displayName:id, required:false, defaultMatch:false, display:true, type:'string', canBeUsedToMatch:true }));
const valueMap = Object.fromEntries(COLS.map(c => [c, '={{ $json["'+c+'"] }}']));

function upsertNode(node){
  const i = wf.nodes.findIndex(n=>n.name===node.name);
  if(i>=0){ node.id = wf.nodes[i].id; wf.nodes[i]=node; console.log('  ~',node.name); }
  else { wf.nodes.push(node); console.log('  +',node.name); }
}

upsertNode({
  parameters:{ jsCode: parseCode },
  type:'n8n-nodes-base.code', typeVersion:2, position:[-220,1700],
  id: uid('parse-pry'), name:'Parsear Proyecto',
});
upsertNode({
  parameters:{
    operation:'append',
    documentId:{__rl:true,value:DOC,mode:'list',cachedResultName:'Materiales, Stock y Clientes demo'},
    sheetName:{__rl:true,value:GID_PEDIDOS,mode:'list',cachedResultName:'Estado de Pedidos'},
    columns:{ mappingMode:'defineBelow', value: valueMap, matchingColumns:[], schema, attemptToConvertTypes:false, convertFieldsToString:false },
    options:{},
  },
  type:'n8n-nodes-base.googleSheets', typeVersion:4.7, position:[0,1700],
  id: uid('crear-pry'), name:'Crear Proyecto',
  credentials:{ googleSheetsOAuth2Api:{ id:CRED, name:'Google Sheets OAuth2 API' } },
});
upsertNode({
  parameters:{
    respondWith:'json',
    responseBody:'={{ JSON.stringify({ ok: true, mensaje: "Proyecto creado", proyecto_id: $(\'Parsear Proyecto\').first().json.proyecto_id }) }}',
    options:{},
  },
  type:'n8n-nodes-base.respondToWebhook', typeVersion:1.1, position:[220,1700],
  id: uid('resp-pry'), name:'Responder Proyecto',
});

// ───────── 2. Reescribir Mapear Estado de Pedidos (listado proyectos) ─────────
const mapEP = byName('Mapear Estado de Pedidos');
if (mapEP) {
  mapEP.parameters.jsCode = `// Mapea filas de "Estado de Pedidos" (Proyectos Etapa 1)
const items = $input.all().map(i => i.json);
const norm = (v) => (v == null ? '' : (typeof v === 'string' ? v.trim() : v));
return items
  .filter(r => norm(r.proyecto_id) || norm(r.nombre))
  .map(r => ({ json: {
    proyecto_id: norm(r.proyecto_id),
    fecha_alta: norm(r.fecha_alta),
    estado: norm(r.estado) || 'en_ventas',
    nombre: norm(r.nombre),
    apellidos: norm(r.apellidos),
    telefono: norm(r.telefono),
    email: norm(r.email),
    direccion_colocacion: norm(r.direccion_colocacion),
    clasificacion_cliente: norm(r.clasificacion_cliente),
    como_nos_conocio: norm(r.como_nos_conocio),
    espacios: norm(r.espacios),
    que_te_dijo: norm(r.que_te_dijo),
    fecha_tentativa: norm(r.fecha_tentativa),
    notas: norm(r.notas),
    vendedor: norm(r.vendedor),
  }}));`;
  console.log('  ~ Mapear Estado de Pedidos (reescrito a proyectos)');
}
const respEP = byName('Responder Estado de Pedidos');
if (respEP) {
  respEP.parameters.responseBody = '={{ JSON.stringify({ ok: true, proyectos: $input.all().map(i => i.json) }) }}';
  console.log('  ~ Responder Estado de Pedidos (key proyectos)');
}

// ───────── 3. Reconexiones ─────────
const C = wf.connections;
// 3a. registrar_pedido (Switch[4]) → Parsear Proyecto
C.Switch.main[4] = [{ node:'Parsear Proyecto', type:'main', index:0 }];
C['Parsear Proyecto'] = { main:[[{ node:'Crear Proyecto', type:'main', index:0 }]] };
C['Crear Proyecto'] = { main:[[{ node:'Responder Proyecto', type:'main', index:0 }]] };
console.log('  ↻ Switch[4] → Parsear Proyecto → Crear Proyecto → Responder Proyecto');

// 3b. listar_pedidos (Switch[5]) → Leer Estados de Pedidos (solo) → Mapear → Responder
C.Switch.main[5] = [{ node:'Leer Estados de Pedidos', type:'main', index:0 }];
C['Leer Estados de Pedidos'] = { main:[[{ node:'Mapear Estado de Pedidos', type:'main', index:0 }]] };
console.log('  ↻ Switch[5] → Leer Estados de Pedidos → Mapear → Responder (sin Items/Merge)');

// 3c. editar_cliente: quitar cascade a pedidos
C['Update Cliente Row'] = { main:[[{ node:'Responder Cliente Editado', type:'main', index:0 }]] };
console.log('  ↻ editar_cliente: Update Cliente Row → Responder (sin cascade pedidos)');

fs.writeFileSync(LOCAL_WF, JSON.stringify(wf,null,2)+'\n','utf8');
console.log('\n✔ Workflow local guardado. Nodos:', wf.nodes.length);

if (!process.argv.includes('--apply')) { console.log('\n── DRY RUN ── Usá --apply'); return; }

(async()=>{
  const env=loadEnv(ENV_PATH);
  const baseUrl=(env.N8N_BASE_URL||'').replace(/\/+$/,''); const apiKey=env.N8N_API_KEY||'';
  const endpoint=`${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  const payload={ name:wf.name, nodes:wf.nodes, connections:wf.connections, settings:{executionOrder:'v1'} };
  let res=await fetch(endpoint,{method:'PUT',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!res.ok){console.error('✖',res.status,await res.text());process.exit(1);}
  console.log('✔ PUT OK. versionId:', JSON.parse(await res.text()).versionId);
  res=await fetch(endpoint+'/activate',{method:'POST',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('✔ Activate:', res.status);
})();
