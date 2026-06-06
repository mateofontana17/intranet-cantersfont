/* ========================================
   Fontana - Control de Stock
   App logic
   ======================================== */

const WEBHOOK_URL = 'https://joaquingonzalezmenza.app.n8n.cloud/webhook/fontana-stock-form';
// ---- DOM refs ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const pinOverlay = $('#pin-overlay');
const pinInput = $('#pin-input');
const pinSubmitBtn = $('#pin-submit');
const app = $('#app');
const menuSection = $('#menu-section');

let currentPin = '';

// ---- Searchable Select ----
// STOCK_OPTIONS: catalogo completo de materiales cargado desde "Materiales y Stock"
// Cada item define categoria / producto / color / medida / codigo. El formulario de compra
// pide categoria + color + medida y deduce el codigo (pide producto si hay ambiguedad).
// STOCK_OPTIONS se llena dinámicamente desde el webhook consultar_stock.
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

const NO_MEDIDA_LABEL = '—';
const SIN_VARIANTE_LABEL = '(sin variante)';

function uniqSorted(arr) {
  return [...new Set(arr)].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
}
function _catVal(display) { return display === SIN_VARIANTE_LABEL ? '' : display; }
function _medidaVal(display) { return display === NO_MEDIDA_LABEL ? '' : display; }

function getCategorias() {
  return uniqSorted(STOCK_OPTIONS.map(o => o.categoria || SIN_VARIANTE_LABEL));
}
function getColoresFor(categoriaDisplay) {
  const src = categoriaDisplay
    ? STOCK_OPTIONS.filter(o => o.categoria === _catVal(categoriaDisplay))
    : STOCK_OPTIONS;
  return uniqSorted(src.map(o => o.color));
}
function getMedidasFor(categoriaDisplay, color) {
  let src = STOCK_OPTIONS;
  if (categoriaDisplay) src = src.filter(o => o.categoria === _catVal(categoriaDisplay));
  if (color) src = src.filter(o => o.color === color);
  const raw = src.map(o => o.medida);
  return uniqSorted(raw.map(m => m === '' ? NO_MEDIDA_LABEL : m));
}
function getProductosFor(categoriaDisplay, color, medidaDisplay) {
  let src = STOCK_OPTIONS;
  if (categoriaDisplay) src = src.filter(o => o.categoria === _catVal(categoriaDisplay));
  if (color) src = src.filter(o => o.color === color);
  if (medidaDisplay) src = src.filter(o => o.medida === _medidaVal(medidaDisplay));
  return uniqSorted(src.map(o => o.producto));
}
function findItems(categoriaDisplay, color, medidaDisplay) {
  return STOCK_OPTIONS.filter(o =>
    o.categoria === _catVal(categoriaDisplay) &&
    o.color === color &&
    o.medida === _medidaVal(medidaDisplay)
  );
}

const VALID_PROVEEDORES = [
  'Masisa/Egger', 'Arauco', 'Egger', 'Masisa', 'Egger/Rehau',
  'Maderas del Sur', 'Laminados AR', 'Hafele', 'Eurohard', 'King Slide',
  'Grandes Marcas', 'Fischer', 'Rehau', 'Bronzen', 'Grupo Euro',
  'Placol', 'Agorex', 'Varios'
];

const VALID_COLORES = [
  'Blanco', 'Gris Arcilla', 'Gris Macadan', 'Gris Perla', 'Gris Cubanita',
  'Gris Sombra', 'Negro', 'Cerezo Locarno', 'Roble Kendal Conac',
  'Pino Aland Polar', 'Roble Termo Negro', 'Hormigon Chicago Gris Oscuro',
  'Roble Whiteriver Gris Marron', 'Castano Kentucky Arena', 'Lino Antracita',
  'Fineline Metallic Antracita', 'Roble Kendal Natural', 'Amarillo Girasol',
  'Rosa Antiguo', 'Rojo Cereza', 'Naranja de Siena', 'Azul Cosmico',
  'Verde Kiwi', 'Roble Denver Marron Trufa', 'Coco Bolo',
  'Roble de Nebraska Natural', 'Roble de Nebraska Gris', 'Nogal Warmia Marron',
  'Roble Kendal Encerado', 'Textil Beige', 'Blanco Alpino', 'Chromix Blanco',
  'Textil Gris', 'Pino Cascina', 'Roble Davos Natural',
  'Roble Davos Marron Trufa', 'Hickory Natural', 'Lino Blanco', 'Lino Topo',
  'Roble Norwich', 'Roble Lorenzo Arena', 'Roble Bardolino Natural',
  'Chromix Plata', 'Roble Whiteriver Beige Arena', 'Pino Aland Blanco',
  'Pietra Grigia Negro', 'Nogal del Pacifico Natural', 'Nogal Lincoln',
  'Roble Vicenza Gris', 'Roble Kaiserberg', 'Metal Cepillado Oro',
  'Metal Cepillado Bronce', 'Metallic Inox', 'Caoba Floreada', 'Caoba Rayada',
  'Cedrillo / Curupixa', 'Cedro Jeketiba', 'Cerejeira', 'Fresno', 'Guatambu',
  'Guayubira', 'Guindo / Lenga AMH', 'Haya', 'Incienso', 'Kiri', 'Laurel',
  'Nogal', 'Paraiso', 'Peteriby', 'Peteriby Brasilero', 'Pino',
  'Roble Americano', 'Roble 250 Reconstituido', 'Roble Rojo',
  'Peteriby Ray Reconstituido', 'Incienso Reconstituido'
];

let ssCompraCategoria = null;
let ssCompraColor = null;
let ssCompraMedida = null;
let ssCompraProducto = null;
let ssCompraProveedor = null;

// ---- Stock state ----
let stockRawData = [];
let stockSortCol = 'codigo';
let stockSortAsc = true;

class SearchableSelect {
  constructor(containerId, options, onChange) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.onChange = onChange || null;
    this.textInput = this.container.querySelector('.ss-input');
    this.hiddenInput = this.container.querySelector('input[type="hidden"]');
    this.dropdown = this.container.querySelector('.ss-dropdown');
    this.filteredOptions = options;
    this.selectedValue = '';
    this.highlightIndex = -1;
    this.isOpen = false;

