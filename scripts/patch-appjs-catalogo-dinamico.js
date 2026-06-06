#!/usr/bin/env node
/**
 * Patch del web-form/app.js: reemplaza el catálogo hardcoded STOCK_OPTIONS
 * por una carga dinámica desde el webhook consultar_stock.
 *
 * Antes: STOCK_OPTIONS era un array literal de ~300 items con códigos
 *        que NO coinciden con los códigos reales en la Sheet.
 * Después: STOCK_OPTIONS se llena con la data real al iniciar la app,
 *          garantizando que el código resuelto siempre matchea.
 *
 * Uso: node patch-appjs-catalogo-dinamico.js
 */

const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, '..', 'web-form', 'app.js');
const BACKUP_PATH = APP_PATH + '.bak';

const src = fs.readFileSync(APP_PATH, 'utf8');

// Backup por las dudas.
if (!fs.existsSync(BACKUP_PATH)) {
  fs.writeFileSync(BACKUP_PATH, src, 'utf8');
  console.log('✔ Backup en', BACKUP_PATH);
}

// 1) Reemplazar el array hardcoded por uno vacío.
const startMarker = 'const STOCK_OPTIONS = [';
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) throw new Error('No se encontró STOCK_OPTIONS');

// Buscar el cierre `];` que matchea el array. Asumimos que es el primer `\n];\n`.
const endMarker = '\n];\n';
const endIdx = src.indexOf(endMarker, startIdx);
if (endIdx === -1) throw new Error('No se encontró el cierre del array');

const before = src.slice(0, startIdx);
const after = src.slice(endIdx + endMarker.length);

const replacement = `// STOCK_OPTIONS se llena dinámicamente desde el webhook consultar_stock.
// Antes era un array hardcoded con códigos que no coincidían con la Sheet.
let STOCK_OPTIONS = [];
let stockOptionsLoaded = false;
let stockOptionsLoadingPromise = null;

async function loadStockOptions(force = false) {
  if (stockOptionsLoaded && !force) return STOCK_OPTIONS;
  if (stockOptionsLoadingPromise) return stockOptionsLoadingPromise;

  stockOptionsLoadingPromise = (async () => {
    try {
      const response = await sendToWebhook('consultar_stock', {});
      const items = Array.isArray(response) ? response : (response.items || response.data || []);
      STOCK_OPTIONS = items
        .map((r) => ({
          categoria: String(r.categoria || '').trim(),
          producto: String(r.producto || '').trim(),
          color: String(r.color_variante || r.color || '').trim(),
          medida: String(r.medida || '').trim(),
          codigo: String(r.codigo || '').trim(),
        }))
        .filter((o) => o.codigo); // solo items con código válido

      stockOptionsLoaded = true;

      // Refrescar selectores de Compra si ya están instanciados.
      if (typeof ssCompraCategoria !== 'undefined' && ssCompraCategoria) {
        ssCompraCategoria.setOptions(getCategorias());
        ssCompraColor.setOptions(getColoresFor(''));
        ssCompraMedida.setOptions(getMedidasFor('', ''));
        ssCompraProducto.setOptions(getProductosFor('', '', ''));
      }

      return STOCK_OPTIONS;
    } catch (err) {
      console.error('[loadStockOptions] Error cargando catálogo:', err);
      if (typeof toast === 'function') {
        toast('No se pudo cargar el catálogo desde la sheet. Reintentá.', 'error');
      }
      throw err;
    } finally {
      stockOptionsLoadingPromise = null;
    }
  })();

  return stockOptionsLoadingPromise;
}
`;

let next = before + replacement + after;

// 2) Hookear showApp() para llamar a loadStockOptions().
const showAppOrig = `function showApp() {
  pinOverlay.classList.add('hidden');
  app.classList.remove('hidden');
}`;
const showAppNew = `function showApp() {
  pinOverlay.classList.add('hidden');
  app.classList.remove('hidden');
  // Cargar catalogo real desde la Sheet (no usar hardcoded).
  loadStockOptions().catch(() => { /* el toast ya avisó */ });
}`;

if (!next.includes(showAppOrig)) {
  throw new Error('No se encontró el bloque showApp() original para reemplazar');
}
next = next.replace(showAppOrig, showAppNew);

// 3) Hookear openSection('registrar_compra') para refrescar el catálogo
// la primera vez que se abre (por si llegó después del PIN).
const openSectionOrig = `function openSection(action) {
  menuSection.classList.add('hidden');
  $$('.section').forEach(s => s.classList.add('hidden'));

  const section = $(\`#section-\${action}\`);
  if (section) section.classList.remove('hidden');

  if (action === 'stock') loadStockData();`;
const openSectionNew = `function openSection(action) {
  menuSection.classList.add('hidden');
  $$('.section').forEach(s => s.classList.add('hidden'));

  const section = $(\`#section-\${action}\`);
  if (section) section.classList.remove('hidden');

  if (action === 'registrar_compra') loadStockOptions().catch(() => {});
  if (action === 'stock') loadStockData();`;

if (next.includes(openSectionOrig)) {
  // String.replace interpreta $$ como $ literal en el replacement → usar función.
  next = next.replace(openSectionOrig, () => openSectionNew);
} else {
  console.log('⚠ No se pudo hookear openSection (no critical, showApp ya carga)');
}

fs.writeFileSync(APP_PATH, next, 'utf8');

const sizeBefore = src.length;
const sizeAfter = next.length;
console.log('✔ app.js actualizado');
console.log(`  Antes: ${sizeBefore} bytes`);
console.log(`  Después: ${sizeAfter} bytes`);
console.log(`  Reducción: ${sizeBefore - sizeAfter} bytes (catálogo hardcoded eliminado)`);
