#!/usr/bin/env node
/**
 * Fix de editar_cliente + cascade a Pedidos:
 *
 * BUG 1: editar_cliente devuelve OK pero no persiste cambios.
 *   CAUSA: Actualizar Cliente matchea por columna "cliente_id" pero esa
 *          columna está VACÍA en la sheet (los IDs CLI-XXX los genera el
 *          mapper en runtime). Update returns 0 items match → no-op.
 *   FIX:   Reemplazar el flujo con: parsear CLI-XXX → row_number → leer
 *          sheet → buscar fila → escribir por row_number.
 *
 * BUG 2 (feature): al editar cliente, los pedidos del mismo cliente deben
 *   reflejar el cambio de nombre (cliente_nombre).
 *   FIX:   Después de actualizar el cliente, leer Estado de Pedidos, filtrar
 *          los del cliente_id editado, actualizar cliente_nombre.
 *
 * Uso: node patch-editar-cliente-cascade.js --apply
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_WF = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';
const SHEETS_CRED_ID = 'LiTV16yWQFogsvNY';
const SHEET_DOC_ID = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const GID_CLIENTES = 915059545;
const GID_PEDIDOS = 440974926;

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

// ── 1. Reemplazar el flujo de editar_cliente ─────────────────────────────
// El Switch ya tiene la regla "editar_cliente" (output index 9).
// Encontramos qué nodos están en el flujo y los reemplazamos.

// Eliminar el flujo viejo: Actualizar Cliente y Cliente Actualizado (si existen)
const toRemove = ['Actualizar Cliente', 'Cliente Actualizado'];
wf.nodes = wf.nodes.filter(n => !toRemove.includes(n.name));
toRemove.forEach(name => { delete wf.connections[name]; });
console.log('✔ Nodos viejos removidos:', toRemove.join(', '));

// Nodos nuevos para el flujo de edición:
const nodos = [];

// 1.1. Parsear input y derivar row_number desde cliente_id (CLI-XXX → XXX)
nodos.push({
  parameters: {
    jsCode: `// Parsea editar_cliente: extrae cliente_id y deriva row_number.
const body = $json.body || $json;
const data = body.data || body;
const cid = String(data.cliente_id || '').trim();
const m = cid.match(/CLI-(\\d+)/i);
const row_number = m ? Number(m[1]) : null;
if (!cid) throw new Error('[editar_cliente] cliente_id requerido');
if (!row_number) throw new Error('[editar_cliente] cliente_id formato inválido: ' + cid);
return [{
  json: {
    cliente_id_target: cid,
    row_number_target: row_number,
    nombre: String(data.nombre || '').trim(),
    telefono: String(data.telefono || '').trim(),
    email: String(data.email || '').trim(),
    direccion: String(data.direccion || '').trim(),
    localidad: String(data.localidad || '').trim(),
    notas: String(data.notas || '').trim(),
  },
}];`,
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-100, 2200],
  id: uid('parse-edit-cli'),
  name: 'Parsear Editar Cliente',
});

// 1.2. Update fila del cliente en sheet Clientes (matching por row_number)
nodos.push({
  parameters: {
    operation: 'update',
    documentId: {
      __rl: true, value: SHEET_DOC_ID, mode: 'list',
      cachedResultName: 'Materiales, Stock y Clientes demo',
    },
    sheetName: {
      __rl: true, value: GID_CLIENTES, mode: 'list',
      cachedResultName: 'Clientes',
    },
    columns: {
      mappingMode: 'defineBelow',
      value: {
        'row_number': '={{ $json.row_number_target }}',
        'cliente_id': '={{ $json.cliente_id_target }}',
        'nombre': '={{ $json.nombre }}',
        'telefono': '={{ $json.telefono }}',
        'email': '={{ $json.email }}',
        'direccion': '={{ $json.direccion }}',
        'localidad': '={{ $json.localidad }}',
        'notas': '={{ $json.notas }}',
      },
      matchingColumns: ['row_number'],
      schema: [
        { id: 'row_number', displayName: 'row_number', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
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
    },
    options: {},
  },
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  position: [120, 2200],
  id: uid('upd-cli'),
  name: 'Update Cliente Row',
  credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' } },
});

// 1.3. CASCADE: leer pedidos para encontrar los del cliente editado
nodos.push({
  parameters: {
    documentId: {
      __rl: true, value: SHEET_DOC_ID, mode: 'list',
      cachedResultName: 'Materiales, Stock y Clientes demo',
    },
    sheetName: {
      __rl: true, value: GID_PEDIDOS, mode: 'list',
      cachedResultName: 'Estado de Pedidos',
    },
    options: {},
  },
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  position: [340, 2200],
  id: uid('read-ped'),
  name: 'Leer Pedidos Cascade',
  credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' } },
});

// 1.4. Filtrar pedidos del cliente editado y preparar update
nodos.push({
  parameters: {
    jsCode: `// Filtra pedidos del cliente editado y prepara items para update masivo.
const target = $('Parsear Editar Cliente').first().json;
const pedidos = $input.all().map(i => i.json);
const matches = pedidos.filter(p => String(p.cliente_id || '').trim() === target.cliente_id_target);
if (matches.length === 0) return [{ json: { __sin_pedidos: true, cliente_id: target.cliente_id_target } }];
return matches.map(p => ({
  json: {
    row_number: p.row_number,
    pedido_id: p.pedido_id,
    cliente_id: p.cliente_id,
    cliente_nombre: target.nombre, // nuevo nombre del cliente
  },
}));`,
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [560, 2200],
  id: uid('filter-ped'),
  name: 'Filtrar Pedidos del Cliente',
});

// 1.5. Update masivo: cliente_nombre en pedidos del cliente editado
nodos.push({
  parameters: {
    operation: 'update',
    documentId: {
      __rl: true, value: SHEET_DOC_ID, mode: 'list',
      cachedResultName: 'Materiales, Stock y Clientes demo',
    },
    sheetName: {
      __rl: true, value: GID_PEDIDOS, mode: 'list',
      cachedResultName: 'Estado de Pedidos',
    },
    columns: {
      mappingMode: 'defineBelow',
      value: {
        'row_number': '={{ $json.row_number }}',
        'cliente_nombre': '={{ $json.cliente_nombre }}',
      },
      matchingColumns: ['row_number'],
      schema: [
        { id: 'row_number', displayName: 'row_number', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
        { id: 'cliente_nombre', displayName: 'cliente_nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: {},
  },
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  position: [780, 2200],
  id: uid('upd-ped'),
  name: 'Update Pedidos Cliente Nombre',
  credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' } },
});

// 1.6. Responder OK
nodos.push({
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: true, mensaje: "Cliente actualizado", cliente_id: $(\'Parsear Editar Cliente\').first().json.cliente_id_target }) }}',
    options: {},
  },
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [1000, 2200],
  id: uid('resp-edit-cli'),
  name: 'Responder Cliente Editado',
});

// Agregar (o reemplazar) nodos
for (const n of nodos) {
  const idx = wf.nodes.findIndex(x => x.name === n.name);
  if (idx >= 0) { n.id = wf.nodes[idx].id; wf.nodes[idx] = n; console.log('  ~', n.name); }
  else { wf.nodes.push(n); console.log('  +', n.name); }
}

// Conexiones
const switchConns = wf.connections.Switch.main;
// El Switch output 9 (editar_cliente) ahora debe ir a Parsear Editar Cliente
const rules = wf.nodes.find(n=>n.name==='Switch').parameters.rules.values;
const idxEditarCliente = rules.findIndex(r => r.conditions.conditions.some(c => String(c.rightValue).includes('editar_cliente')));
if (idxEditarCliente >= 0) {
  while (switchConns.length <= idxEditarCliente) switchConns.push([]);
  switchConns[idxEditarCliente] = [{ node: 'Parsear Editar Cliente', type: 'main', index: 0 }];
  console.log('✔ Switch['+idxEditarCliente+'] -> Parsear Editar Cliente');
}

wf.connections['Parsear Editar Cliente'] = { main: [[{ node: 'Update Cliente Row', type: 'main', index: 0 }]] };
wf.connections['Update Cliente Row'] = { main: [[{ node: 'Leer Pedidos Cascade', type: 'main', index: 0 }]] };
wf.connections['Leer Pedidos Cascade'] = { main: [[{ node: 'Filtrar Pedidos del Cliente', type: 'main', index: 0 }]] };
wf.connections['Filtrar Pedidos del Cliente'] = { main: [[{ node: 'Update Pedidos Cliente Nombre', type: 'main', index: 0 }]] };
wf.connections['Update Pedidos Cliente Nombre'] = { main: [[{ node: 'Responder Cliente Editado', type: 'main', index: 0 }]] };
console.log('✔ Flujo cableado: Parsear → Update Cliente → Leer Pedidos → Filtrar → Update Pedidos → Responder');

// ── 2. Bonus: Mapear Clientes también debe rellenar cliente_id en la sheet ──
// (Esto hace que listar_clientes idempotentemente backfille el column cliente_id
// para que próximos updates no fallen.) Lo dejamos como opción futura, no
// necesario para este fix.

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