    this._render();
    this._bindEvents();
  }

  setOptions(options) {
    const prev = this.selectedValue;
    this.options = options || [];
    if (prev && this.options.includes(prev)) {
      // preservar seleccion si sigue siendo valida
      this._render(this.textInput.value);
    } else {
      this.reset();
      this._render();
    }
  }

  setEnabled(enabled, placeholder) {
    this.textInput.disabled = !enabled;
    if (placeholder !== undefined) this.textInput.placeholder = placeholder;
    if (!enabled) this.reset();
  }

  _render(filter = '') {
    const q = filter.toLowerCase();
    this.filteredOptions = q
      ? this.options.filter(o => o.toLowerCase().includes(q))
      : [...this.options];

    if (this.filteredOptions.length === 0) {
      this.dropdown.innerHTML = '<div class="ss-empty">Sin resultados</div>';
    } else {
      this.dropdown.innerHTML = this.filteredOptions.map(o =>
        `<div class="ss-option" data-value="${o}">${this._highlight(o, q)}</div>`
      ).join('');
    }
    this.highlightIndex = -1;
  }

  _highlight(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    return text.slice(0, idx) + '<strong>' + text.slice(idx, idx + query.length) + '</strong>' + text.slice(idx + query.length);
  }

  _bindEvents() {
    this.textInput.addEventListener('input', () => {
      this._render(this.textInput.value);
      this._open();
      const wasSelected = !!this.hiddenInput.value;
      this.hiddenInput.value = '';
      this.selectedValue = '';
      // Si habia un valor seleccionado y ahora quedo vacio, avisar al cascade
      if (wasSelected && this.onChange) this.onChange('');
    });

    this.textInput.addEventListener('focus', () => {
      this._render(this.textInput.value);
      this._open();
    });

    this.textInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!this.selectedValue) {
          this.textInput.value = '';
          this.hiddenInput.value = '';
        }
        this._close();
      }, 150);
    });

    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!this.isOpen) { this._render(this.textInput.value); this._open(); }
        this._moveHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!this.isOpen) { this._render(this.textInput.value); this._open(); }
        this._moveHighlight(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.highlightIndex >= 0 && this.filteredOptions[this.highlightIndex]) {
          this._select(this.filteredOptions[this.highlightIndex]);
        }
      } else if (e.key === 'Escape') {
        this._close();
      }
    });

    this.dropdown.addEventListener('mousedown', (e) => {
      const opt = e.target.closest('.ss-option');
      if (opt) {
        e.preventDefault();
        this._select(opt.dataset.value);
      }
    });
  }

  _select(value) {
    this.selectedValue = value;
    this.textInput.value = value;
    this.hiddenInput.value = value;
    this._close();
    this.textInput.classList.remove('input-error');
    if (this.onChange) this.onChange(value);
  }

  _open() {
    this.dropdown.classList.add('ss-open');
    this.isOpen = true;
  }

  _close() {
    this.dropdown.classList.remove('ss-open');
    this.isOpen = false;
    this.highlightIndex = -1;
  }

  _moveHighlight(dir) {
    const opts = this.dropdown.querySelectorAll('.ss-option');
    if (opts.length === 0) return;

    if (this.highlightIndex >= 0 && this.highlightIndex < opts.length) {
      opts[this.highlightIndex].classList.remove('ss-highlighted');
    }

    this.highlightIndex += dir;
    if (this.highlightIndex < 0) this.highlightIndex = opts.length - 1;
    if (this.highlightIndex >= opts.length) this.highlightIndex = 0;

    opts[this.highlightIndex].classList.add('ss-highlighted');
    opts[this.highlightIndex].scrollIntoView({ block: 'nearest' });
  }

  reset() {
    this.textInput.value = '';
    this.hiddenInput.value = '';
    this.selectedValue = '';
    this._close();
  }
}

// ---- PIN check (hash-based, sin PIN literal en el source) ----
const _PH = ['b56e59e3e3ea6171', '1b844fd3410e00ee', '164ed39b78807a2e', 'c6fc6ac136240940'].join('');
async function _sha256Hex(s) {
  const b = new TextEncoder().encode(String(s || ''));
  const d = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(d))
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}
async function isValidPin(p) {
  if (!p) return false;
  try {
    return (await _sha256Hex(p)) === _PH;
  } catch (err) {
    console.error('PIN hash error:', err);
    return false;
  }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  try {
    bindEvents();
  } catch (err) {
    console.error('Error en bindEvents:', err);
  }

  try {
    const storedPin = sessionStorage.getItem('fontana_pin');
    if (await isValidPin(storedPin)) {
      currentPin = storedPin;
      showApp();
      return;
    }
  } catch (err) {
    console.error('Error validando PIN almacenado:', err);
  }
  if (pinInput) pinInput.focus();
});

// ---- PIN handling ----
function bindEvents() {
  pinSubmitBtn.addEventListener('click', handlePinSubmit);
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePinSubmit();
  });


  // Menu cards
  $$('.menu-card').forEach(card => {
    card.addEventListener('click', () => openSection(card.dataset.action));
  });

  // Back buttons
  $('#back-compra').addEventListener('click', backToMenu);
  $('#back-stock').addEventListener('click', backToMenu);
  $('#back-alertas').addEventListener('click', backToMenu);
  $('#back-historial').addEventListener('click', backToMenu);
  $('#back-estandares').addEventListener('click', backToMenu);

  // Stock events
  $('#stk-refresh-btn').addEventListener('click', () => loadStockData());
  $('#stk-search').addEventListener('input', renderStockTable);
  $('#stk-hoja-filter').addEventListener('change', renderStockTable);
  $('#stk-seccion-filter').addEventListener('change', renderStockTable);
  $('#stk-cat-filter').addEventListener('change', renderStockTable);
  $('#stk-marca-filter').addEventListener('change', renderStockTable);
  $('#stk-reponer-filter').addEventListener('change', renderStockTable);
  $$('#stk-table th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (stockSortCol === col) {
        stockSortAsc = !stockSortAsc;
      } else {
        stockSortCol = col;
        stockSortAsc = true;
      }
      renderStockTable();
    });
  });

  // Compra: 4 selects en cascada bidireccional (categoria, color, medida, producto).
  // Todos siempre habilitados. Al elegir cualquiera se filtran los otros 3.
  const onSelect = (field) => () => refreshCompraCascade(field);
  ssCompraCategoria = new SearchableSelect('ss-compra-categoria', getCategorias(), onSelect('categoria'));
  ssCompraColor = new SearchableSelect('ss-compra-color', getColoresFor(''), onSelect('color'));
  ssCompraMedida = new SearchableSelect('ss-compra-medida', getMedidasFor('', ''), onSelect('medida'));
  ssCompraProducto = new SearchableSelect('ss-compra-producto', getProductosFor('', '', ''), onSelect('producto'));

  ssCompraProveedor = new SearchableSelect('ss-compra-proveedor', VALID_PROVEEDORES);

  // Compra: restricciones de input
  applyArgentineNumberRestriction($('#compra-precio'));
  applyIntegerRestriction($('#compra-cantidad'));

  // Forms
  $('#form-compra').addEventListener('submit', handleCompraSubmit);

  // Compra confirmation modal
  $('#confirm-compra-cancel').addEventListener('click', () => {
    $('#confirm-compra').classList.add('hidden');
  });
  $('#confirm-compra .modal-backdrop').addEventListener('click', () => {
    $('#confirm-compra').classList.add('hidden');
  });
  $('#confirm-compra-ok').addEventListener('click', handleCompraSend);
}

