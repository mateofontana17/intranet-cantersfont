#!/usr/bin/env node

/**
 * Agrega nodos y conexiones NUEVAS al workflow en n8n,
 * sin tocar los nodos/conexiones existentes.
 *
 * Uso:
 *   node fontana/ficha-stock/scripts/push-ventas-to-n8n.js           # dry-run
 *   node fontana/ficha-stock/scripts/push-ventas-to-n8n.js --apply   # ejecuta
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const WORKFLOW_ID = 'B9PKIGQXRODkYZtd';
const LOCAL_PATH = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');

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
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.N8N_API_KEY || '';

  if (!baseUrl || !apiKey) {
    console.error('Faltan N8N_BASE_URL o N8N_API_KEY en .env');
    process.exit(1);
  }

  // 1. Leer workflow local (con nodos nuevos)
  const local = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
  console.log('Local:', local.nodes.length, 'nodos,', Object.keys(local.connections).length, 'conexiones');

  // 2. GET workflow remoto actual
  const endpoint = `${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  const getRes = await fetch(endpoint, {
    method: 'GET',
    headers: { 'X-N8N-API-KEY': apiKey },
  });
  if (!getRes.ok) {
    console.error('Error GET:', getRes.status, await getRes.text());
    process.exit(1);
  }
  const remote = await getRes.json();
  console.log('Remoto:', remote.nodes.length, 'nodos,', Object.keys(remote.connections).length, 'conexiones');

  // 3. Identificar nodos nuevos (que no existen en remoto por id)
  const remoteIds = new Set(remote.nodes.map(n => n.id));
  const remoteNames = new Set(remote.nodes.map(n => n.name));
  const newNodes = local.nodes.filter(n => !remoteIds.has(n.id) && !remoteNames.has(n.name));

  console.log('\nNodos nuevos a agregar:', newNodes.length);
  newNodes.forEach(n => console.log('  +', n.name, `(${n.type})`));

  // 4. Identificar conexiones nuevas
  const newConnections = {};
  let newConnCount = 0;
  for (const [source, data] of Object.entries(local.connections)) {
    if (!remote.connections[source]) {
      // Conexion de un source completamente nuevo
      newConnections[source] = data;
      newConnCount++;
    } else {
      // Source existe: verificar si hay outputs nuevos
      const remoteOutputs = remote.connections[source].main || [];
      const localOutputs = data.main || [];

      for (let i = 0; i < localOutputs.length; i++) {
        if (i >= remoteOutputs.length) {
          // Output index nuevo (ej: rama FALSE que no existia)
          if (!newConnections[source]) {
            newConnections[source] = { main: [...remoteOutputs] };
          }
          newConnections[source].main[i] = localOutputs[i];
          newConnCount++;
        } else {
          // Output existe: verificar destinos nuevos
          const remoteTargets = remoteOutputs[i].map(t => t.node + ':' + t.index);
          const newTargets = localOutputs[i].filter(t => !remoteTargets.includes(t.node + ':' + t.index));
          if (newTargets.length > 0) {
            if (!newConnections[source]) {
              newConnections[source] = { main: [...remoteOutputs.map(arr => [...arr])] };
            }
            newConnections[source].main[i] = [...(newConnections[source].main[i] || remoteOutputs[i]), ...newTargets];
            newConnCount++;
          }
        }
      }
    }
  }

  console.log('Conexiones nuevas/modificadas:', newConnCount);
  for (const [src, data] of Object.entries(newConnections)) {
    data.main.forEach((targets, idx) => {
      targets.forEach(t => console.log(`  + ${src} [${idx}] -> ${t.node} [${t.index}]`));
    });
  }

  if (newNodes.length === 0 && newConnCount === 0) {
    console.log('\nNo hay cambios para aplicar.');
    return;
  }

  // 5. Construir payload: remoto + nuevos
  const mergedNodes = [...remote.nodes, ...newNodes];
  const mergedConnections = { ...remote.connections };

  for (const [source, data] of Object.entries(newConnections)) {
    mergedConnections[source] = data;
  }

  const payload = {
    name: remote.name,
    nodes: mergedNodes,
    connections: mergedConnections,
    settings: {},
  };

  console.log('\nPayload final:', mergedNodes.length, 'nodos,', Object.keys(mergedConnections).length, 'conexiones');

  if (!applyMode) {
    console.log('\n-- DRY RUN -- Usa --apply para enviar a n8n.');
    return;
  }

  // 6. PUT
  console.log('\nEnviando a n8n...');
  const putRes = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!putRes.ok) {
    console.error('Error PUT:', putRes.status, await putRes.text());
    process.exit(1);
  }

  const result = await putRes.json();
  console.log('\nActualizado OK');
  console.log('  versionId:', result.versionId);
  console.log('  nodos:', result.nodes.length);
  console.log('  updatedAt:', result.updatedAt);

  // 7. Actualizar versionId local
  local.versionId = result.versionId;
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(local, null, 2) + '\n', 'utf8');
  console.log('  versionId local actualizado');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
