/**
 * ============================================================
 *  FONTANA - Sistema de Stock para Taller de Muebles
 *  Google Apps Script - Setup completo de hojas
 * ============================================================
 *
 *  Ejecutar setupStockSystem() para crear toda la estructura.
 *  Tambien disponible desde el menu: Setup Stock System > Crear estructura completa
 */

// ── Menu personalizado ──────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Setup Stock System')
    .addItem('Crear estructura completa', 'setupStockSystem')
    .addSeparator()
    .addItem('Solo crear hojas faltantes', 'crearHojasFaltantes')
    .addItem('Solo aplicar formato condicional Stock', 'aplicarFormatoCondicionalStock')
    .addToUi();
}

// ── Funcion principal ───────────────────────────────────────
function setupStockSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  ui.alert(
    'Setup Stock System',
    'Se crearan todas las hojas del sistema de stock.\n' +
    'Las hojas existentes NO se sobreescribiran.',
    ui.ButtonSet.OK
  );

  crearHojaStock(ss);
  crearHojaMovimientos(ss);
  crearHojaPedidos(ss);
  crearHojaFaltantes(ss);
  crearHojaUsuarios(ss);
  crearHojaFormulasBOM(ss);
  crearHojaProveedores(ss);
  crearHojaConfig(ss);
  crearHojaSesiones(ss);
  crearHojaDashboard(ss);

  // Eliminar la hoja por defecto "Hoja 1" / "Sheet1" si quedo vacia
  eliminarHojaDefault(ss);

  ui.alert('Listo', 'Estructura creada correctamente.', ui.ButtonSet.OK);
}

// ── Utilidades ──────────────────────────────────────────────

/**
 * Obtiene o crea una hoja por nombre.
 * Devuelve { sheet, esNueva }.
 */
function obtenerOCrearHoja(ss, nombre) {
  var sheet = ss.getSheetByName(nombre);
  if (sheet) {
    return { sheet: sheet, esNueva: false };
  }
  sheet = ss.insertSheet(nombre);
  return { sheet: sheet, esNueva: true };
}

/**
 * Aplica formato de encabezado: negrita, fondo oscuro, texto blanco,
 * congela la primera fila y auto-redimensiona columnas.
 */
function formatearEncabezado(sheet, numCols) {
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange
    .setFontWeight('bold')
    .setBackground('#3c4043')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  // Auto-resize todas las columnas
  for (var c = 1; c <= numCols; c++) {
    sheet.autoResizeColumn(c);
  }
}

/**
 * Elimina la hoja por defecto si existe y hay mas de una hoja.
 */
function eliminarHojaDefault(ss) {
  var nombres = ['Hoja 1', 'Sheet1'];
  nombres.forEach(function(n) {
    var h = ss.getSheetByName(n);
    if (h && ss.getSheets().length > 1) {
      ss.deleteSheet(h);
    }
  });
}

/**
 * Crea solo las hojas que falten (sin datos de ejemplo).
 */
function crearHojasFaltantes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  crearHojaStock(ss);
  crearHojaMovimientos(ss);
  crearHojaPedidos(ss);
  crearHojaFaltantes(ss);
  crearHojaUsuarios(ss);
  crearHojaFormulasBOM(ss);
  crearHojaProveedores(ss);
  crearHojaConfig(ss);
  crearHojaSesiones(ss);
  crearHojaDashboard(ss);
  SpreadsheetApp.getUi().alert('Hojas verificadas / creadas.');
}