async function handlePinSubmit() {
  try {
    const pin = pinInput.value.trim();
    if (!pin) {
      pinInput.classList.add('input-error');
      toast('Ingrese un PIN valido', 'error');
      return;
    }
    if (!(await isValidPin(pin))) {
      pinInput.classList.add('input-error');
      toast('PIN incorrecto', 'error');
      return;
    }
    pinInput.classList.remove('input-error');
    currentPin = pin;
    sessionStorage.setItem('fontana_pin', pin);
    showApp();
  } catch (err) {
    console.error('Error en handlePinSubmit:', err);
    toast('Error al validar PIN. Revise la consola.', 'error');
  }
}

function showApp() {
  pinOverlay.classList.add('hidden');
  app.classList.remove('hidden');
  // Cargar catalogo real desde la Sheet (no usar hardcoded).
  loadStockOptions().catch(() => { /* el toast ya avisó */ });
}

// ---- Navigation ----
function openSection(action) {
  menuSection.classList.add('hidden');
  $$('.section').forEach(s => s.classList.add('hidden'));

  const section = $(`#section-${action}`);
  if (section) section.classList.remove('hidden');

  if (action === 'registrar_compra') loadStockOptions().catch(() => {});
  if (action === 'stock') loadStockData();
  if (action === 'consultar_alertas') fetchAlertas();
  if (action === 'historial') fetchHistorial();
  if (action === 'estandares') fetchEstandares();
}

function backToMenu() {
  $$('.section').forEach(s => s.classList.add('hidden'));
  menuSection.classList.remove('hidden');
}

// ---- Toast ----
function toast(message, type = 'info') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, 3500);
}

// ---- Argentine number parsing ----
function parseArgentineNumber(str) {
  // Remove dots (thousand separators), replace comma with dot (decimal separator)
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatArgentineNumber(num) {
  // Format number to Argentine style: 1.500,50
  const parts = num.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return intPart + ',' + parts[1];
}

// ---- Validation helpers ----
function clearErrors(form) {
  form.querySelectorAll('.input-error').forEach((el) => el.classList.remove('input-error'));
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
}

function showFieldError(input, message) {
  input.classList.add('input-error');
  const errorEl = input.closest('.form-group')
    ? input.closest('.form-group').querySelector('.field-error')
    : null;
  if (errorEl) errorEl.textContent = message;
}

// ---- Input restriction helpers ----
function applyArgentineNumberRestriction(input) {
  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
    if (e.key >= '0' && e.key <= '9') return;
    const val = input.value;
    if (e.key === '.') {
      if (val.length === 0 || val.includes('.') || val.includes(',')) { e.preventDefault(); return; }
      return;
    }
    if (e.key === ',') {
      if (val.length === 0 || val.includes(',')) { e.preventDefault(); return; }
      return;
    }
    e.preventDefault();
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const current = input.value;
    let cleaned = text.replace(/[^0-9.,]/g, '');
    let hasDot = current.includes('.');
    let hasComma = current.includes(',');
    let result = '';
    for (const ch of cleaned) {
      if (ch === '.') { if (hasDot || hasComma) continue; hasDot = true; }
      if (ch === ',') { if (hasComma) continue; hasComma = true; }
      result += ch;
    }
    if (current.length === 0) result = result.replace(/^[.,]+/, '');
    document.execCommand('insertText', false, result);
  });
}

function applyIntegerRestriction(input) {
  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
    if (e.key >= '0' && e.key <= '9') return;
    e.preventDefault();
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const cleaned = text.replace(/[^0-9]/g, '');
    document.execCommand('insertText', false, cleaned);
  });
}

// ---- Registrar Compra ----
let pendingCompraData = null;

function filteredCompraItems(skip) {
  const cat = $('#compra-categoria').value.trim();
  const color = $('#compra-color').value.trim();
  const medida = $('#compra-medida').value.trim();
  const producto = $('#compra-producto').value.trim();
  let items = STOCK_OPTIONS;
  if (skip !== 'categoria' && cat) items = items.filter(o => o.categoria === _catVal(cat));
  if (skip !== 'color' && color) items = items.filter(o => o.color === color);
  if (skip !== 'medida' && medida) items = items.filter(o => o.medida === _medidaVal(medida));
  if (skip !== 'producto' && producto) items = items.filter(o => o.producto === producto);
  return items;
}
function refreshCompraCascade(justSelected) {
  const fieldMap = {
    categoria: { ss: ssCompraCategoria, extract: o => o.categoria || SIN_VARIANTE_LABEL },
    color:     { ss: ssCompraColor,     extract: o => o.color },
    medida:    { ss: ssCompraMedida,    extract: o => o.medida === '' ? NO_MEDIDA_LABEL : o.medida },
    producto:  { ss: ssCompraProducto,  extract: o => o.producto },
  };

  // Solo actualizar las opciones de los otros campos, sin auto-seleccionar.
  // Eso preserva las selecciones validas y evita que el usuario quede atrapado
  // con un estado que no puede cambiar (ver bug "se anulan el resto de opciones").
  Object.entries(fieldMap).forEach(([field, { ss, extract }]) => {
    if (field === justSelected) return;
    const opts = uniqSorted(filteredCompraItems(field).map(extract));
    ss.setOptions(opts);
    // UX: si no hay opciones reales, deshabilitar el campo con placeholder.
    const realOpts = opts.filter(o => o && o.trim() && o !== NO_MEDIDA_LABEL && o !== SIN_VARIANTE_LABEL);
    if (opts.length === 0) {
      ss.setEnabled(false, 'No aplica para este producto');
    } else if (realOpts.length === 0 && opts.length === 1) {
      // Solo opción es vacío/placeholder → auto-seleccionar
      ss.setEnabled(true);
      const placeholder = opts[0];
      ss._select(placeholder);
    } else {
      ss.setEnabled(true, 'Buscar...');
    }
  });

  resolvecodigoFromSelection();
}

