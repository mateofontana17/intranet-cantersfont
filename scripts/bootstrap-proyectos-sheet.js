#!/usr/bin/env node
/**
 * Bootstrap: crea la hoja "Proyectos" (Etapa 1) en el spreadsheet vía un
 * workflow temporal n8n con Google Sheets resource=sheet operation=create,
 * y luego siembra la fila de headers con un append autoMap.
 *
 * Crea un workflow NUEVO independiente (no toca el formulario-webhook),
 * lo ejecuta una vez con un webhook de prueba, y queda disponible para borrar.
 *
 * Uso: node bootstrap-proyectos-sheet.js --apply
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const SHEETS_CRED_ID = 'LiTV16yWQFogsvNY';
const SHEET_DOC_ID = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';

function loadEnv(p) {
  const v = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    v[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return v;
}

const env = loadEnv(ENV_PATH);
const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
const apiKey = env.N8N_API_KEY || '';

const HEADERS = ['proyecto_id','fecha_alta','estado','nombre','apellidos','telefono','email','direccion_colocacion','clasificacion_cliente','como_nos_conocio','espacios','que_te_dijo','fecha_tentativa','notas','vendedor'];

const wf = {
  name: 'BOOTSTRAP Proyectos (temporal)',
  nodes: [
    {
      parameters: { path: 'bootstrap-proyectos', httpMethod: 'POST', responseMode: 'lastNode', options: {} },
      type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      id: 'bw-1', name: 'Webhook', webhookId: 'bootstrap-proyectos',
    },
    {
      parameters: {
        resource: 'sheet',
        operation: 'create',
        documentId: { __rl: true, value: SHEET_DOC_ID, mode: 'list' },
        title: 'Proyectos',
        options: {},
      },
      type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: [220, 0],
      id: 'bw-2', name: 'Crear Hoja',
      credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' } },
    },
    {
      parameters: {
        jsCode: 'return [{ json: ' + JSON.stringify(Object.fromEntries(HEADERS.map(h => [h, '']))) + ' }];',
      },
      type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0],
      id: 'bw-3', name: 'Header Seed',
    },
    {
      parameters: {
        operation: 'append',
        documentId: { __rl: true, value: SHEET_DOC_ID, mode: 'list' },
        sheetName: { __rl: true, value: 'Proyectos', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [] },
        options: {},
      },
      type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: [660, 0],
      id: 'bw-4', name: 'Sembrar Headers',
      credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets OAuth2 API' } },
    },
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Crear Hoja', type: 'main', index: 0 }]] },
    'Crear Hoja': { main: [[{ node: 'Header Seed', type: 'main', index: 0 }]] },
    'Header Seed': { main: [[{ node: 'Sembrar Headers', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

(async () => {
  if (!process.argv.includes('--apply')) { console.log('DRY RUN. Usá --apply'); return; }
  // Crear workflow
  let res = await fetch(`${baseUrl}/api/v1/workflows`, {
    method: 'POST', headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(wf),
  });
  if (!res.ok) { console.error('✖ crear wf', res.status, await res.text()); process.exit(1); }
  const created = JSON.parse(await res.text());
  const id = created.id;
  console.log('✔ Workflow bootstrap creado:', id);
  // Activar
  res = await fetch(`${baseUrl}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': apiKey } });
  console.log('  activate:', res.status);
  console.log('  WF_ID=' + id);
  console.log('  Llamá: curl -s -X POST ' + baseUrl + '/webhook/bootstrap-proyectos -d {}');
})();
