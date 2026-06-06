#!/usr/bin/env node
/**
 * F + G: proyecto vinculado a cliente registrado + cascade de nombre.
 *
 * Schema "Estado de Pedidos" (Proyectos):
 *   proyecto_id, fecha_alta, estado, cliente_id, cliente_nombre,
 *   direccion_colocacion, clasificacion_cliente, como_nos_conocio, espacios,
 *   que_te_dijo, fecha_tentativa, notas, vendedor
 *
 * - Parsear Proyecto: requiere cliente_id (cliente registrado), guarda
 *   cliente_nombre denormalizado + campos del proyecto.
 * - Crear Proyecto / Mapear Estado de Pedidos: schema nuevo.
 * - editar_cliente: re-cablea cascade (Update Cliente Row → Leer Pedidos
 *   Cascade → Filtrar → Update Pedidos Cliente Nombre → Responder) para
 *   sincronizar cliente_nombre en los proyectos del cliente editado.
 *
 * Uso: node patch-proyecto-cliente.js --apply
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_WF = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';
const DOC = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const GID_PEDIDOS = 440974926;

function loadEnv(p){const v={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>-1)v[t.slice(0,i).trim()]=t.slice(i+1).trim();}return v;}

const wf = JSON.parse(fs.readFileSync(LOCAL_WF,'utf8'));
const get = n => wf.nodes.find(x=>x.name===n);

const COLS = ['proyecto_id','fecha_alta','estado','cliente_id','cliente_nombre','direccion_colocacion','clasificacion_cliente','como_nos_conocio','espacios','que_te_dijo','fecha_tentativa','notas','vendedor'];

// ── 1. Parsear Proyecto (cliente_id requerido) ──
get('Parsear Proyecto').parameters.jsCode = `// Etapa 1 — alta de proyecto vinculado a cliente registrado
const body = $json.body || $json;
const data = body.data || {};
const errores = [];
const limpiar = s => (typeof s === 'string' ? s.trim() : (s == null ? '' : String(s)));

const cliente_id = limpiar(data.cliente_id);
const cliente_nombre = limpiar(data.cliente_nombre);
const direccion = limpiar(data.direccion_colocacion);
const vendedor = limpiar(data.vendedor);
let espacios = data.espacios;
if (Array.isArray(espacios)) espacios = espacios.map(x => limpiar(x)).filter(Boolean).join(', ');
else espacios = limpiar(espacios);

if (!cliente_id) errores.push('Cliente (debe ser un cliente registrado)');
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
  cliente_id,
  cliente_nombre,
  direccion_colocacion: direccion,
  clasificacion_cliente: limpiar(data.clasificacion_cliente),
  como_nos_conocio: limpiar(data.como_nos_conocio),
  espacios,
  que_te_dijo: limpiar(data.que_te_dijo),
  fecha_tentativa: limpiar(data.fecha_tentativa),
  notas: limpiar(data.notas),
  vendedor,
}}];`;
console.log('✔ Parsear Proyecto: cliente_id requerido');

// ── 2. Crear Proyecto: schema nuevo ──
const crear = get('Crear Proyecto');
crear.parameters.columns = {
  mappingMode:'defineBelow',
  value: Object.fromEntries(COLS.map(c => [c, '={{ $json["'+c+'"] }}'])),
  matchingColumns: [],
  schema: COLS.map(id => ({ id, displayName:id, required:false, defaultMatch:false, display:true, type:'string', canBeUsedToMatch:true })),
  attemptToConvertTypes:false, convertFieldsToString:false,
};
console.log('✔ Crear Proyecto: schema cliente-vinculado');

// ── 3. Mapear Estado de Pedidos: schema nuevo ──
get('Mapear Estado de Pedidos').parameters.jsCode = `// Mapea proyectos (Estado de Pedidos) — cliente vinculado
const items = $input.all().map(i => i.json);
const norm = (v) => (v == null ? '' : (typeof v === 'string' ? v.trim() : v));
return items
  .filter(r => norm(r.proyecto_id) || norm(r.cliente_nombre))
  .map(r => ({ json: {
    proyecto_id: norm(r.proyecto_id),
    fecha_alta: norm(r.fecha_alta),
    estado: norm(r.estado) || 'en_ventas',
    cliente_id: norm(r.cliente_id),
    cliente_nombre: norm(r.cliente_nombre),
    direccion_colocacion: norm(r.direccion_colocacion),
    clasificacion_cliente: norm(r.clasificacion_cliente),
    como_nos_conocio: norm(r.como_nos_conocio),
    espacios: norm(r.espacios),
    que_te_dijo: norm(r.que_te_dijo),
    fecha_tentativa: norm(r.fecha_tentativa),
    notas: norm(r.notas),
    vendedor: norm(r.vendedor),
  }}));`;
console.log('✔ Mapear Estado de Pedidos: schema cliente-vinculado');

// ── 4. Filtrar Pedidos del Cliente: devolver [] si no hay (no romper) ──
get('Filtrar Pedidos del Cliente').parameters.jsCode = `// Filtra proyectos del cliente editado para sincronizar cliente_nombre
const target = $('Parsear Editar Cliente').first().json;
const rows = $input.all().map(i => i.json);
const matches = rows.filter(p => String(p.cliente_id || '').trim() === target.cliente_id_target);
// Sin proyectos del cliente → array vacío (Update no-op, no error)
return matches.map(p => ({ json: {
  row_number: p.row_number,
  proyecto_id: p.proyecto_id || '',
  cliente_id: p.cliente_id,
  cliente_nombre: target.nombre,
}}));`;
// Update Pedidos Cliente Nombre: schema row_number + cliente_nombre
const updPed = get('Update Pedidos Cliente Nombre');
updPed.parameters.columns = {
  mappingMode:'defineBelow',
  value:{ 'row_number':'={{ $json.row_number }}', 'cliente_nombre':'={{ $json.cliente_nombre }}' },
  matchingColumns:['row_number'],
  schema:[
    { id:'row_number', displayName:'row_number', required:false, defaultMatch:false, display:true, type:'number', canBeUsedToMatch:true },
    { id:'cliente_nombre', displayName:'cliente_nombre', required:false, defaultMatch:false, display:true, type:'string', canBeUsedToMatch:true },
  ],
  attemptToConvertTypes:false, convertFieldsToString:false,
};
console.log('✔ Filtrar/Update cascade ajustados');

// ── 5. Re-cablear editar_cliente con cascade ──
const C = wf.connections;
C['Update Cliente Row'] = { main:[[{ node:'Leer Pedidos Cascade', type:'main', index:0 }]] };
C['Leer Pedidos Cascade'] = { main:[[{ node:'Filtrar Pedidos del Cliente', type:'main', index:0 }]] };
C['Filtrar Pedidos del Cliente'] = { main:[[{ node:'Update Pedidos Cliente Nombre', type:'main', index:0 }]] };
C['Update Pedidos Cliente Nombre'] = { main:[[{ node:'Responder Cliente Editado', type:'main', index:0 }]] };
console.log('✔ editar_cliente: cascade reconectado');

fs.writeFileSync(LOCAL_WF, JSON.stringify(wf,null,2)+'\n','utf8');
console.log('\n✔ Workflow local guardado. Nodos:', wf.nodes.length);

if (!process.argv.includes('--apply')) { console.log('\n── DRY RUN ──'); return; }
(async()=>{
  const env=loadEnv(ENV_PATH);
  const baseUrl=(env.N8N_BASE_URL||'').replace(/\/+$/,''); const apiKey=env.N8N_API_KEY||'';
  const endpoint=`${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  let res=await fetch(endpoint,{method:'PUT',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify({name:wf.name,nodes:wf.nodes,connections:wf.connections,settings:{executionOrder:'v1'}})});
  if(!res.ok){console.error('✖',res.status,await res.text());process.exit(1);}
  console.log('✔ PUT OK. versionId:', JSON.parse(await res.text()).versionId);
  res=await fetch(endpoint+'/activate',{method:'POST',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('✔ Activate:', res.status);
})();