function resolvecodigoFromSelection() {
  const items = filteredCompraItems(null);
  $('#compra-codigo').value = items.length === 1 ? items[0].codigo : '';
}

function resetCompraSelects() {
  ssCompraCategoria.reset();
  ssCompraColor.setOptions(getColoresFor(''));
  ssCompraMedida.setOptions(getMedidasFor('', ''));
  ssCompraProducto.setOptions(getProductosFor('', '', ''));
  $('#compra-codigo').value = '';
  ssCompraProveedor.reset();
}

function handleCompraSubmit(e) {
  e.preventDefault();
  const form = $('#form-compra');
  clearErrors(form);

  const categoria = $('#compra-categoria').value.trim();
  const color = $('#compra-color').value.trim();
  const medidaDisplay = $('#compra-medida').value.trim();
  const medida = medidaDisplay === NO_MEDIDA_LABEL ? '' : medidaDisplay;
  const codigo = $('#compra-codigo').value.trim();
  const cantidadInput = $('#compra-cantidad');
  const precioInput = $('#compra-precio');
  const proveedorHidden = $('#compra-proveedor');
  const proveedorVisible = $('#ss-compra-proveedor .ss-input');
  const productoValue = $('#compra-producto').value.trim();

  let valid = true;

  if (!categoria) {
    showFieldError($('#ss-compra-categoria .ss-input'), 'Seleccione una categoria');
    valid = false;
  }
  // Estos campos son obligatorios SOLO si el catálogo tiene opciones
  // para la selección actual. Si no hay opciones (ej: tornillos sin color),
  // se permite avanzar y la resolución del código es la validación final.
  const colorOpts = ssCompraColor && ssCompraColor.options ? ssCompraColor.options.filter(o => o && o.trim()) : [];
  const medidaOpts = ssCompraMedida && ssCompraMedida.options ? ssCompraMedida.options.filter(o => o && o.trim() && o !== NO_MEDIDA_LABEL) : [];
  const productoOpts = ssCompraProducto && ssCompraProducto.options ? ssCompraProducto.options.filter(o => o && o.trim()) : [];
  if (!color && colorOpts.length > 0) {
    showFieldError($('#ss-compra-color .ss-input'), 'Seleccione un color/variante');
    valid = false;
  }
  if (!medidaDisplay && medidaOpts.length > 0) {
    showFieldError($('#ss-compra-medida .ss-input'), 'Seleccione una medida');
    valid = false;
  }
  if (!productoValue && productoOpts.length > 0) {
    showFieldError($('#ss-compra-producto .ss-input'), 'Seleccione un producto');
    valid = false;
  }
  if (valid && !codigo) {
    showFieldError($('#ss-compra-producto .ss-input'), 'Combinacion no disponible en el catalogo');
    valid = false;
  }

  const cantidad = parseInt(cantidadInput.value, 10);
  if (!cantidadInput.value || isNaN(cantidad) || cantidad < 1) {
    showFieldError(cantidadInput, 'Ingrese una cantidad valida (min. 1)');
    valid = false;
  }

  const precioRaw = precioInput.value.trim();
  const precio = parseArgentineNumber(precioRaw);
  if (!precioRaw || precio === null || precio <= 0) {
    showFieldError(precioInput, 'Ingrese un precio valido (Ej: 1.500,50)');
    valid = false;
  }

  const proveedor = proveedorHidden.value.trim();
  if (!proveedor) {
    showFieldError(proveedorVisible, 'Seleccione un proveedor de la lista');
    valid = false;
  }

  if (!valid) return;

  pendingCompraData = { codigo, categoria, color, medida, producto: productoValue, cantidad, precio, proveedor };

  // Show confirmation
  const body = $('#confirm-compra-body');
  const medidaDisplayRow = medida ? `
    <div class="confirm-row">
      <span class="confirm-label">Medida</span>
      <span class="confirm-value">${escapeHtml(medida)}</span>
    </div>` : '';
  const productoRow = productoValue ? `
    <div class="confirm-row">
      <span class="confirm-label">Variante</span>
      <span class="confirm-value">${escapeHtml(productoValue)}</span>
    </div>` : '';
  body.innerHTML = `
    <div class="confirm-row">
      <span class="confirm-label">Categoria</span>
      <span class="confirm-value">${escapeHtml(categoria)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Color / Variante</span>
      <span class="confirm-value">${escapeHtml(color)}</span>
    </div>
    ${medidaDisplayRow}
    ${productoRow}
    <div class="confirm-row">
      <span class="confirm-label">Codigo</span>
      <span class="confirm-value">${escapeHtml(codigo)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Cantidad</span>
      <span class="confirm-value">${cantidad}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Precio unitario</span>
      <span class="confirm-value">$${formatArgentineNumber(precio)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Total</span>
      <span class="confirm-value">$${formatArgentineNumber(precio * cantidad)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Proveedor</span>
      <span class="confirm-value">${escapeHtml(proveedor)}</span>
    </div>
  `;
  $('#confirm-compra').classList.remove('hidden');
}

async function handleCompraSend() {
  if (!pendingCompraData) return;

  const okBtn = $('#confirm-compra-ok');
  const cancelBtn = $('#confirm-compra-cancel');
  okBtn.disabled = true;
  cancelBtn.disabled = true;
  okBtn.textContent = 'Enviando...';

  try {
    await sendToWebhook('registrar_compra', pendingCompraData);
    toast('Compra registrada correctamente', 'success');
    $('#form-compra').reset();
    resetCompraSelects();
    $('#confirm-compra').classList.add('hidden');
    loadStockData();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    okBtn.disabled = false;
    cancelBtn.disabled = false;
    okBtn.textContent = 'Enviar';
    pendingCompraData = null;
  }
}