// ════════════════════════════════════════════════════════════
//  1. STOCK
// ════════════════════════════════════════════════════════════
function crearHojaStock(ss) {
  var res = obtenerOCrearHoja(ss, 'Stock');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = [
    '#', 'CATEGOR\u00cdA', 'PRODUCTO/COLOR', 'MEDIDA/VARIANTE', 'SKU',
    'STOCK', 'STOCK_MINIMO', 'PRECIO_COSTO', 'PRECIO_VENTA',
    'MARGEN_%', 'VALOR_STOCK', 'PROVEEDOR', 'NOTAS'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Datos de ejemplo --------------------------------------------------
  // Columnas: #, CATEGORIA, PRODUCTO/COLOR, MEDIDA/VARIANTE, SKU,
  //           STOCK, STOCK_MINIMO, PRECIO_COSTO, PRECIO_VENTA,
  //           MARGEN_% (formula), VALOR_STOCK (formula), PROVEEDOR, NOTAS
  var data = [
    [1, 'Tableros',  'MDF Blanco',  '18 mm',  'MDF-18-BLA',  20, 5,  15500, 22000, null, null, 'Masisa',  ''],
    [2, 'Tableros',  'MDF Negro',   '18 mm',  'MDF-18-NEG',  12, 5,  16000, 23500, null, null, 'Masisa',  ''],
    [3, 'Tableros',  'MDF Roble',   '18 mm',  'MDF-18-ROB',   8, 5,  17500, 26000, null, null, 'Egger',   ''],
    [4, 'Tableros',  'Fondo Blanco','3 mm',   'FON-03-BLA',  30, 10, 4500,  6800,  null, null, 'Masisa',  ''],
    [5, 'Tableros',  'Fondo Negro', '3 mm',   'FON-03-NEG',  25, 10, 4800,  7200,  null, null, 'Masisa',  ''],
    [6, 'Cantos',    'Filo Blanco', '22 mm',  'FIL-22-BLA',  50, 15, 350,   550,   null, null, 'Egger',   'Por metro'],
    [7, 'Cantos',    'Filo Negro',  '22 mm',  'FIL-22-NEG',  40, 15, 380,   580,   null, null, 'Egger',   'Por metro'],
    [8, 'Cantos',    'Filo Blanco', '45 mm',  'FIL-45-BLA',  35, 10, 520,   780,   null, null, 'Egger',   'Por metro']
  ];

  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  // Formulas: MARGEN_% (col J) y VALOR_STOCK (col K) -----------------
  for (var r = 2; r <= data.length + 1; r++) {
    // MARGEN_% = (PRECIO_VENTA - PRECIO_COSTO) / PRECIO_COSTO * 100
    sheet.getRange(r, 10).setFormula('=IF(H' + r + '<>0,(I' + r + '-H' + r + ')/H' + r + '*100,"")');
    // VALOR_STOCK = STOCK * PRECIO_COSTO
    sheet.getRange(r, 11).setFormula('=F' + r + '*H' + r);
  }

  // Formato numerico --------------------------------------------------
  var lastRow = data.length + 1;
  sheet.getRange(2, 8, data.length, 2).setNumberFormat('$#,##0');   // PRECIO_COSTO, PRECIO_VENTA
  sheet.getRange(2, 10, data.length, 1).setNumberFormat('0.0"%"');  // MARGEN_%
  sheet.getRange(2, 11, data.length, 1).setNumberFormat('$#,##0');  // VALOR_STOCK

  formatearEncabezado(sheet, headers.length);

  // Formato condicional -----------------------------------------------
  aplicarFormatoCondicionalStockEnHoja(sheet);

  // Ancho de columnas extra
  sheet.setColumnWidth(2, 130);  // CATEGORIA
  sheet.setColumnWidth(3, 160);  // PRODUCTO/COLOR
  sheet.setColumnWidth(12, 120); // PROVEEDOR
  sheet.setColumnWidth(13, 200); // NOTAS
}

/**
 * Formato condicional para la columna STOCK (F).
 *   - Rojo:     STOCK = 0
 *   - Amarillo: STOCK < STOCK_MINIMO
 *   - Verde:    STOCK > STOCK_MINIMO * 1.5
 */
function aplicarFormatoCondicionalStockEnHoja(sheet) {
  var range = sheet.getRange('F2:F1000');

  // Rojo si STOCK = 0
  var ruleRojo = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$F2=0')
    .setBackground('#ea4335')
    .setFontColor('#ffffff')
    .setRanges([range])
    .build();

  // Amarillo si STOCK < STOCK_MINIMO (y > 0)
  var ruleAmarillo = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2>0,$F2<$G2)')
    .setBackground('#fbbc04')
    .setFontColor('#000000')
    .setRanges([range])
    .build();

  // Verde si STOCK > STOCK_MINIMO * 1.5
  var ruleVerde = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$F2>$G2*1.5')
    .setBackground('#34a853')
    .setFontColor('#ffffff')
    .setRanges([range])
    .build();

  var rules = sheet.getConditionalFormatRules();
  rules.push(ruleRojo);
  rules.push(ruleAmarillo);
  rules.push(ruleVerde);
  sheet.setConditionalFormatRules(rules);
}

