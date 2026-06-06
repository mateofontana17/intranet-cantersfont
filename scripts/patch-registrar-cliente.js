#!/usr/bin/env node
/**
 * Fix registrar_cliente: dice OK pero no agrega a la sheet.
 *
 * CAUSA: el nodo "Generar Cliente ID" (insertado entre Switch y Crear Cliente)
 *        aplana el item a {cliente_id, nombre, ...}, pero "Crear Cliente"
 *        sigue leyendo $json.body.data.X que ya no existe → append vacío.
 *        Además el ID timestamp (CLI-227371) rompe la edición (que deriva
 *        row_number de CLI-XXX).
 *
 * FIX:  - Bypass de "Generar Cliente ID": Switch[7] → Crear Cliente directo.
 *       - Crear Cliente lee $json.body.data.X (existe justo tras el Switch).
 *       - cliente_id se deja vacío: el listado lo deriva de row_number
 *         (CLI-{fila}), consistente con editar_cliente.
 *       - Schema completo de la hoja Clientes.
 *       - Eliminar el nodo huérfano "Generar Cliente ID".
 *
 * Uso: node patch-registrar-cliente.js --apply
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_WF = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';

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

const wf = JSON.parse(fs.readFileSync(LOCAL_WF, 'utf8'));

// 1. Reescribir " Crear Cliente": leer body.data, schema completo, sin cliente_id
const crear = wf.nodes.find(n => n.name === ' Crear Cliente');
if (!crear) throw new Error('No se encontró " Crear Cliente"');

crear.parameters.columns = {
  mappingMode: 'defineBelow',
  value: {
    // cliente_id se deja vacío a propósito: el listado lo deriva de row_number
    // (CLI-{fila}), consistente con el flujo de editar_cliente.
    'cliente_id': '',
    'nombre': '={{ $json.body.data.nombre }}',
    'telefono': '={{ $json.body.data.telefono }}',
    'email': '={{ $json.body.data.email }}',
    'direccion': '={{ $json.body.data.direccion }}',
    'localidad': '={{ $json.body.data.localidad }}',
    'notas': '={{ $json.body.data.notas }}',
  },
  matchingColumns: [],
  schema: [
    { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'nombre', displayName: 'nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'telefono', displayName: 'telefono', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'email', displayName: 'email', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'direccion', displayName: 'direccion', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'localidad', displayName: 'localidad', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'notas', displayName: 'notas', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
  ],
  attemptToConvertTypes: false,
  convertFieldsToString: false,
};
crear.parameters.operation = 'append';
console.log('✔ " Crear Cliente" reescrito: lee body.data, schema completo, cliente_id vacío (derivado)');

// 2. Rewire Switch[7] (Registrar Cliente) → " Crear Cliente" directo (bypass Generar Cliente ID)
const rules = wf.nodes.find(n => n.name === 'Switch').parameters.rules.values;
const idx = rules.findIndex(r => r.conditions.conditions.some(c => String(c.rightValue).includes('registrar_cliente')));
if (idx < 0) throw new Error('No se encontró regla registrar_cliente');
wf.connections.Switch.main[idx] = [{ node: ' Crear Cliente', type: 'main', index: 0 }];
console.log(`✔ Switch[${idx}] (registrar_cliente) → " Crear Cliente" (bypass Generar Cliente ID)`);

// 3. Eliminar nodo huérfano "Generar Cliente ID" y su conexión
const before = wf.nodes.length;
wf.nodes = wf.nodes.filter(n => n.name !== 'Generar Cliente ID');
delete wf.connections['Generar Cliente ID'];
if (wf.nodes.length < before) console.log('✔ Nodo huérfano "Generar Cliente ID" eliminado');

// Guardar
fs.writeFileSync(LOCAL_WF, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('\n✔ Workflow local guardado. Nodos:', wf.nodes.length);

if (!process.argv.includes('--apply')) {
  console.log('\n── DRY RUN ── Usá --apply para pushear.');
  return;
}

(async () => {
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.N8N_API_KEY || '';
  const endpoint = `${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  const payload = {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: { executionOrder: 'v1' },
  };
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.error('✖', res.status, await res.text()); process.exit(1); }
  const r = JSON.parse(await res.text());
  console.log('✔ Pusheado. versionId:', r.versionId);
  const act = await fetch(endpoint + '/activate', { method: 'POST', headers: { 'X-N8N-API-KEY': apiKey } });
  console.log('✔ Activate:', act.status);
})();