// ---- Stock View ----
async function loadStockData() {
  const loading = $('#stk-loading');
  const tableWrap = $('#stk-table-wrap');

  loading.classList.remove('hidden');
  tableWrap.classList.add('hidden');

  try {
    const data = await sendToWebhook('consultar_stock', {});
    stockRawData = Array.isArray(data) ? data : (data.items || data.data || []);
    populateStockFilters();
    renderStockTable();
  } catch (err) {
    toast('Error al cargar stock: ' + err.message, 'error');
    $('#stk-tbody').innerHTML = '<tr><td colspan="13" class="stk-empty">Error al cargar datos</td></tr>';
    tableWrap.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

function populateStockFilters() {
  const uniq = (key) =>
    [...new Set(stockRawData.map(r => r[key]).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'es'));

  const fill = (selId, placeholder, values) => {
    const sel = $(selId);
    const current = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` +
      values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    sel.value = current;
  };

  fill('#stk-hoja-filter',    'Todas las hojas',     uniq('hoja_origen'));
  fill('#stk-seccion-filter', 'Todas las secciones', uniq('seccion'));
  fill('#stk-cat-filter',     'Todas las categorias', uniq('categoria'));
  fill('#stk-marca-filter',   'Todas las marcas',    uniq('marca'));
}

function getFilteredStockData() {
  const search       = ($('#stk-search').value || '').toLowerCase();
  const hojaFilter   = $('#stk-hoja-filter').value;
  const secFilter    = $('#stk-seccion-filter').value;
  const catFilter    = $('#stk-cat-filter').value;
  const marcaFilter  = $('#stk-marca-filter').value;
  const reponerFilter = $('#stk-reponer-filter').value;

  const isReponer = (v) => /^s(i|í)$/i.test(String(v || '').trim());

  let data = stockRawData.filter(row => {
    if (hojaFilter  && row.hoja_origen    !== hojaFilter)  return false;
    if (secFilter   && row.seccion        !== secFilter)   return false;
    if (catFilter   && row.categoria      !== catFilter)   return false;
    if (marcaFilter && row.marca          !== marcaFilter) return false;
    if (reponerFilter === 'si' && !isReponer(row.reponer)) return false;
    if (reponerFilter === 'no' &&  isReponer(row.reponer)) return false;
    if (search) {
      const haystack = [
        row.hoja_origen, row.seccion, row.producto, row.categoria,
        row.color_variante, row.marca, row.medida, row.codigo
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  data.sort((a, b) => {
    let va = a[stockSortCol] ?? '';
    let vb = b[stockSortCol] ?? '';
    const na = parseFloat(va);
    const nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) {
      return stockSortAsc ? na - nb : nb - na;
    }
    va = String(va).toLowerCase();
    vb = String(vb).toLowerCase();
    return stockSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  return data;
}

function fmtStockPrice(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '-';
  return '$' + formatArgentineNumber(num);
}

function renderStockTable() {
  const data = getFilteredStockData();
  const tbody = $('#stk-tbody');
  const tableWrap = $('#stk-table-wrap');

  // Summary
  const totalUnits = data.reduce((s, r) => s + (parseFloat(r.stock_actual) || 0), 0);
  const totalValue = data.reduce((s, r) => s + (parseFloat(r.precio_total) || 0), 0);
  $('#stk-count').textContent = data.length;
  $('#stk-units').textContent = Math.round(totalUnits).toLocaleString('es-AR');
  $('#stk-value').textContent = '$' + formatArgentineNumber(totalValue);

  // Sort indicators
  $$('#stk-table th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === stockSortCol) {
      th.classList.add(stockSortAsc ? 'sort-asc' : 'sort-desc');
    }
  });

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="stk-empty">No se encontraron productos</td></tr>';
    tableWrap.classList.remove('hidden');
    return;
  }

  const isReponer = (v) => /^s(i|í)$/i.test(String(v || '').trim());

  tbody.innerHTML = data.map(row => {
    const stock = parseFloat(row.stock_actual) || 0;
    const stockMin = parseFloat(row.stock_min) || 0;
    let cls = '';
    if (stock === 0) cls = 'stk-row-danger';
    else if (isReponer(row.reponer) || (stockMin > 0 && stock < stockMin)) cls = 'stk-row-warn';

    const reponerHtml = isReponer(row.reponer)
      ? `<span class="stk-badge stk-badge-warn">Si</span>`
      : `<span class="stk-badge stk-badge-ok">No</span>`;

    return `<tr class="${cls}">
      <td data-label="Hoja Origen">${escapeHtml(String(row.hoja_origen ?? ''))}</td>
      <td data-label="Seccion">${escapeHtml(String(row.seccion ?? ''))}</td>
      <td data-label="Producto">${escapeHtml(String(row.producto ?? ''))}</td>
      <td data-label="Categoria">${escapeHtml(String(row.categoria ?? ''))}</td>
      <td data-label="Color / Variante">${escapeHtml(String(row.color_variante ?? ''))}</td>
      <td data-label="Marca">${escapeHtml(String(row.marca ?? ''))}</td>
      <td data-label="Medida">${escapeHtml(String(row.medida ?? ''))}</td>
      <td data-label="Codigo"><strong>${escapeHtml(String(row.codigo ?? ''))}</strong></td>
      <td data-label="Precio Unit.">${fmtStockPrice(row.precio_unit)}</td>
      <td data-label="Stock Actual">${escapeHtml(String(row.stock_actual ?? ''))}</td>
      <td data-label="Stock Min.">${escapeHtml(String(row.stock_min ?? ''))}</td>
      <td data-label="Precio Total">${fmtStockPrice(row.precio_total)}</td>
      <td data-label="Reponer">${reponerHtml}</td>
    </tr>`;
  }).join('');

  tableWrap.classList.remove('hidden');
}

// ---- Ver Alertas ----
async function fetchAlertas() {
  const loading = $('#alertas-loading');
  const results = $('#alertas-results');

  loading.classList.remove('hidden');
  results.classList.add('hidden');
  results.innerHTML = '';

  try {
    const data = await sendToWebhook('consultar_alertas', {});
    renderAlertas(data);
  } catch (err) {
    toast(err.message, 'error');
    results.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#10060;</div>
        <p>Error al consultar alertas</p>
      </div>`;
    results.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

function renderAlertas(data) {
  const results = $('#alertas-results');
  const items = Array.isArray(data) ? data : (data && data.items ? data.items : (data && data.alertas ? data.alertas : []));

  if (items.length === 0) {
    results.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9989;</div>
        <p>No hay alertas activas. Todo el stock esta en orden.</p>
      </div>`;
    results.classList.remove('hidden');
    return;
  }

  let html = '<ul class="alerta-list">';
  items.forEach((item) => {
    const nombre = item.nombre || item.name || item.codigo || '-';
    const actual = item.cantidad != null ? item.cantidad : (item.stock != null ? item.stock : '?');
    const minimo = item.minimo != null ? item.minimo : (item.min != null ? item.min : '?');
    html += `
      <li class="alerta-item">
        <div class="alerta-dot"></div>
        <div class="alerta-info">
          <div class="alerta-name">${escapeHtml(String(nombre))}</div>
          <div class="alerta-detail">Stock actual: ${escapeHtml(String(actual))} / Minimo: ${escapeHtml(String(minimo))}</div>
        </div>
      </li>`;
  });
  html += '</ul>';

  results.innerHTML = html;
  results.classList.remove('hidden');
}

// ---- Webhook sender ----
async function sendToWebhook(action, data) {
  const payload = {
    action,
    data,
    pin: currentPin,
  };

  let response;
  try {
  response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  },
  body: JSON.stringify(payload),
  });
  } catch (networkError) {
    throw new Error('Error de red. Verifique su conexion e intente nuevamente.');
  }

  let body;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch (_) {
      body = null;
    }
  } else {
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = text;
    }
  }

  if (!response.ok) {
    const msg =
      (body && typeof body === 'object' && (body.message || body.error)) ||
      (typeof body === 'string' && body) ||
      `Error del servidor (${response.status})`;
    throw new Error(msg);
  }

  return body;
}

// ========================================
// HISTORIAL DE MOVIMIENTOS
// ========================================

let historialRawData = [];
let historialFiltered = [];

function initHistorial() {
  $('#hist-filtrar-btn').addEventListener('click', applyHistorialFilters);
  $('#hist-export-btn').addEventListener('click', exportHistorialCSV);
  $('#hist-buscar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyHistorialFilters();
  });
}

async function fetchHistorial() {
  const loading = $('#hist-loading');
  const results = $('#hist-results');

  loading.classList.remove('hidden');
  results.innerHTML = '';

  try {
    const data = await sendToWebhook('historial', {});
    historialRawData = Array.isArray(data) ? data : (data.items || data.data || []);
    applyHistorialFilters();
  } catch (err) {
    toast('Error al cargar historial: ' + err.message, 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

function applyHistorialFilters() {
  const tipo = $('#hist-tipo').value;
  const buscar = ($('#hist-buscar').value || '').toLowerCase().trim();
  const desde = $('#hist-desde').value;
  const hasta = $('#hist-hasta').value;

  historialFiltered = historialRawData.filter(m => {
    if (tipo && (m.tipo || '').toUpperCase() !== tipo) return false;
    if (buscar) {
      const haystack = [m.codigo, m.tipo_mueble, m.proveedor, m.color].join(' ').toLowerCase();
      if (!haystack.includes(buscar)) return false;
    }
    if (desde && m.fecha < desde) return false;
    if (hasta && m.fecha < hasta + 'Z') {
      // Allow same-day: hasta is inclusive
    }
    if (hasta) {
      const fechaDate = m.fecha ? m.fecha.slice(0, 10) : '';
      if (fechaDate > hasta) return false;
    }
    return true;
  });

  renderHistorialSummary(historialFiltered);
  renderHistorial(historialFiltered);
}

function renderHistorialSummary(movs) {
  const hoy = new Date().toISOString().slice(0, 10);
  const hoyCount = movs.filter(m => (m.fecha || '').slice(0, 10) === hoy).length;

  const compras = movs.filter(m => (m.tipo || '').toUpperCase() === 'COMPRA');
  const ventas = movs.filter(m => (m.tipo || '').toUpperCase() === 'VENTA');

  const ultCompraFecha = compras.length ? formatHistFecha(compras[compras.length - 1].fecha) : '-';
  const ultVentaFecha = ventas.length ? formatHistFecha(ventas[ventas.length - 1].fecha) : '-';

  $('#hist-total-hoy').textContent = hoyCount;
  $('#hist-ultima-compra').textContent = ultCompraFecha;
  $('#hist-ultima-venta').textContent = ultVentaFecha;
}

function formatHistFecha(fecha) {
  if (!fecha) return '-';
  try {
    const parts = fecha.match(/(\d{4})-(\d{2})-(\d{2})\s*(\d{2}):(\d{2})/);
    if (parts) return `${parts[3]}/${parts[2]} ${parts[4]}:${parts[5]}`;
    const d = new Date(fecha);
    if (isNaN(d)) return fecha;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return fecha; }
}

function renderHistorial(movs) {
  const results = $('#hist-results');
  if (!movs || movs.length === 0) {
    results.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128220;</div><p>No hay movimientos</p></div>';
    return;
  }

  let html = '';
  // Show newest first
  const sorted = [...movs].reverse();
  sorted.forEach((m) => {
    const isCompra = (m.tipo || '').toUpperCase() === 'COMPRA';
    const badgeClass = isCompra ? 'badge-green' : 'badge-red';
    const badgeText = isCompra ? 'COMPRA' : 'VENTA';
    const signo = isCompra ? '+' : '-';

    const titulo = isCompra ? (m.codigo || '-') : (m.tipo_mueble || '-');
    const detalle = isCompra
      ? [m.codigo, m.proveedor].filter(Boolean).join(' - ')
      : [m.tipo_mueble, m.color, m.medidas].filter(Boolean).join(' - ');

    const precioHtml = isCompra && m.precio_unit
      ? `<div><strong>Precio unit.:</strong> $${formatArgentineNumber(m.precio_unit)}</div>` : '';
    const totalHtml = isCompra && m.total
      ? `<div><strong>Total:</strong> $${formatArgentineNumber(m.total)}</div>` : '';

    html += `<div class="hist-row" onclick="this.classList.toggle('expanded')">
      <div class="hist-row-top">
        <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
        <span class="hist-row-codigo">${escapeHtml(titulo)}</span>
        <span class="hist-row-fecha">${escapeHtml(formatHistFecha(m.fecha))}</span>
        <span class="hist-row-cant">${signo}${escapeHtml(String(m.cantidad || ''))}</span>
      </div>
      <div class="hist-row-detail">
        <div><strong>Detalle:</strong> ${escapeHtml(detalle)}</div>
        ${precioHtml}
        ${totalHtml}
      </div>
    </div>`;
  });

  results.innerHTML = html;
}

function exportHistorialCSV() {
  if (!historialFiltered || historialFiltered.length === 0) {
    toast('No hay datos para exportar', 'info');
    return;
  }

  const headers = ['Fecha', 'Tipo', 'codigo', 'Tipo Mueble', 'Medidas', 'Color', 'Cantidad', 'Precio Unit.', 'Proveedor', 'Total'];
  const rows = historialFiltered.map(m => [
    m.fecha || '',
    m.tipo || '',
    m.codigo || '',
    m.tipo_mueble || '',
    m.medidas || '',
    m.color || '',
    m.cantidad || '',
    m.precio_unit || '',
    m.proveedor || '',
    m.total || '',
  ]);

  let csv = headers.join(',') + '\n';
  rows.forEach(r => {
    csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'historial_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}


// ========================================
// GESTION DE ESTANDARES (BOM)
// ========================================

let estandaresData = [];
let editingEstandar = null; // null = nuevo, string = tipo_mueble editando

function initEstandares() {
  $('#est-nuevo-btn').addEventListener('click', () => openEstandarEdit(null));
  $('#est-back-lista').addEventListener('click', closeEstandarEdit);
  $('#est-cancel-btn').addEventListener('click', closeEstandarEdit);
  $('#est-add-material').addEventListener('click', () => addMaterialRow({}));
  $('#form-estandar').addEventListener('submit', handleEstandarSubmit);
  $('#est-sim-btn').addEventListener('click', handleSimular);
  $('#est-buscar').addEventListener('input', renderEstandaresFiltered);
}

async function fetchEstandares() {
  const loading = $('#est-loading');
  const lista = $('#est-lista');
  loading.classList.remove('hidden');
  lista.innerHTML = '';

  try {
    const body = await sendToWebhook('listar_estandares', {});
    const raw = body.estandares || body || [];
    estandaresData = Array.isArray(raw) ? raw : [];

    if (estandaresData.length > 0 && estandaresData[0].TIPO_MUEBLE) {
      estandaresData = groupBOMRows(estandaresData);
    }

    renderEstandaresFiltered();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

function groupBOMRows(rows) {
  const map = {};
  rows.forEach(r => {
    const key = r.TIPO_MUEBLE || r.tipo_mueble;
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        tipo_mueble: key,
        nombre_display: r.NOMBRE_DISPLAY || r.nombre_display || key,
        descripcion: r.DESCRIPCION || r.descripcion || '',
        materiales: [],
      };
    }
    map[key].materiales.push({
      componente: r.COMPONENTE || r.componente || '',
      buscar_por: r.BUSCAR_POR || r.buscar_por || 'codigo',
      codigo_fijo: r.codigo_FIJO || r.codigo_fijo || '',
      categoria_busqueda: r.CATEGORIA_BUSQUEDA || r.categoria_busqueda || '',
      cantidad_por_unidad: parseFloat(r.CANTIDAD_POR_UNIDAD || r.cantidad_por_unidad) || 0,
      unidad: r.UNIDAD || r.unidad || '',
    });
  });
  return Object.values(map);
}

function renderEstandaresFiltered() {
  const buscar = ($('#est-buscar').value || '').toLowerCase().trim();
  const filtered = buscar
    ? estandaresData.filter(e =>
        (e.nombre_display || e.tipo_mueble || '').toLowerCase().includes(buscar) ||
        (e.tipo_mueble || '').toLowerCase().includes(buscar))
    : estandaresData;

  renderEstandaresList(filtered);
}

function renderEstandaresList(items) {
  const lista = $('#est-lista');
  if (!items || items.length === 0) {
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128295;</div><p>No hay estandares cargados</p></div>';
    return;
  }

  let html = '';
  items.forEach(e => {
    const matCount = (e.materiales || []).length;
    html += `<div class="est-card">
      <div class="est-card-info">
        <div class="est-card-name">${escapeHtml(e.nombre_display || e.tipo_mueble)}</div>
        <div class="est-card-desc">${escapeHtml(e.descripcion || '')}</div>
        <div class="est-card-count">${matCount} material${matCount !== 1 ? 'es' : ''} | ID: ${escapeHtml(e.tipo_mueble)}</div>
      </div>
      <div class="est-card-actions">
        <button class="btn-icon" onclick="openEstandarEdit('${escapeHtml(e.tipo_mueble)}')" title="Editar">&#9998;</button>
        <button class="btn-icon btn-danger" onclick="deleteEstandar('${escapeHtml(e.tipo_mueble)}')" title="Eliminar">&#10005;</button>
      </div>
    </div>`;
  });

  lista.innerHTML = html;
}

function openEstandarEdit(tipoMueble) {
  editingEstandar = tipoMueble;
  $('#est-lista-view').classList.add('hidden');
  $('#est-edit-view').classList.remove('hidden');
  $('#est-sim-result').innerHTML = '';

  if (tipoMueble) {
    const est = estandaresData.find(e => e.tipo_mueble === tipoMueble);
    if (!est) { toast('Estandar no encontrado', 'error'); return; }
    $('#est-edit-title').textContent = 'Editar: ' + (est.nombre_display || tipoMueble);
    $('#est-tipo-mueble').value = est.tipo_mueble;
    $('#est-tipo-mueble').readOnly = true;
    $('#est-nombre').value = est.nombre_display || '';
    $('#est-descripcion').value = est.descripcion || '';
    $('#est-materiales-list').innerHTML = '';
    (est.materiales || []).forEach(m => addMaterialRow(m));
  } else {
    $('#est-edit-title').textContent = 'Nuevo Estandar';
    $('#est-tipo-mueble').value = '';
    $('#est-tipo-mueble').readOnly = false;
    $('#est-nombre').value = '';
    $('#est-descripcion').value = '';
    $('#est-materiales-list').innerHTML = '';
    addMaterialRow({});
  }
}

function closeEstandarEdit() {
  $('#est-edit-view').classList.add('hidden');
  $('#est-lista-view').classList.remove('hidden');
  editingEstandar = null;
}

function addMaterialRow(mat) {
  const container = $('#est-materiales-list');
  const row = document.createElement('div');
  row.className = 'est-mat-row';

  const buscarPor = (mat.buscar_por || 'codigo').toUpperCase();

  row.innerHTML = `
    <div class="est-mat-row-top">
      <input type="text" class="input input-sm mat-componente" placeholder="Componente" value="${escapeHtml(mat.componente || '')}" />
      <select class="input input-sm mat-buscar-por">
        <option value="codigo" ${buscarPor === 'codigo' ? 'selected' : ''}>Por codigo</option>
        <option value="CATEGORIA" ${buscarPor === 'CATEGORIA' ? 'selected' : ''}>Por Categoria</option>
      </select>
    </div>
    <div class="est-mat-row-bottom">
      <input type="text" class="input input-sm mat-codigo" placeholder="codigo fijo" value="${escapeHtml(mat.codigo_fijo || '')}" ${buscarPor === 'CATEGORIA' ? 'style="display:none"' : ''} />
      <input type="text" class="input input-sm mat-categoria" placeholder="Categoria busqueda" value="${escapeHtml(mat.categoria_busqueda || '')}" ${buscarPor === 'codigo' ? 'style="display:none"' : ''} />
      <input type="number" class="input input-sm mat-cantidad" placeholder="Cant/u" step="0.01" min="0" value="${mat.cantidad_por_unidad || ''}" />
      <input type="text" class="input input-sm mat-unidad" placeholder="Unidad" value="${escapeHtml(mat.unidad || '')}" style="max-width:90px" />
      <button type="button" class="est-mat-remove" title="Quitar">&times;</button>
    </div>`;

  const sel = row.querySelector('.mat-buscar-por');
  const codigoIn = row.querySelector('.mat-codigo');
  const catIn = row.querySelector('.mat-categoria');
  sel.addEventListener('change', () => {
    if (sel.value === 'codigo') {
      codigoIn.style.display = ''; catIn.style.display = 'none';
    } else {
      codigoIn.style.display = 'none'; catIn.style.display = '';
    }
  });

  row.querySelector('.est-mat-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function collectMateriales() {
  const rows = $$('#est-materiales-list .est-mat-row');
  const materiales = [];
  rows.forEach(row => {
    const componente = row.querySelector('.mat-componente').value.trim();
    const buscar_por = row.querySelector('.mat-buscar-por').value;
    const codigo_fijo = row.querySelector('.mat-codigo').value.trim();
    const categoria_busqueda = row.querySelector('.mat-categoria').value.trim();
    const cantidad_por_unidad = parseFloat(row.querySelector('.mat-cantidad').value) || 0;
    const unidad = row.querySelector('.mat-unidad').value.trim();
    if (!componente && !codigo_fijo && !categoria_busqueda) return;
    materiales.push({ componente, buscar_por, codigo_fijo, categoria_busqueda, cantidad_por_unidad, unidad });
  });
  return materiales;
}

async function handleEstandarSubmit(e) {
  e.preventDefault();
  const form = $('#form-estandar');
  clearErrors(form);

  const tipo_mueble = $('#est-tipo-mueble').value.trim();
  const nombre_display = $('#est-nombre').value.trim();

  if (!tipo_mueble) { showFieldError($('#est-tipo-mueble'), 'Requerido'); return; }
  if (!nombre_display) { showFieldError($('#est-nombre'), 'Requerido'); return; }

  const materiales = collectMateriales();
  if (materiales.length === 0) { toast('Agrega al menos un material', 'error'); return; }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  try {
    await sendToWebhook('guardar_estandar', {
      tipo_mueble,
      nombre_display,
      descripcion: $('#est-descripcion').value.trim(),
      materiales,
    });
    toast('Estandar guardado', 'success');
    closeEstandarEdit();
    fetchEstandares();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar';
  }
}

async function deleteEstandar(tipoMueble) {
  if (!confirm('Eliminar estandar "' + tipoMueble + '"?')) return;

  try {
    await sendToWebhook('eliminar_estandar', { tipo_mueble: tipoMueble });
    toast('Estandar eliminado', 'success');
    fetchEstandares();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function handleSimular() {
  const color = $('#est-sim-color').value.trim();
  const cantidad = parseInt($('#est-sim-cantidad').value) || 1;
  const resultDiv = $('#est-sim-result');

  if (!color) { toast('Ingresa un color', 'error'); return; }

  const tipo_mueble = $('#est-tipo-mueble').value.trim();
  if (!tipo_mueble) { toast('Guarda el estandar primero', 'error'); return; }

  resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await sendToWebhook('simular_venta', { tipo_mueble, color, cantidad });
    renderSimResult(data, resultDiv);
  } catch (err) {
    resultDiv.innerHTML = '<p style="color:var(--color-danger);font-size:0.85rem">' + escapeHtml(err.message) + '</p>';
  }
}

function renderSimResult(data, container) {
  if (!data) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:0.85rem">Sin datos</p>';
    return;
  }

  const items = data.detalle || data.updates || data.faltantes || [];
  const ok = data.ok !== false;

  if (items.length === 0 && ok) {
    container.innerHTML = '<p style="color:var(--color-success);font-size:0.85rem">Stock suficiente para esta venta</p>';
    return;
  }

  let html = '';
  if (data.faltantes && data.faltantes.length > 0) {
    data.faltantes.forEach(f => {
      html += `<div class="sim-line">
        <span class="sim-fail">&#10060;</span>
        <span>${escapeHtml(f.componente || f.codigo || '-')}: necesita ${f.necesario}, hay ${f.disponible}, faltan ${f.faltante}</span>
      </div>`;
    });
  }
  if (data.updates && data.updates.length > 0) {
    data.updates.forEach(u => {
      html += `<div class="sim-line">
        <span class="sim-ok">&#9989;</span>
        <span>${escapeHtml(u.codigo || '-')}: stock nuevo ${u.STOCK}</span>
      </div>`;
    });
  }

  if (data.mensaje) {
    html += `<p style="margin-top:8px;font-size:0.82rem;color:var(--color-text-secondary)">${escapeHtml(data.mensaje)}</p>`;
  }

  container.innerHTML = html;
}

// ---- Init modules ----
document.addEventListener('DOMContentLoaded', () => {
  initHistorial();
  initEstandares();
});

// ---- Utilities ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