/**
 * Punto de entrada para aplicar formato condicional desde el menu.
 */
function aplicarFormatoCondicionalStock() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Stock');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Error', 'La hoja "Stock" no existe.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  aplicarFormatoCondicionalStockEnHoja(sheet);
  SpreadsheetApp.getUi().alert('Formato condicional aplicado en Stock.');
}

// ════════════════════════════════════════════════════════════
//  2. MOVIMIENTOS
// ════════════════════════════════════════════════════════════
function crearHojaMovimientos(ss) {
  var res = obtenerOCrearHoja(ss, 'Movimientos');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = [
    'TIMESTAMP', 'TIPO_MOVIMIENTO', 'SKU', 'PRODUCTO', 'CANTIDAD',
    'STOCK_ANTERIOR', 'STOCK_NUEVO', 'PRECIO_UNITARIO', 'PROVEEDOR',
    'PEDIDO_REF', 'CANAL', 'EDITADO', 'FECHA_EDICION'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatearEncabezado(sheet, headers.length);

  sheet.setColumnWidth(1, 170);  // TIMESTAMP
  sheet.setColumnWidth(2, 160);  // TIPO_MOVIMIENTO
  sheet.setColumnWidth(4, 160);  // PRODUCTO
  sheet.setColumnWidth(13, 170); // FECHA_EDICION
}

// ════════════════════════════════════════════════════════════
//  3. PEDIDOS
// ════════════════════════════════════════════════════════════
function crearHojaPedidos(ss) {
  var res = obtenerOCrearHoja(ss, 'Pedidos');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = [
    'ID_PEDIDO', 'FECHA', 'TIPO_MUEBLE', 'MEDIDAS', 'COLOR',
    'CANTIDAD', 'ESTADO', 'MATERIALES_JSON', 'FALTANTES', 'NOTAS'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatearEncabezado(sheet, headers.length);

  sheet.setColumnWidth(4, 140);  // MEDIDAS
  sheet.setColumnWidth(8, 300);  // MATERIALES_JSON
  sheet.setColumnWidth(9, 200);  // FALTANTES
  sheet.setColumnWidth(10, 200); // NOTAS
}

// ════════════════════════════════════════════════════════════
//  3.b FALTANTES (por SKU, registra lo que falta reponer)
// ════════════════════════════════════════════════════════════
function crearHojaFaltantes(ss) {
  var res = obtenerOCrearHoja(ss, 'Faltantes');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = [
    'faltante_id', 'pedido_id', 'item_id', 'sku', 'material',
    'cantidad_faltante', 'unidad', 'proveedor', 'precio_costo',
    'costo_estimado', 'estado', 'fecha_alta', 'fecha_resuelto', 'notas'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatearEncabezado(sheet, headers.length);

  sheet.setColumnWidth(1, 180);   // faltante_id
  sheet.setColumnWidth(2, 170);   // pedido_id
  sheet.setColumnWidth(3, 200);   // item_id
  sheet.setColumnWidth(4, 130);   // sku
  sheet.setColumnWidth(5, 180);   // material
  sheet.setColumnWidth(8, 140);   // proveedor
  sheet.setColumnWidth(11, 110);  // estado
  sheet.setColumnWidth(12, 140);  // fecha_alta
  sheet.setColumnWidth(13, 140);  // fecha_resuelto
  sheet.setColumnWidth(14, 240);  // notas

  // Formato: costos como moneda
  sheet.getRange(2, 9, 1000, 2).setNumberFormat('$#,##0');
}

// ════════════════════════════════════════════════════════════
//  4. USUARIOS_AUTORIZADOS
// ════════════════════════════════════════════════════════════
function crearHojaUsuarios(ss) {
  var res = obtenerOCrearHoja(ss, 'Usuarios_Autorizados');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = ['TELEGRAM_ID', 'NOMBRE', 'ROL', 'ACTIVO'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var data = [
    ['123456789', 'Admin Principal', 'admin', true],
    ['987654321', 'Operario Taller', 'operario', true]
  ];
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  formatearEncabezado(sheet, headers.length);
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 160);
}

// ════════════════════════════════════════════════════════════
//  5. FORMULAS_BOM
// ════════════════════════════════════════════════════════════
function crearHojaFormulasBOM(ss) {
  var res = obtenerOCrearHoja(ss, 'Formulas_BOM');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = [
    'TIPO_MUEBLE', 'COMPONENTE', 'BUSCAR_POR',
    'SKU_FIJO', 'CATEGORIA_BUSQUEDA', 'CANTIDAD_POR_UNIDAD', 'UNIDAD'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // BUSCAR_POR: "SKU" = busca por SKU_FIJO directo | "CATEGORIA" = busca por CATEGORIA_BUSQUEDA + color del pedido
  // CANTIDAD_POR_UNIDAD: cuanto se consume por cada unidad del mueble
  // Ejemplo: alacena_1m necesita 0.5 placas MDF, 0.25 placas fondo, 4 bisagras, etc.
  var data = [
    ['alacena_1m', 'Placa MDF 18mm',      'CATEGORIA', '', 'MDF 18mm',    0.5,  'placas'],
    ['alacena_1m', 'Placa Fondo 3mm',      'CATEGORIA', '', 'Fondo 3mm',  0.25, 'placas'],
    ['alacena_1m', 'Bisagras Codo 0',      'SKU',       'HA-236', '',     4,    'unidades'],
    ['alacena_1m', 'Tornillos Fix 4x50',   'SKU',       'FI-266', '',     12,   'unidades'],
    ['alacena_1m', 'Tornillos Fix 3.5x16', 'SKU',       'FI-263', '',     16,   'unidades'],
    ['alacena_1m', 'Filo PVC 22mm',        'CATEGORIA', '', 'Filo/Canto', 0.09, 'rollos']
  ];
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  formatearEncabezado(sheet, headers.length);
  sheet.setColumnWidth(1, 160); // TIPO_MUEBLE
  sheet.setColumnWidth(2, 200); // COMPONENTE
  sheet.setColumnWidth(5, 200); // CATEGORIA_BUSQUEDA
}

// ════════════════════════════════════════════════════════════
//  6. PROVEEDORES
// ════════════════════════════════════════════════════════════
function crearHojaProveedores(ss) {
  var res = obtenerOCrearHoja(ss, 'Proveedores');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = [
    'ID_PROVEEDOR', 'NOMBRE', 'TELEFONO', 'EMAIL',
    'DIRECCION', 'CATEGORIAS', 'NOTAS'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var data = [
    ['PROV-001', 'Masisa',  '+54 11 4000-1111', 'ventas@masisa.com',  'Av. Industrial 1234, Buenos Aires',  'Tableros, Fondos',         'Entrega a 48hs'],
    ['PROV-002', 'Egger',   '+54 11 4000-2222', 'ventas@egger.com.ar','Ruta 9 km 45, Campana',              'Tableros, Cantos',         'Pedido minimo 10 planchas']
  ];
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  formatearEncabezado(sheet, headers.length);
  sheet.setColumnWidth(4, 200); // EMAIL
  sheet.setColumnWidth(5, 280); // DIRECCION
  sheet.setColumnWidth(6, 160); // CATEGORIAS
  sheet.setColumnWidth(7, 220); // NOTAS
}

// ════════════════════════════════════════════════════════════
//  7. CONFIG
// ════════════════════════════════════════════════════════════
function crearHojaConfig(ss) {
  var res = obtenerOCrearHoja(ss, 'Config');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = ['PARAMETRO', 'VALOR', 'DESCRIPCION'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var data = [
    ['ALERTA_EMAIL',       '',        'Email para recibir alertas de stock bajo'],
    ['REPORTE_FRECUENCIA', 'SEMANAL', 'Frecuencia del reporte automatico (DIARIO/SEMANAL/MENSUAL)'],
    ['REPORTE_DIA',        'LUNES',   'Dia de la semana para el reporte semanal'],
    ['REPORTE_HORA',       '08:00',   'Hora de envio del reporte (formato 24hs)'],
    ['MONEDA',             'ARS',     'Moneda para precios (ARS/USD)'],
    ['PIN_WEB',            '1234',    'PIN de acceso para la interfaz web']
  ];
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  formatearEncabezado(sheet, headers.length);
  sheet.setColumnWidth(1, 200); // PARAMETRO
  sheet.setColumnWidth(2, 120); // VALOR
  sheet.setColumnWidth(3, 420); // DESCRIPCION
}

// ════════════════════════════════════════════════════════════
//  8. SESIONES
// ════════════════════════════════════════════════════════════
function crearHojaSesiones(ss) {
  var res = obtenerOCrearHoja(ss, 'Sesiones');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  var headers = ['CHAT_ID', 'ESTADO', 'DATOS', 'UPDATED_AT'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  formatearEncabezado(sheet, headers.length);
  sheet.setColumnWidth(3, 300); // DATOS (JSON)
  sheet.setColumnWidth(4, 170); // UPDATED_AT
}

// ════════════════════════════════════════════════════════════
//  9. DASHBOARD
// ════════════════════════════════════════════════════════════
function crearHojaDashboard(ss) {
  var res = obtenerOCrearHoja(ss, 'Dashboard');
  var sheet = res.sheet;
  if (!res.esNueva) return;

  // ── Titulo ──
  sheet.getRange('A1').setValue('DASHBOARD - STOCK FONTANA').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A2').setValue('Resumen generado con formulas en tiempo real').setFontColor('#666666');

  // ── Seccion: Resumen general ──
  sheet.getRange('A4').setValue('RESUMEN GENERAL').setFontWeight('bold').setFontSize(12);

  var labels = [
    ['Total de productos en catalogo',    '=COUNTA(Stock!A2:A)'],
    ['Valor total del stock (ARS)',       '=SUM(Stock!K2:K)'],
    ['Productos con stock en 0',          '=COUNTIF(Stock!F2:F,0)'],
    ['Productos bajo minimo',             '=COUNTIFS(Stock!F2:F,">"&0,Stock!F2:F,"<"&Stock!G2:G)'],
    ['Productos sobre minimo x1.5',       '=COUNTIF(Stock!F2:F,">"&Stock!G2:G)']
  ];

  for (var i = 0; i < labels.length; i++) {
    var row = 5 + i;
    sheet.getRange(row, 1).setValue(labels[i][0]);
    sheet.getRange(row, 3).setFormula(labels[i][1]);
  }

  // Formato para valor monetario
  sheet.getRange(6, 3).setNumberFormat('$#,##0');

  // ── Seccion: Totales por categoria ──
  sheet.getRange('A11').setValue('TOTALES POR CATEGOR\u00cdA').setFontWeight('bold').setFontSize(12);

  sheet.getRange('A12').setValue('Categor\u00eda').setFontWeight('bold');
  sheet.getRange('B12').setValue('Cant. Productos').setFontWeight('bold');
  sheet.getRange('C12').setValue('Valor Stock (ARS)').setFontWeight('bold');

  // Categorias conocidas
  var categorias = ['Tableros', 'Cantos'];
  for (var j = 0; j < categorias.length; j++) {
    var r = 13 + j;
    sheet.getRange(r, 1).setValue(categorias[j]);
    sheet.getRange(r, 2).setFormula('=COUNTIF(Stock!B2:B,"' + categorias[j] + '")');
    sheet.getRange(r, 3).setFormula('=SUMIF(Stock!B2:B,"' + categorias[j] + '",Stock!K2:K)');
    sheet.getRange(r, 3).setNumberFormat('$#,##0');
  }

  // Fila de total
  var totalRow = 13 + categorias.length;
  sheet.getRange(totalRow, 1).setValue('TOTAL').setFontWeight('bold');
  sheet.getRange(totalRow, 2).setFormula('=SUM(B13:B' + (totalRow - 1) + ')').setFontWeight('bold');
  sheet.getRange(totalRow, 3).setFormula('=SUM(C13:C' + (totalRow - 1) + ')').setFontWeight('bold').setNumberFormat('$#,##0');

  // ── Seccion: Movimientos recientes ──
  var movRow = totalRow + 2;
  sheet.getRange(movRow, 1).setValue('MOVIMIENTOS RECIENTES').setFontWeight('bold').setFontSize(12);
  sheet.getRange(movRow + 1, 1).setValue('Total ingresos registrados');
  sheet.getRange(movRow + 1, 3).setFormula('=COUNTIF(Movimientos!B2:B,"INGRESO")');
  sheet.getRange(movRow + 2, 1).setValue('Total egresos registrados');
  sheet.getRange(movRow + 2, 3).setFormula('=COUNTIF(Movimientos!B2:B,"EGRESO")');
  sheet.getRange(movRow + 3, 1).setValue('Total ajustes registrados');
  sheet.getRange(movRow + 3, 3).setFormula('=COUNTIF(Movimientos!B2:B,"AJUSTE")');

  // ── Seccion: Pedidos ──
  var pedRow = movRow + 5;
  sheet.getRange(pedRow, 1).setValue('PEDIDOS').setFontWeight('bold').setFontSize(12);
  sheet.getRange(pedRow + 1, 1).setValue('Pedidos pendientes');
  sheet.getRange(pedRow + 1, 3).setFormula('=COUNTIF(Pedidos!G2:G,"PENDIENTE")');
  sheet.getRange(pedRow + 2, 1).setValue('Pedidos en produccion');
  sheet.getRange(pedRow + 2, 3).setFormula('=COUNTIF(Pedidos!G2:G,"EN_PRODUCCION")');
  sheet.getRange(pedRow + 3, 1).setValue('Pedidos completados');
  sheet.getRange(pedRow + 3, 3).setFormula('=COUNTIF(Pedidos!G2:G,"COMPLETADO")');

  // ── Seccion: Espacio para graficos ──
  var chartRow = pedRow + 5;
  sheet.getRange(chartRow, 1).setValue('ZONA DE GR\u00c1FICOS').setFontWeight('bold').setFontSize(12).setFontColor('#999999');
  sheet.getRange(chartRow + 1, 1).setValue('(Insertar graficos de Sheets aqui: stock por categoria, tendencia de movimientos, etc.)').setFontColor('#aaaaaa');

  // Anchos de columna
  sheet.setColumnWidth(1, 300);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 180);

  // Fondo suave en todo el dashboard
  sheet.getRange('A1:C1').setBackground('#e8f0fe');
}
