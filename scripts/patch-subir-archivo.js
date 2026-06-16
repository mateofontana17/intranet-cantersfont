#!/usr/bin/env node

/**
 * Subida real de archivos — acción `subir_archivo`.
 *
 * El frontend manda { proyecto_id, filename, mime, base64 } y este flujo sube el
 * archivo a Google Drive y devuelve { ok:true, link }. Ese link se guarda después
 * en el JSON `detalle` (igual que un link pegado a mano), así que el guardado de la
 * ficha no cambia.
 *
 *   Switch(action==subir_archivo) -> Parsear Archivo (Code: base64 -> binario)
 *     -> Subir Archivo a Drive (Google Drive upload) -> Responder Archivo OK
 *
 * Idempotente. Aplica sobre workflows/clean/formulario-webhook.json.
 *
 *   node scripts/patch-subir-archivo.js
 *
 * Requiere (en el server donde corra): una credencial `Google Drive OAuth2 API`
 * asignada al nodo de Drive, y la Google Drive API habilitada.
 */

const fs = require('fs');
const path = require('path');

const WF_PATH = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');

const NODE_PARSEAR = 'Parsear Archivo';
const NODE_DRIVE = 'Subir Archivo a Drive';
const NODE_RESP = 'Responder Archivo OK';

function main() {
  const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  const byName = (n) => wf.nodes.find((x) => x.name === n);

  if (byName(NODE_PARSEAR)) {
    console.log('• Ya estaba aplicado (existe "' + NODE_PARSEAR + '"). No se hace nada.');
    return;
  }

  // --- 1) Switch: nueva regla subir_archivo --------------------------------
  const sw = byName('Switch');
  if (!sw) throw new Error('No se encontró el nodo Switch');
  sw.parameters.rules.values.push({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [
        {
          id: 'cond-subir-archivo',
          leftValue: '={{ $json.body.action }}',
          rightValue: 'subir_archivo',
          operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
        },
      ],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: 'Subir Archivo',
  });

  // --- 2) Code: base64 -> binario ------------------------------------------
  const parsearCode = [
    '// subir_archivo — convierte el base64 del frontend en binario para Drive',
    'const body = $json.body || $json;',
    'const data = body.data || {};',
    "const limpiar = s => (typeof s === 'string' ? s.trim() : '');",
    '',
    'const proyecto_id = limpiar(data.proyecto_id);',
    "const filename = limpiar(data.filename) || 'archivo';",
    "const mime = limpiar(data.mime) || 'application/octet-stream';",
    "const b64 = typeof data.base64 === 'string' ? data.base64 : '';",
    "if (!b64) throw new Error('Falta el contenido del archivo (base64)');",
    '',
    "const buffer = Buffer.from(b64, 'base64');",
    'const binary = await this.helpers.prepareBinaryData(buffer, filename, mime);',
    'return [{ json: { proyecto_id, filename }, binary: { data: binary } }];',
  ].join('\n');

  const nodeParsear = {
    parameters: { jsCode: parsearCode },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 3120],
    id: 'parsear-archivo',
    name: NODE_PARSEAR,
  };

  // --- 3) Google Drive: upload ---------------------------------------------
  // Sube a la raíz de My Drive por defecto. Para producción conviene apuntar
  // `folderId` a una carpeta compartida del equipo (ver doc de handoff).
  const nodeDrive = {
    parameters: {
      operation: 'upload',
      inputDataFieldName: 'data',
      name: '={{ $json.filename }}',
      driveId: { __rl: true, mode: 'list', value: 'My Drive', cachedResultName: 'My Drive' },
      folderId: { __rl: true, mode: 'list', value: 'root', cachedResultName: '/ (Root folder)' },
      options: {},
    },
    type: 'n8n-nodes-base.googleDrive',
    typeVersion: 3,
    position: [220, 3120],
    id: 'subir-archivo-drive',
    name: NODE_DRIVE,
    credentials: { googleDriveOAuth2Api: { id: '', name: '' } },
  };

  // --- 4) Respond -----------------------------------------------------------
  const respBody = "={{ JSON.stringify({ ok: true, link: ($json.webViewLink || ('https://drive.google.com/file/d/' + $json.id + '/view')), filename: $('" + NODE_PARSEAR + "').first().json.filename }) }}";
  const nodeResp = {
    parameters: { respondWith: 'json', responseBody: respBody, options: {} },
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [460, 3120],
    id: 'resp-archivo-ok',
    name: NODE_RESP,
  };

  wf.nodes.push(nodeParsear, nodeDrive, nodeResp);

  // --- 5) Conexiones --------------------------------------------------------
  wf.connections['Switch'].main.push([{ node: NODE_PARSEAR, type: 'main', index: 0 }]);
  wf.connections[NODE_PARSEAR] = { main: [[{ node: NODE_DRIVE, type: 'main', index: 0 }]] };
  wf.connections[NODE_DRIVE] = { main: [[{ node: NODE_RESP, type: 'main', index: 0 }]] };

  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('✔ Patch aplicado:');
  console.log('  + Switch: regla subir_archivo (nueva salida)');
  console.log('  + Nodos: ' + NODE_PARSEAR + ' -> ' + NODE_DRIVE + ' -> ' + NODE_RESP);
  console.log('  nodos totales:', wf.nodes.length);
  console.log('\n⚠ En el server: asignar credencial Google Drive OAuth2 al nodo "' + NODE_DRIVE + '" y habilitar Google Drive API.');
}

main();
