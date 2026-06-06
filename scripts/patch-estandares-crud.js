#!/usr/bin/env node
/**
 * Patch del workflow Fontana Formulario Webhook:
 * agrega rutas `guardar_estandar` y `eliminar_estandar` al Switch
 * y los nodos necesarios para escribir a la hoja "Estandares Materiales".
 *
 * Uso:
 *   node patch-estandares-crud.js          (dry-run, escribe local solamente)
 *   node patch-estandares-crud.js --apply  (modifica local + PUT a n8n)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_PATH = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';
const SHEETS_CRED_ID = 'LiTV16yWQFogsvNY';
const SHEET_DOC_ID = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const SHEET_ESTANDARES_GID = 1284713931;

function loadEnv(filePath) {
  const vars = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

const wf = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));

// ── 1. Patch Switch: agregar 2 reglas ────────────────────────────────────
const switchNode = wf.nodes.find((n) => n.name === 'Switch' && n.type === 'n8n-nodes-base.switch');
if (!switchNode) throw new Error('No se encontró el nodo Switch');

const rules = switchNode.parameters.rules.values;

const hasGuardar = rules.some((r) =>
  r.conditions.conditions.some((c) => String(c.rightValue).includes('guardar_estandar'))
);
const hasEliminar = rules.some((r) =>
  r.conditions.conditions.some((c) => String(c.rightValue).includes('eliminar_estandar'))
);

if (!hasGuardar) {
  rules.push({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [{
        id: uid('cond'),
        leftValue: '={{ $json.body.action }}',
        rightValue: 'guardar_estandar',
        operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
      }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: 'Guardar Estandar',
  });
  console.log('✔ Regla guardar_estandar agregada al Switch');
}

if (!hasEliminar) {
  rules.push({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [{
        id: uid('cond'),
        leftValue: '={{ $json.body.action }}',
        rightValue: 'eliminar_estandar',
        operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
      }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: 'Eliminar Estandar',
  });
  console.log('✔ Regla eliminar_estandar agregada al Switch');
}

// ── 2. Posiciones para los nuevos nodos ──────────────────────────────────
const baseX = 0;
const baseYGuardar = -800;
const baseYEliminar = -1100;

// ── 3. Nodos guardar_estandar ────────────────────────────────────────────
const parseGuardarCode = `
// Parsea el payload de guardar_estandar y emite N items (uno por material).
// Espera: { action, data: { tipo_mueble, nombre_display, descripcion, materiales: [...] }, pin }
const body = $json.body || $json;
const data = body.data || body;
const tipoComp = String(data.tipo_mueble || '').trim();
const partes = tipoComp.split('__');
const tipo = partes[0] || tipoComp;
const nivel = partes.length > 1 ? Number(partes[1]) || 2 : 2;
const materiales = Array.isArray(data.materiales) ? data.materiales : [];

if (!tipo) throw new Error('tipo_mueble es requerido');
if (materiales.length === 0) throw new Error('Debe haber al menos un material');

return materiales.map((m, i) => ({
  json: {
    tipo_mueble: tipo,
    nivel: nivel,
    material: String(m.componente || m.categoria_busqueda || '').trim(),
    cantidad: Number(m.cantidad_por_unidad) || 0,
    unidad: String(m.unidad || '').trim(),
    notas: String(m.notas || '').trim(),
    _meta_idx: i,
    _meta_nombre_display: data.nombre_display || '',
  },
}));
`.trim();

const parseGuardarNode = {
  parameters: { jsCode: parseGuardarCode },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [baseX, baseYGuardar],
  id: uid('node'),
  name: 'Parsear Estandar',
};

const upsertEstandarNode = {
  parameters: {
    operation: 'append',
    documentId: {
      __rl: true,
      value: SHEET_DOC_ID,
      mode: 'list',
      cachedResultName: 'Materiales y Stock demo',
    },
    sheetName: {
      __rl: true,
      value: SHEET_ESTANDARES_GID,
      mode: 'list',
      cachedResultName: 'Estandares Materiales',
      cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEET_DOC_ID}/edit#gid=${SHEET_ESTANDARES_GID}`,
    },
    columns: {
      mappingMode: 'defineBelow',
      value: {
        tipo_mueble: '={{ $json.tipo_mueble }}',
        nivel: '={{ $json.nivel }}',
        material: '={{ $json.material }}',
        cantidad: '={{ $json.cantidad }}',
        unidad: '={{ $json.unidad }}',
        notas: '={{ $json.notas }}',
      },
      matchingColumns: ['tipo_mueble', 'nivel', 'material'],
      schema: [
        { id: 'tipo_mueble', displayName: 'tipo_mueble', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'nivel', displayName: 'nivel', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
        { id: 'material', displayName: 'material', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'unidad', displayName: 'unidad', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'cantidad', displayName: 'cantidad', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
        { id: 'notas', displayName: 'notas', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: {},
  },
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  position: [baseX + 256, baseYGuardar],
  id: uid('node'),
  name: 'Upsert Estandar',
  credentials: {
    googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' },
  },
};

const responderGuardarNode = {
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: true, mensaje: "Estandar guardado", filas: $items().length }) }}',
    options: {},
  },
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [baseX + 512, baseYGuardar],
  id: uid('node'),
  name: 'Responder Estandar Guardado',
};

// ── 4. Nodos eliminar_estandar ───────────────────────────────────────────
const parseEliminarCode = `
// Parsea eliminar_estandar y prepara el tipo/nivel para filtrar.
const body = $json.body || $json;
const data = body.data || body;
const tipoComp = String(data.tipo_mueble || '').trim();
const partes = tipoComp.split('__');
const tipo = partes[0] || tipoComp;
const nivel = partes.length > 1 ? Number(partes[1]) || 2 : 2;
return [{ json: { tipo_target: tipo, nivel_target: nivel } }];
`.trim();

const parseEliminarNode = {
  parameters: { jsCode: parseEliminarCode },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [baseX, baseYEliminar],
  id: uid('node'),
  name: 'Parsear Eliminar Estandar',
};

const leerEstandaresEliminarNode = {
  parameters: {
    documentId: {
      __rl: true,
      value: SHEET_DOC_ID,
      mode: 'list',
      cachedResultName: 'Materiales y Stock demo',
    },
    sheetName: {
      __rl: true,
      value: SHEET_ESTANDARES_GID,
      mode: 'list',
      cachedResultName: 'Estandares Materiales',
    },
    options: {},
  },
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  position: [baseX + 256, baseYEliminar],
  id: uid('node'),
  name: 'Leer Estandares para Eliminar',
  credentials: {
    googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' },
  },
};

const filtrarRowsCode = `
// Encuentra row_numbers que coinciden con tipo_target+nivel_target.
// Devuelve items con row_number para luego eliminarlos.
const target = $('Parsear Eliminar Estandar').first().json;
const rows = $input.all().map(i => i.json);
const matches = rows.filter(r =>
  String(r.tipo_mueble || '').trim() === target.tipo_target
  && Number(r.nivel) === Number(target.nivel_target)
);
if (matches.length === 0) {
  return [{ json: { __nada_que_borrar: true, tipo: target.tipo_target, nivel: target.nivel_target } }];
}
// Ordenar desc por row_number para que el delete no invalide indices.
matches.sort((a, b) => Number(b.row_number) - Number(a.row_number));
return matches.map(m => ({ json: { row_number: m.row_number } }));
`.trim();

const filtrarRowsNode = {
  parameters: { jsCode: filtrarRowsCode },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [baseX + 512, baseYEliminar],
  id: uid('node'),
  name: 'Filtrar Rows Eliminar',
};

const borrarRowsNode = {
  parameters: {
    operation: 'delete',
    documentId: {
      __rl: true,
      value: SHEET_DOC_ID,
      mode: 'list',
      cachedResultName: 'Materiales y Stock demo',
    },
    sheetName: {
      __rl: true,
      value: SHEET_ESTANDARES_GID,
      mode: 'list',
      cachedResultName: 'Estandares Materiales',
    },
    toDelete: 'rows',
    startIndex: '={{ $json.row_number }}',
    numberToDelete: 1,
  },
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  position: [baseX + 768, baseYEliminar],
  id: uid('node'),
  name: 'Borrar Filas Estandar',
  credentials: {
    googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' },
  },
};

const responderEliminarNode = {
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: true, mensaje: "Estandar eliminado" }) }}',
    options: {},
  },
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [baseX + 1024, baseYEliminar],
  id: uid('node'),
  name: 'Responder Estandar Eliminado',
};

// ── 5. Agregar nodos si no existen ya ────────────────────────────────────
const nodosNuevos = [
  parseGuardarNode, upsertEstandarNode, responderGuardarNode,
  parseEliminarNode, leerEstandaresEliminarNode, filtrarRowsNode,
  borrarRowsNode, responderEliminarNode,
];

// Reemplazar nodos existentes con la versión nueva (idempotente).
for (const node of nodosNuevos) {
  const idx = wf.nodes.findIndex((n) => n.name === node.name);
  if (idx >= 0) {
    // Preservar id original para no romper conexiones existentes.
    node.id = wf.nodes[idx].id;
    wf.nodes[idx] = node;
    console.log(`~ Nodo actualizado: ${node.name}`);
  } else {
    wf.nodes.push(node);
    console.log(`+ Nodo agregado: ${node.name}`);
  }
}

// ── 6. Conexiones ────────────────────────────────────────────────────────
// El Switch ahora tiene 12 reglas (10 originales + 2 nuevas).
// outputKey order corresponde al output index. Las nuevas son las últimas:
// índice 10 = "Guardar Estandar", índice 11 = "Eliminar Estandar".

const switchConns = wf.connections.Switch.main;
// Garantizar que tenga al menos 12 entradas.
while (switchConns.length < rules.length) switchConns.push([]);

// Output "Guardar Estandar" → Parsear Estandar
const outGuardar = rules.findIndex((r) => r.outputKey === 'Guardar Estandar');
const outEliminar = rules.findIndex((r) => r.outputKey === 'Eliminar Estandar');

switchConns[outGuardar] = [{ node: 'Parsear Estandar', type: 'main', index: 0 }];
switchConns[outEliminar] = [{ node: 'Parsear Eliminar Estandar', type: 'main', index: 0 }];

wf.connections['Parsear Estandar'] = {
  main: [[{ node: 'Upsert Estandar', type: 'main', index: 0 }]],
};
wf.connections['Upsert Estandar'] = {
  main: [[{ node: 'Responder Estandar Guardado', type: 'main', index: 0 }]],
};

wf.connections['Parsear Eliminar Estandar'] = {
  main: [[{ node: 'Leer Estandares para Eliminar', type: 'main', index: 0 }]],
};
wf.connections['Leer Estandares para Eliminar'] = {
  main: [[{ node: 'Filtrar Rows Eliminar', type: 'main', index: 0 }]],
};
wf.connections['Filtrar Rows Eliminar'] = {
  main: [[{ node: 'Borrar Filas Estandar', type: 'main', index: 0 }]],
};
wf.connections['Borrar Filas Estandar'] = {
  main: [[{ node: 'Responder Estandar Eliminado', type: 'main', index: 0 }]],
};

console.log('\n✔ Conexiones actualizadas');
console.log(`  Switch output ${outGuardar} → Parsear Estandar (guardar)`);
console.log(`  Switch output ${outEliminar} → Parsear Eliminar Estandar (eliminar)`);

// ── 7. Guardar local ─────────────────────────────────────────────────────
fs.writeFileSync(LOCAL_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('\n✔ Workflow local actualizado:', LOCAL_PATH);
console.log(`  Total nodos: ${wf.nodes.length}`);
console.log(`  Reglas Switch: ${rules.length}`);

// ── 8. Push a n8n si --apply ─────────────────────────────────────────────
if (!process.argv.includes('--apply')) {
  console.log('\n── DRY RUN ── Usá --apply para pushear a n8n.');
  return;
}

(async () => {
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.N8N_API_KEY || '';
  const endpoint = `${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;

  console.log('\n── PUT', endpoint);
  // n8n API es estricta con settings — solo aceptar executionOrder.
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
  const text = await res.text();
  if (!res.ok) {
    console.error('✖ Error', res.status);
    console.error(text);
    process.exit(1);
  }
  const result = JSON.parse(text);
  console.log('✔ Pusheado. versionId:', result.versionId);
})();
