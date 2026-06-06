#!/usr/bin/env node

/**
 * Actualiza el workflow "Fontana — Formulario web webhook" en n8n con la
 * versión local de workflows/clean/formulario-webhook.json.
 *
 *   node fontana/ficha-stock/scripts/push-formulario-to-n8n.js             # dry-run
 *   node fontana/ficha-stock/scripts/push-formulario-to-n8n.js --apply     # ejecuta el PUT
 *
 * Lee N8N_BASE_URL y N8N_API_KEY desde el .env en la raíz de n8n-control.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_PATH = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const WORKFLOW_ID = '7ntDbXur9JBetv23';

function loadEnv(filePath) {
  const vars = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return vars;
}

async function main() {
  const applyMode = process.argv.includes('--apply');

  if (!fs.existsSync(ENV_PATH)) {
    console.error('✖ No se encontró .env en', ENV_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(LOCAL_PATH)) {
    console.error('✖ No se encontró el workflow en', LOCAL_PATH);
    process.exit(1);
  }

  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.N8N_API_KEY || '';
  if (!baseUrl || !apiKey) {
    console.error('✖ Faltan N8N_BASE_URL o N8N_API_KEY en .env');
    process.exit(1);
  }

  const local = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
  const required = ['name', 'nodes', 'connections'];
  const missing = required.filter((k) => !(k in local));
  if (missing.length > 0) {
    console.error('✖ Faltan campos en el JSON local:', missing.join(', '));
    process.exit(1);
  }
  console.log('✔ JSON local válido');
  console.log('  name:', local.name);
  console.log('  nodes:', local.nodes.length);
  console.log('  connections:', Object.keys(local.connections).length, 'fuentes');

  const endpoint = `${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  console.log('\n── GET', endpoint);
  const getRes = await fetch(endpoint, {
    method: 'GET',
    headers: { 'X-N8N-API-KEY': apiKey },
  });
  if (!getRes.ok) {
    console.error('✖ Error al obtener workflow remoto:', getRes.status, await getRes.text());
    process.exit(1);
  }
  const remote = await getRes.json();
  console.log('✔ Workflow remoto obtenido');
  console.log('  name:', remote.name, '  active:', remote.active);
  console.log('  versionId remoto:', remote.versionId);
  console.log('  versionId local: ', local.versionId);

  if (local.versionId && remote.versionId && local.versionId !== remote.versionId) {
    console.warn('\n⚠  CONFLICTO DE VERSION');
    console.warn('   Alguien editó el workflow en n8n desde la última exportación.');
    console.warn('   Si continuás, se pisan esos cambios remotos.');
    if (!applyMode) console.log('\n   Usá --apply para forzar.');
  }

  const payload = {
    name: local.name,
    nodes: local.nodes,
    connections: local.connections,
    settings: {},
  };

  console.log('\n── Payload a enviar ──');
  console.log('  PUT', endpoint);
  console.log('  header: X-N8N-API-KEY: ****' + apiKey.slice(-8));
  console.log('  body.nodes:', payload.nodes.length);
  console.log('  body.connections:', Object.keys(payload.connections).length, 'fuentes');

  if (!applyMode) {
    console.log('\n── DRY RUN ──');
    console.log('No se aplicaron cambios. Usá --apply para ejecutar.');
    return;
  }

  console.log('\n── Aplicando actualización... ──');
  const putRes = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const putBody = await putRes.text();
  if (!putRes.ok) {
    console.error('✖ Error en PUT:', putRes.status);
    console.error(putBody);
    process.exit(1);
  }
  const result = JSON.parse(putBody);
  console.log('\n✔ Actualización aplicada');
  console.log('  id:', result.id);
  console.log('  versionId nuevo:', result.versionId);
  console.log('  updatedAt:', result.updatedAt);

  local.versionId = result.versionId;
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(local, null, 2) + '\n', 'utf8');
  console.log('\n✔ versionId local actualizado a', result.versionId);
}

main().catch((err) => {
  console.error('✖ Error inesperado:', err.message);
  process.exit(1);
});
