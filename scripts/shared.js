// Constantes compartidas entre todos los generadores de workflows
const path = require('path');
const fs = require('fs');

const CLEAN_DIR = path.join(__dirname, '..', 'workflows', 'clean');

// Nombres de hojas en la Google Sheet principal
const SHEETS = {
  STOCK: 'Stock',
  MOVIMIENTOS: 'Movimientos',
  PEDIDOS: 'Pedidos',
  USUARIOS: 'Usuarios_Autorizados',
  BOM: 'Formulas_BOM',
  PROVEEDORES: 'Proveedores',
  CONFIG: 'Config',
  SESIONES: 'Sesiones',
};

// Credenciales placeholder
const CREDS = {
  sheets: { googleSheetsOAuth2Api: { id: '', name: '' } },
  telegram: { telegramApi: { id: '', name: '' } },
  gmail: { gmailOAuth2: { id: '', name: '' } },
};

// Tamaños estandar
const PLACA_MDF = { largo: 2600, ancho: 1830 }; // mm
const PLACA_FONDO = { largo: 2600, ancho: 1830 }; // mm
const FILO_FINO_ROLLO = 100; // metros
const FILO_GRUESO_ROLLO = 50; // metros

function sheetsRead(id, name, sheetName, position, extraParams = {}) {
  return {
    parameters: {
      operation: 'read',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      options: {},
      ...extraParams,
    },
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position,
    credentials: CREDS.sheets,
  };
}

function sheetsAppend(id, name, sheetName, position, columns) {
  return {
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        ...columns,
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position,
    credentials: CREDS.sheets,
  };
}

function sheetsUpdate(id, name, sheetName, position, matchCol, columns) {
  return {
    parameters: {
      operation: 'update',
      documentId: { __rl: true, mode: 'id', value: 'SHEET_ID_PRINCIPAL' },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: [matchCol],
        ...columns,
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position,
    credentials: CREDS.sheets,
  };
}

function codeNode(id, name, position, jsCode) {
  return {
    parameters: { jsCode },
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function stickyNote(id, name, position, content, width = 400, height = 250) {
  return {
    parameters: { content, width, height },
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  };
}

function saveWorkflow(filename, workflow) {
  if (!fs.existsSync(CLEAN_DIR)) fs.mkdirSync(CLEAN_DIR, { recursive: true });
  const outPath = path.join(CLEAN_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
  console.log(`  -> ${filename} (${workflow.nodes.length} nodos)`);
  return outPath;
}

module.exports = {
  SHEETS, CREDS, PLACA_MDF, PLACA_FONDO, FILO_FINO_ROLLO, FILO_GRUESO_ROLLO,
  sheetsRead, sheetsAppend, sheetsUpdate, codeNode, stickyNote, saveWorkflow, CLEAN_DIR,
};
