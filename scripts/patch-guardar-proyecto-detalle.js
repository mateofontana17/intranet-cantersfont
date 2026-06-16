#!/usr/bin/env node

/**
 * Fase 0 — Persistencia compartida de la Ficha (Etapas 2-5).
 *
 * Agrega al workflow `formulario-webhook` la acción `guardar_proyecto_detalle`:
 * guarda todas las Etapas 2-5 como un único bloque JSON en la columna `detalle`
 * de la hoja `Estado de Pedidos`. Además hace que `listar_pedidos` devuelva esa
 * columna para que la ficha rehidrate desde el servidor.
 *
 * Idempotente: si ya está aplicado, no duplica nada.
 *
 *   node scripts/patch-guardar-proyecto-detalle.js
 *
 * Requisito manual (no se puede automatizar desde acá): en la hoja
 * `Estado de Pedidos` agregar una columna al final con el encabezado `detalle`.
 */

const fs = require('fs');
const path = require('path');

const WF_PATH = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');

// Datos del entorno (mismos que usa el resto del workflow)
const DOC_ID = '1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const SHEET_GID = 440974926;
const SHEET_NAME = 'Estado de Pedidos';
const CRED = { googleSheetsOAuth2Api: { id: 'LiTV16yWQFogsvNY', name: 'Google Sheets OAuth2 API' } };

const NODE_PARSEAR = 'Parsear Detalle Proyecto';
const NODE_GUARDAR = 'Guardar Detalle Proyecto';
const NODE_RESP = 'Responder Detalle OK';

function main() {
  const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  const byName = (n) => wf.nodes.find((x) => x.name === n);

  if (byName(NODE_PARSEAR)) {
    console.log('• Ya estaba aplicado (existe el nodo "' + NODE_PARSEAR + '"). No se hace nada.');
    return;
  }

  // --- 1) Switch: nueva regla guardar_proyecto_detalle -----------------------
  const sw = byName('Switch');
  if (!sw) throw new Error('No se encontró el nodo Switch');
  sw.parameters.rules.values.push({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [
        {
          id: 'cond-guardar-detalle',
          leftValue: '={{ $json.body.action }}',
          rightValue: 'guardar_proyecto_detalle',
          operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
        },
      ],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: 'Guardar Detalle Proyecto',
  });

  // --- 2) Nodo Code: Parsear Detalle Proyecto --------------------------------
  const parsearCode = [
    '// Fase 0 — guardar Etapas 2-5 como bloque JSON en la columna `detalle`',
    'const body = $json.body || $json;',
    'const data = body.data || {};',
    "const limpiar = s => (typeof s === 'string' ? s.trim() : (s == null ? '' : String(s)));",
    '',
    'const proyecto_id = limpiar(data.proyecto_id);',
    "if (!proyecto_id) throw new Error('Falta proyecto_id');",
    '',
    '// `detalle` ya viene como string JSON desde el frontend; se guarda tal cual.',
    'let detalle = data.detalle;',
    "if (detalle == null) detalle = '';",
    "if (typeof detalle !== 'string') detalle = JSON.stringify(detalle);",
    '',
    'return [{ json: { proyecto_id, detalle } }];',
  ].join('\n');

  const nodeParsear = {
    parameters: { jsCode: parsearCode },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 2880],
    id: 'parsear-detalle-proyecto',
    name: NODE_PARSEAR,
  };

  // --- 3) Nodo Google Sheets: Update por proyecto_id (solo pisa `detalle`) ----
  const nodeGuardar = {
    parameters: {
      operation: 'update',
      documentId: { __rl: true, value: DOC_ID, mode: 'list', cachedResultName: 'Materiales, Stock y Clientes demo' },
      sheetName: { __rl: true, value: SHEET_GID, mode: 'list', cachedResultName: SHEET_NAME },
      // autoMapInputData: mapea cada campo de entrada (proyecto_id, detalle) a su
      // columna por nombre. Más robusto que defineBelow: sobrevive al botón
      // "refrescar columnas" de la UI (que borra los mapeos manuales).
      columns: {
        mappingMode: 'autoMapInputData',
        matchingColumns: ['proyecto_id'],
        schema: [
          { id: 'proyecto_id', displayName: 'proyecto_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'detalle', displayName: 'detalle', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [220, 2880],
    id: 'guardar-detalle-update',
    name: NODE_GUARDAR,
    credentials: CRED,
  };

  // --- 4) Nodo Respond -------------------------------------------------------
  const nodeResp = {
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ ok: true, proyecto_id: $(\'' + NODE_PARSEAR + '\').first().json.proyecto_id }) }}',
      options: {},
    },
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [440, 2880],
    id: 'resp-detalle-ok',
    name: NODE_RESP,
  };

  wf.nodes.push(nodeParsear, nodeGuardar, nodeResp);

  // --- 5) Conexiones ---------------------------------------------------------
  // Switch nueva salida (índice 13) -> Parsear Detalle Proyecto
  wf.connections['Switch'].main.push([{ node: NODE_PARSEAR, type: 'main', index: 0 }]);
  wf.connections[NODE_PARSEAR] = { main: [[{ node: NODE_GUARDAR, type: 'main', index: 0 }]] };
  wf.connections[NODE_GUARDAR] = { main: [[{ node: NODE_RESP, type: 'main', index: 0 }]] };

  // --- 6) Mapear Estado de Pedidos: devolver `detalle` en listar_pedidos ------
  const mapper = byName('Mapear Estado de Pedidos');
  if (!mapper) throw new Error('No se encontró "Mapear Estado de Pedidos"');
  if (!mapper.parameters.jsCode.includes('detalle:')) {
    mapper.parameters.jsCode = mapper.parameters.jsCode.replace(
      'vendedor: norm(r.vendedor),',
      'vendedor: norm(r.vendedor),\n    detalle: norm(r.detalle),'
    );
  }

  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('✔ Patch aplicado:');
  console.log('  + Switch: regla guardar_proyecto_detalle (salida 13)');
  console.log('  + Nodos: ' + NODE_PARSEAR + ' -> ' + NODE_GUARDAR + ' -> ' + NODE_RESP);
  console.log('  + Mapear Estado de Pedidos: ahora devuelve `detalle`');
  console.log('  nodos totales:', wf.nodes.length);
  console.log('\n⚠ Recordá: agregar la columna `detalle` (encabezado) en la hoja "' + SHEET_NAME + '".');
}

main();
