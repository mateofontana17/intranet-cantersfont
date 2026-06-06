#!/usr/bin/env node
/**
 * Genera flow_calculo_materiales — subflow que recibe un pedido y calcula los materiales necesarios.
 * Usado por el bot de Telegram y el formulario web via Execute Workflow.
 */
const { SHEETS, CREDS, sheetsRead, codeNode, stickyNote, saveWorkflow } = require('./shared');

// ── Code: Calcular materiales desde BOM ──
const calcularBomCode = `// Por que Code: logica de agrupacion por categoria, conversion de unidades placa/metros
// y comparacion contra stock no se puede resolver con nodos nativos
const bom = $('Leer formulas BOM').all();
const stock = $('Leer stock disponible').all();
const input = $input.first().json;

const tipo = (input.tipo_mueble || '').toLowerCase();
const largo = parseFloat(input.largo) || 0; // metros
const ancho = parseFloat(input.ancho) || 0;
const alto = parseFloat(input.alto) || 0;
const color = (input.color || '').toLowerCase();
const cantidad = parseInt(input.cantidad) || 1;

// Constantes de placa
const PLACA_AREA = 2.6 * 1.83; // m2 (2600x1830mm)
const FILO_FINO_ROLLO = 100;
const FILO_GRUESO_ROLLO = 50;

// Filtrar formulas del tipo de mueble
const formulas = bom.filter(b => (b.json.TIPO_MUEBLE || '').toLowerCase() === tipo);
if (!formulas.length) {
  return [{ json: { error: true, mensaje: 'No hay formulas BOM para: ' + input.tipo_mueble, materiales: [] } }];
}

// Calcular cada componente
const materiales = [];
for (const f of formulas) {
  const cat = (f.json.CATEGORIA_INSUMO || '').toLowerCase();
  const unidad = (f.json.UNIDAD || '').toLowerCase();
  let cantNecesaria = 0;

  // Calculos segun categoria (Opcion A: area / area_placa, redondear arriba)
  if (cat.includes('mdf') || cat.includes('fondo')) {
    // Calcular area total de piezas para este componente
    const comp = (f.json.COMPONENTE || '').toLowerCase();
    let areaPiezas = 0;
    if (comp.includes('tapa') || comp.includes('superficie')) areaPiezas = largo * ancho;
    else if (comp.includes('lateral')) areaPiezas = 2 * alto * ancho;
    else if (comp.includes('fondo') || comp.includes('trasero')) areaPiezas = largo * alto;
    else areaPiezas = largo * ancho; // default
    cantNecesaria = Math.ceil((areaPiezas * cantidad) / PLACA_AREA);
  } else if (cat.includes('filo') || cat.includes('canto')) {
    // Metros lineales
    const comp = (f.json.COMPONENTE || '').toLowerCase();
    let metrosLineales = 0;
    if (comp.includes('tapa')) metrosLineales = 2 * (largo + ancho);
    else if (comp.includes('lateral')) metrosLineales = 2 * (2 * (alto + ancho));
    else metrosLineales = 2 * (largo + ancho);
    const totalMetros = metrosLineales * cantidad;
    const metrosRollo = cat.includes('grueso') || comp.includes('grueso') ? FILO_GRUESO_ROLLO : FILO_FINO_ROLLO;
    cantNecesaria = Math.ceil(totalMetros / metrosRollo);
  } else {
    // Herrajes, tornilleria, etc — usar cantidad directa * cantidad muebles
    cantNecesaria = cantidad;
  }

  if (cantNecesaria <= 0) cantNecesaria = 1;

  // Buscar stock del insumo en el color pedido
  const stockItem = stock.find(s => {
    const sCat = (s.json['CATEGORIA'] || s.json['CATEGORÍA'] || '').toLowerCase();
    const sColor = (s.json['PRODUCTO/COLOR'] || '').toLowerCase();
    return sCat.includes(cat.split(' ')[0]) && sColor.includes(color);
  });

  const stockActual = stockItem ? (parseInt(stockItem.json.STOCK) || 0) : 0;
  const stockMinimo = stockItem ? (parseInt(stockItem.json.STOCK_MINIMO) || 0) : 0;
  const precioCosto = stockItem ? (parseFloat(stockItem.json.PRECIO_COSTO) || 0) : 0;
  const proveedor = stockItem ? (stockItem.json.PROVEEDOR || '') : '';
  const sku = stockItem ? (stockItem.json.SKU || '') : '';
  const stockDespues = stockActual - cantNecesaria;

  let estado = 'suficiente';
  if (stockDespues < 0) estado = 'insuficiente';
  else if (stockMinimo > 0 && stockDespues < stockMinimo) estado = 'justo';

  materiales.push({
    componente: f.json.COMPONENTE,
    categoria: f.json.CATEGORIA_INSUMO,
    sku,
    cantidad_necesaria: cantNecesaria,
    stock_actual: stockActual,
    stock_despues: stockDespues,
    faltante: stockDespues < 0 ? Math.abs(stockDespues) : 0,
    estado,
    precio_costo: precioCosto,
    costo_faltante: stockDespues < 0 ? Math.abs(stockDespues) * precioCosto : 0,
    proveedor,
    unidad: f.json.UNIDAD,
  });
}

const hayFaltantes = materiales.some(m => m.estado === 'insuficiente');
const costoTotalFaltantes = materiales.reduce((s, m) => s + m.costo_faltante, 0);

return [{ json: {
  error: false,
  tipo_mueble: input.tipo_mueble,
  medidas: largo + ' x ' + ancho + ' x ' + alto,
  color: input.color,
  cantidad,
  materiales,
  hay_faltantes: hayFaltantes,
  costo_total_faltantes: costoTotalFaltantes,
} }];`;

// ── Workflow ──
const workflow = {
  name: 'Fontana — Calcular materiales (subflow BOM)',
  nodes: [
    // Trigger para subflow
    {
      parameters: {},
      id: 'trigger-subflow',
      name: 'Recibir datos del pedido',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [250, 400],
    },

    sheetsRead('read-bom', 'Leer formulas BOM', SHEETS.BOM, [520, 280]),
    sheetsRead('read-stock', 'Leer stock disponible', SHEETS.STOCK, [520, 520]),

    codeNode('calc-bom', 'Calcular materiales necesarios', [860, 400], calcularBomCode),

    stickyNote('sticky-entrada', 'Sticky Note - ENTRADA', [170, 200],
      '## ENTRADA\nRecibe: tipo_mueble, largo, ancho, alto, color, cantidad', 380, 180),
    stickyNote('sticky-calculo', 'Sticky Note - CALCULO', [440, 200],
      '## CALCULO\nLee BOM + Stock, calcula materiales, compara disponibilidad.', 520, 400),
  ],

  connections: {
    'Recibir datos del pedido': {
      main: [[
        { node: 'Leer formulas BOM', type: 'main', index: 0 },
        { node: 'Leer stock disponible', type: 'main', index: 0 },
      ]],
    },
    'Leer formulas BOM': {
      main: [[{ node: 'Calcular materiales necesarios', type: 'main', index: 0 }]],
    },
    'Leer stock disponible': {
      main: [[{ node: 'Calcular materiales necesarios', type: 'main', index: 0 }]],
    },
  },

  settings: { executionOrder: 'v1' },
  staticData: null,
  tags: [],
  pinData: {},
};

saveWorkflow('calculo-materiales.json', workflow);
