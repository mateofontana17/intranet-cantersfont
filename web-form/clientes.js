/* ========================================
   Fontana - Clientes & Pedidos
   App logic
   ======================================== */

/*
 * Estructura de datos — Cliente (hoja "Clientes"):
 * {
 *   cliente_id: string,    // ID unico generado por n8n (ej: "CLI-001")
 *   nombre: string,        // Nombre completo
 *   telefono: string,      // Telefono de contacto
 *   email: string,         // Email (opcional)
 *   direccion: string,     // Direccion (opcional)
 *   localidad: string,     // Localidad (opcional)
 *   notas: string          // Notas (opcional)
 * }
 *
 * Estructura de datos — Pedido (hoja "Pedidos_Proceso", cabecera):
 * {
 *   pedido_id: string,       // ID unico generado por n8n (ej: "PED-001")
 *   cliente_id: string,      // FK -> Clientes
 *   cliente_nombre: string,  // Denormalizado para display
 *   fecha_entrega: string,   // YYYY-MM-DD
 *   sena: number,            // $ sena
 *   total: number,           // $ total
 *   estado: string,          // Pendiente | En producción | Listo para entregar | Entregado
 *   notas: string,
 *   items: [Item]            // Array de items (viene del join con Pedido_Items)
 * }
 *
 * Estructura de datos — Item (hoja "Pedido_Items", detalle):
 * {
 *   item_id: string,         // ID unico (ej: "ITEM-001")
 *   pedido_id: string,       // FK -> Pedidos_Proceso
 *   tipo_mueble: string,     // Bajo mesada | Alacena | Vanitory | Placard | Otro
 *   alto: number,            // cm
 *   ancho: number,           // cm
 *   profundidad: number,     // cm
 *   color: string,
 *   nivel: number,            // 2 | 3 | 4 | 5
 *   completado: boolean,     // true/false
 *   notas_item: string       // (opcional)
 * }
 */

// Endpoint del webhook. Prioridad:
//  1) override manual por localStorage (fontana_webhook_override) — para casos especiales.
//  2) si la página se sirve desde localhost (entorno de desarrollo) → n8n local.
//  3) en cualquier otro dominio (producción / Netlify) → n8n cloud del dev.
// En producción el sitio NO corre en localhost, así que siempre usa la URL cloud.
const WEBHOOK_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('fontana_webhook_override'))
  || ((typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
      ? 'http://localhost:5678/webhook/fontana-stock-form'
      : 'https://joaquingonzalezmenza.app.n8n.cloud/webhook/fontana-stock-form');

// ---- DOM helpers ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- Constants ----
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

// Canonical: usamos ortografía correcta (tilde + infinitivo).
// normalizeEstado() mapea los valores viejos de la sheet a estos.
const ESTADOS_PEDIDO = ['Pendiente', 'En producción', 'Listo para entregar', 'Entregado'];
const ESTADOS_ITEM = ['Pendiente', 'En producción', 'Listo para entregar', 'Entregado'];

function normalizeEstado(s) {
  if (!s) return '';
  const n = String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n === 'pendiente') return 'Pendiente';
  if (n === 'en produccion') return 'En producción';
  if (n === 'listo para entregar' || n === 'listo para entrega') return 'Listo para entregar';
  if (n === 'entregado') return 'Entregado';
  return s; // valor desconocido, se deja como está
}

// ---- State ----
let currentPin = '';
let clientesData = [];
let pedidosData = [];
let editingClienteId = null;
let pedidosFetched = false;
let currentEstadoFilter = '';

// ========================================
// INIT
// ========================================

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
  return (await _sha256Hex(p)) === _PH;
}

document.addEventListener('DOMContentLoaded', async () => {
  createColoresDatalist();
  bindEvents();

  const storedPin = sessionStorage.getItem('fontana_pin');
  if (await isValidPin(storedPin)) {
    currentPin = storedPin;
    showApp();
  } else {
    $('#pin-input').focus();
  }
});

function createColoresDatalist() {
  const dl = document.createElement('datalist');
  dl.id = 'colores-list';
  VALID_COLORES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    dl.appendChild(opt);
  });
  document.body.appendChild(dl);
}

// ========================================
// PIN HANDLING
// ========================================

function bindEvents() {
  // PIN
  $('#pin-submit').addEventListener('click', handlePinSubmit);
  $('#pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePinSubmit();
  });

  // Tabs
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Clientes
  $('#cli-nuevo-btn').addEventListener('click', () => openClienteEdit(null));
  $('#cli-back-lista').addEventListener('click', closeClienteEdit);
  $('#cli-buscar').addEventListener('input', renderClientesFiltered);
  $('#form-cliente').addEventListener('submit', handleClienteSubmit);

  // Proyectos (Etapa 1)
  $('#ped-nuevo-btn').addEventListener('click', openPedidoEdit);
  $('#ped-back-lista').addEventListener('click', closePedidoEdit);
  $('#ped-detail-back').addEventListener('click', closeProyectoFicha);
  $('#ped-refresh-btn').addEventListener('click', fetchPedidos);
  $('#form-pedido').addEventListener('submit', handlePedidoSubmit);

  // Status filter buttons
  $$('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEstadoFilter = btn.dataset.estado;
      renderPedidosFiltered();
    });
  });
}

async function handlePinSubmit() {
  const pin = $('#pin-input').value.trim();
  if (!pin) {
    $('#pin-input').classList.add('input-error');
    toast('Ingrese un PIN valido', 'error');
    return;
  }
  if (!(await isValidPin(pin))) {
    $('#pin-input').classList.add('input-error');
    toast('PIN incorrecto', 'error');
    return;
  }
  $('#pin-input').classList.remove('input-error');
  currentPin = pin;
  sessionStorage.setItem('fontana_pin', pin);
  showApp();
}

function showApp() {
  $('#pin-overlay').classList.add('hidden');
  $('#app').classList.remove('hidden');
  fetchClientes();
}

// ========================================
// TAB NAVIGATION
// ========================================

function switchTab(tab) {
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  $(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

  $$('.tab-content').forEach(c => c.classList.add('hidden'));
  $(`#tab-${tab}`).classList.remove('hidden');

  if (tab === 'pedidos' && !pedidosFetched) {
    fetchPedidos();
  }
}

// ========================================
// TOAST
// ========================================

function toast(message, type = 'info') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  // Warning toasts llevan más info → dejarlos más tiempo visibles.
  const duracion = type === 'warning' ? 8000 : 3500;
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duracion);
}

// ========================================
// HELPERS
// ========================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseArgentineNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatArgentineNumber(num) {
  const parts = num.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return intPart + ',' + parts[1];
}

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatFecha(fecha) {
  if (!fecha) return '-';
  try {
    const parts = fecha.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (parts) return `${parts[3]}/${parts[2]}/${parts[1]}`;
    return fecha;
  } catch (_) { return fecha; }
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

// ========================================
// WEBHOOK SENDER
// ========================================

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
// CLIENTES — CRUD
// ========================================

async function fetchClientes() {
  const loading = $('#cli-loading');
  const lista = $('#cli-lista');
  loading.classList.remove('hidden');
  lista.innerHTML = '';

  try {
    const data = await sendToWebhook('listar_clientes', {});
    // Null-safe: hoja vacía devuelve body vacío → mostramos estado "sin clientes", no error.
    const safe = data || {};
    clientesData = Array.isArray(safe) ? safe : (safe.clientes || safe.items || safe.data || []);
    renderClientesFiltered();
  } catch (err) {
    toast('Error al cargar clientes: ' + err.message, 'error');
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#10060;</div><p>Error al cargar clientes</p></div>';
  } finally {
    loading.classList.add('hidden');
  }
}

function renderClientesFiltered() {
  const buscar = ($('#cli-buscar').value || '').toLowerCase().trim();
  const filtered = buscar
    ? clientesData.filter(c =>
        (c.nombre || '').toLowerCase().includes(buscar) ||
        (c.telefono || '').toLowerCase().includes(buscar))
    : clientesData;

  renderClientesList(filtered);
}

function renderClientesList(items) {
  const lista = $('#cli-lista');

  if (!items || items.length === 0) {
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128100;</div><p>No hay clientes registrados</p></div>';
    return;
  }

  let html = '';
  items.forEach(c => {
    const detailParts = [];
    if (c.telefono) detailParts.push('&#128222; ' + escapeHtml(c.telefono));
    if (c.email) detailParts.push('&#9993; ' + escapeHtml(c.email));
    if (c.localidad) detailParts.push('&#128205; ' + escapeHtml(c.localidad));

    html += `<div class="cli-card">
      <div class="cli-card-info">
        <div class="cli-card-name">${escapeHtml(c.nombre || '-')}</div>
        <div class="cli-card-detail">${detailParts.join(' &middot; ')}</div>
        ${c.notas ? `<div class="cli-card-notas">${escapeHtml(c.notas)}</div>` : ''}
      </div>
      <div class="cli-card-actions">
        <button class="btn-icon" onclick="openClienteEdit('${escapeHtml(c.cliente_id)}')" title="Editar">&#9998;</button>
      </div>
    </div>`;
  });

  lista.innerHTML = html;
}

function openClienteEdit(clienteId) {
  editingClienteId = clienteId;
  $('#cli-list-view').classList.add('hidden');
  $('#cli-edit-view').classList.remove('hidden');

  const form = $('#form-cliente');
  clearErrors(form);

  if (clienteId) {
    const c = clientesData.find(c => c.cliente_id === clienteId);
    if (!c) { toast('Cliente no encontrado', 'error'); return; }
    $('#cli-edit-title').textContent = 'Editar Cliente';
    $('#cli-id').value = c.cliente_id;
    $('#cli-nombre').value = c.nombre || '';
    $('#cli-telefono').value = c.telefono || '';
    $('#cli-email').value = c.email || '';
    $('#cli-direccion').value = c.direccion || '';
    $('#cli-localidad').value = c.localidad || '';
    $('#cli-notas').value = c.notas || '';
    $('#cli-submit-btn').textContent = 'Guardar Cambios';
  } else {
    $('#cli-edit-title').textContent = 'Nuevo Cliente';
    $('#cli-id').value = '';
    form.reset();
    $('#cli-submit-btn').textContent = 'Guardar Cliente';
  }
}

function closeClienteEdit() {
  $('#cli-edit-view').classList.add('hidden');
  $('#cli-list-view').classList.remove('hidden');
  editingClienteId = null;
}

async function handleClienteSubmit(e) {
  e.preventDefault();
  const form = $('#form-cliente');
  clearErrors(form);

  const nombre = $('#cli-nombre').value.trim();
  const telefono = $('#cli-telefono').value.trim();
  const email = $('#cli-email').value.trim();
  const direccion = $('#cli-direccion').value.trim();
  const localidad = $('#cli-localidad').value.trim();
  const notas = $('#cli-notas').value.trim();

  let valid = true;

  if (!nombre) {
    showFieldError($('#cli-nombre'), 'El nombre es obligatorio');
    valid = false;
  }

  if (!telefono) {
    showFieldError($('#cli-telefono'), 'El telefono es obligatorio');
    valid = false;
  }

  if (email && !isValidEmail(email)) {
    showFieldError($('#cli-email'), 'Email no valido');
    valid = false;
  }

  if (!valid) return;

  const submitBtn = $('#cli-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  const payload = { nombre, telefono, email, direccion, localidad, notas };
  const action = editingClienteId ? 'editar_cliente' : 'registrar_cliente';

  if (editingClienteId) {
    payload.cliente_id = editingClienteId;
  }

  try {
    await sendToWebhook(action, payload);
    toast(editingClienteId ? 'Cliente actualizado' : 'Cliente registrado', 'success');
    closeClienteEdit();
    await fetchClientes();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingClienteId ? 'Guardar Cambios' : 'Guardar Cliente';
  }
}
// ========================================
// PROYECTOS — Etapa 1 (alta liviana)
// ========================================

function estadoProyectoLabel(e) {
  const map = { en_ventas: 'En ventas', 'diseño': 'Diseño', 'producción': 'Producción', 'colocación': 'Colocación', finalizado: 'Finalizado', cancelado: 'Cancelado' };
  return map[(e || '').trim()] || (e || 'En ventas');
}

function getEstadoClass(estado) {
  switch ((estado || '').trim()) {
    case 'en_ventas': return 'badge-yellow';
    case 'diseño': return 'badge-blue';
    case 'producción': return 'badge-blue';
    case 'colocación': return 'badge-green';
    case 'finalizado': return 'badge-muted';
    case 'cancelado': return 'badge-muted';
    default: return 'badge-yellow';
  }
}

async function fetchPedidos() {
  const loading = $('#ped-loading');
  const lista = $('#ped-lista');
  if (loading) loading.classList.remove('hidden');
  if (lista) lista.innerHTML = '';
  try {
    const data = await sendToWebhook('listar_pedidos', {});
    const safe = data || {};
    pedidosData = Array.isArray(safe) ? safe : (safe.proyectos || safe.pedidos || safe.items || safe.data || []);
    pedidosFetched = true;
    renderPedidosFiltered();
  } catch (err) {
    toast('Error al cargar proyectos: ' + err.message, 'error');
    if (lista) lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#10060;</div><p>Error al cargar proyectos</p></div>';
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function renderPedidosFiltered() {
  const filtered = currentEstadoFilter
    ? pedidosData.filter(p => (p.estado || 'en_ventas').trim() === currentEstadoFilter)
    : pedidosData;
  renderProyectosList(filtered);
}

function renderProyectosList(proyectos) {
  const lista = $('#ped-lista');
  if (!proyectos || proyectos.length === 0) {
    const msg = currentEstadoFilter
      ? 'No hay proyectos con estado "' + escapeHtml(estadoProyectoLabel(currentEstadoFilter)) + '"'
      : 'No hay proyectos registrados';
    lista.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128203;</div><p>${msg}</p></div>`;
    return;
  }

  let html = '';
  proyectos.forEach(p => {
    const nombre = (p.cliente_nombre || [p.nombre, p.apellidos].filter(Boolean).join(' ')) || '-';
    const estado = (p.estado || 'en_ventas').trim();
    const linea1 = [];
    if (p.telefono) linea1.push('\u{1F4DE} ' + p.telefono);
    if (p.direccion_colocacion) linea1.push('\u{1F4CD} ' + p.direccion_colocacion);

    html += `<div class="ped-card" data-proyecto-id="${escapeHtml(p.proyecto_id || '')}">
      <div class="ped-card-header" onclick="togglePedidoExpand(this)">
        <span class="badge ${getEstadoClass(estado)}">${escapeHtml(estadoProyectoLabel(estado))}</span>
        <span class="ped-card-cliente">&#128100; ${escapeHtml(nombre)}</span>
        <span class="ped-card-expand-hint">&#9660;</span>
      </div>
      <div class="ped-card-body">
        ${linea1.length ? `<div class="ped-card-fecha">${escapeHtml(linea1.join('   ·   '))}</div>` : ''}
        ${p.espacios ? `<div class="ped-card-fecha">\u{1F3E0} ${escapeHtml(p.espacios)}</div>` : ''}
        ${p.email ? `<div class="ped-card-fecha">✉️ ${escapeHtml(p.email)}</div>` : ''}
        ${p.clasificacion_cliente ? `<div class="ped-card-fecha">Cliente: ${escapeHtml(p.clasificacion_cliente)}</div>` : ''}
        ${p.como_nos_conocio ? `<div class="ped-card-fecha">Origen: ${escapeHtml(p.como_nos_conocio)}</div>` : ''}
        ${p.fecha_tentativa ? `<div class="ped-card-fecha">&#128197; Tentativa: ${escapeHtml(formatFecha(p.fecha_tentativa))}</div>` : ''}
        ${p.que_te_dijo ? `<div class="ped-card-notas-preview">"${escapeHtml(p.que_te_dijo)}"</div>` : ''}
        ${p.notas ? `<div class="ped-card-notas-preview">${escapeHtml(p.notas)}</div>` : ''}
        ${p.vendedor ? `<div class="ped-card-fecha">Vendedor: ${escapeHtml(p.vendedor)}</div>` : ''}
      </div>
      <div class="ped-card-footer">
        <div class="ped-card-importes">
          ${p.proyecto_id ? `<span class="ped-card-total">${escapeHtml(p.proyecto_id)}</span>` : ''}
          ${p.fecha_alta ? `<span class="ped-card-saldo">Alta: ${escapeHtml(formatFecha(p.fecha_alta))}</span>` : ''}
        </div>
        ${p.proyecto_id ? `<button class="btn btn-sm btn-primary ped-card-ficha" onclick="openProyectoFicha('${escapeHtml(p.proyecto_id)}')">&#128203; Abrir ficha</button>` : ''}
      </div>
    </div>`;
  });

  lista.innerHTML = html;
}

function togglePedidoExpand(headerEl) {
  headerEl.closest('.ped-card').classList.toggle('expanded');
}

// ---- Form Nuevo Proyecto (Etapa 1) ----

function openPedidoEdit() {
  // Solo se asignan proyectos a clientes registrados.
  if (!clientesData || clientesData.length === 0) {
    toast('Registrá al menos un cliente primero (pestaña Clientes)', 'info');
    return;
  }

  $('#ped-list-view').classList.add('hidden');
  $('#ped-edit-view').classList.remove('hidden');

  const form = $('#form-pedido');
  clearErrors(form);
  form.reset();

  // Poblar dropdown de clientes registrados
  const sel = $('#pry-cliente');
  sel.innerHTML = '<option value="">Seleccionar cliente registrado...</option>';
  clientesData.forEach(c => {
    const id = c.cliente_id || '';
    const nombre = c.nombre || '';
    if (!id) return;
    const label = nombre ? `${id} - ${nombre}` : id;
    sel.innerHTML += `<option value="${escapeHtml(id)}" data-nombre="${escapeHtml(nombre)}">${escapeHtml(label)}</option>`;
  });

  // Fecha tentativa: no permitir pasadas
  const f = $('#pry-fecha-tentativa');
  if (f) {
    const t = new Date();
    f.min = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  // Limpiar checkboxes de espacios
  Array.from($$('.pry-espacio')).forEach(ch => { ch.checked = false; });
}

function closePedidoEdit() {
  $('#ped-edit-view').classList.add('hidden');
  $('#ped-list-view').classList.remove('hidden');
}

async function handlePedidoSubmit(e) {
  e.preventDefault();
  const form = $('#form-pedido');
  clearErrors(form);

  const clienteId = $('#pry-cliente').value;
  const clienteSel = clientesData.find(c => c.cliente_id === clienteId);
  const clienteNombre = clienteSel ? (clienteSel.nombre || '') : '';
  const direccion = $('#pry-direccion').value.trim();
  const clasificacion = $('#pry-clasificacion').value;
  const como = $('#pry-como').value;
  const espacios = Array.from($$('.pry-espacio')).filter(c => c.checked).map(c => c.value);
  const queTeDijo = $('#pry-quetedijo').value.trim();
  const fechaTent = $('#pry-fecha-tentativa').value;
  const notas = $('#pry-notas').value.trim();
  const vendedor = $('#pry-vendedor').value.trim();

  let valid = true;
  if (!clienteId) { showFieldError($('#pry-cliente'), 'Seleccioná un cliente registrado'); valid = false; }
  if (!direccion) { showFieldError($('#pry-direccion'), 'Requerido'); valid = false; }
  if (espacios.length === 0) { toast('Seleccioná al menos un espacio a hacer', 'error'); valid = false; }
  if (!vendedor) { showFieldError($('#pry-vendedor'), 'Requerido'); valid = false; }

  // Fecha tentativa no pasada (si se cargó)
  if (fechaTent) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const parts = fechaTent.split('-');
    const sel = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (sel < today) { showFieldError($('#pry-fecha-tentativa'), 'No puede ser una fecha pasada'); valid = false; }
  }

  if (!valid) return;

  const submitBtn = $('#ped-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  try {
    const resp = await sendToWebhook('registrar_pedido', {
      cliente_id: clienteId,
      cliente_nombre: clienteNombre,
      direccion_colocacion: direccion,
      clasificacion_cliente: clasificacion,
      como_nos_conocio: como,
      espacios,
      que_te_dijo: queTeDijo,
      fecha_tentativa: fechaTent,
      notas, vendedor,
    });
    // Detectar éxito real: el backend devuelve { ok:true, proyecto_id }.
    // Respuesta vacía / ok:false = error silencioso → NO mostrar falso OK.
    if (!resp || resp.ok === false || !resp.proyecto_id) {
      toast((resp && resp.error) || 'El servidor no confirmó el proyecto. Revisá los datos e intentá de nuevo.', 'error');
      return;
    }
    toast('Proyecto creado' + (resp.proyecto_id ? ' ' + resp.proyecto_id : ''), 'success');
    closePedidoEdit();
    // Pequeña espera: la fila recién agregada tarda en propagarse en Sheets.
    // Evita el "parpadeo vacío" del listado justo después de crear.
    await new Promise(r => setTimeout(r, 1500));
    await fetchPedidos();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear Proyecto';
  }
}

// ========================================
// FICHA DEL PROYECTO — Etapas 2 a 5 (carga progresiva)
// ========================================
//
// Toda la info extendida del proyecto (Etapas 2-5) se guarda como UN bloque
// JSON. Hoy se persiste en localStorage (frontend-first) y se INTENTA mandar
// al webhook con la acción `guardar_proyecto_detalle`. Cuando el backend
// (n8n + columna `detalle` en la hoja Proyectos) esté activo, el mismo JSON
// queda guardado de punta a punta sin tocar el frontend.
// Ver docs/backend-ficha-proyecto.md para el cambio exacto de n8n + Sheets.

let currentFichaProyecto = null;   // objeto del proyecto abierto
let currentFichaDetalle = {};      // bloque JSON de Etapas 2-5

// ---- Schema de las etapas (config-driven: agregar campos = editar acá) ----
const FICHA_ETAPAS = [
  {
    key: 'etapa2',
    num: 2,
    titulo: 'Visita / Relevamiento técnico',
    desc: 'Se carga cuando el vendedor o el medidor va al lugar a relevar. El proyecto no puede pasar a Diseño sin esta etapa completa.',
    campos: [
      { key: 'fecha_visita', label: 'Fecha de visita', tipo: 'date', requerido: true, hint: 'Cuándo se fue a medir' },
      { key: 'quien_midio', label: 'Quién fue a medir', tipo: 'text', requerido: true, placeholder: 'Nombre de quien relevó' },
      { key: 'medidas_espacio', label: 'Medidas del espacio', tipo: 'textarea', requerido: true, placeholder: 'Ancho × alto × profundidad, paredes relevantes' },
      { key: 'tiene_ascensor', label: '¿Tiene ascensor?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'], hint: 'Crítico para logística de entrega' },
      { key: 'medidas_acceso', label: 'Medidas de acceso', tipo: 'text', requerido: true, placeholder: 'Puerta principal, pasillos, escaleras' },
      { key: 'hay_mochetas', label: '¿Hay mochetas?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'] },
      { key: 'falsas_escuadras', label: '¿Falsas escuadras?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'], hint: 'Paredes no a 90° — afecta cortes' },
      { key: 'tipo_piso', label: 'Tipo de piso', tipo: 'select', opciones: ['Cerámico', 'Madera', 'Flotante', 'Cemento alisado', 'Otro'], hint: 'Afecta zócalos y nivelación' },
      { key: 'instalaciones', label: 'Instalaciones existentes', tipo: 'multiselect', requerido: true, opciones: ['Gas', '220V', '380V', 'Agua', 'Desagüe', 'Campana extracción'] },
      { key: 'estado_lugar', label: 'Estado general del lugar', tipo: 'select', requerido: true, opciones: ['Listo para colocar', 'En obra', 'Por terminar'] },
      { key: 'fotos', label: 'Fotos del lugar', tipo: 'archivolist', requerido: true, min: 3, hint: 'Mínimo 3: frente, lateral y accesos. Subí las fotos o pegá links.' },
      { key: 'plano', label: 'Plano del lugar', tipo: 'archivo', placeholder: 'Subí el PDF/imagen del plano o pegá un link (opcional)' },
      { key: 'notas_relevamiento', label: 'Notas del relevamiento', tipo: 'textarea', placeholder: 'Humedad, columnas, ausencias del cliente, etc.' },
    ],
  },
  // Etapa 3A — Diseño a nivel proyecto (general)
  {
    key: 'etapa3a', num: '3A', titulo: 'Diseño general',
    desc: 'Diseño a nivel proyecto. El proyecto pasa a Producción cuando esta etapa está completa y se aprobó el diseño.',
    campos: [
      { key: 'descripcion_diseno', label: 'Descripción del diseño', tipo: 'textarea', requerido: true, placeholder: 'Estilo, colores generales, idea. Ej: "Cocina en L blanca con isla, alacenas hasta el techo, mesada de cuarzo negro"' },
      { key: 'link_render', label: 'Link al render', tipo: 'url', requerido: true, placeholder: 'Link de Drive / Dropbox', hint: 'V2 será upload directo' },
      { key: 'link_planos', label: 'Link a planos técnicos', tipo: 'url', placeholder: 'Planos del arquitecto o del diseñador interno (opcional)' },
      { key: 'boceto_aprobado', label: 'Boceto aprobado por el cliente', tipo: 'archivo', requerido: true, hint: 'El documento que el cliente firma — referencia anti "yo no pedí eso". Subí el archivo o pegá un link.' },
      { key: 'fecha_aprobacion', label: 'Fecha de aprobación del diseño', tipo: 'date', requerido: true, hint: 'Dispara el pase a Producción' },
    ],
  },
  // Etapa 3B — Diseño por cada mueble (REPETIBLE N veces)
  {
    key: 'etapa3b', num: '3B', titulo: 'Diseño por mueble',
    desc: 'Una ficha por cada mueble del proyecto. Agregá tantos muebles como tenga la obra.',
    repeater: true,
    itemLabel: 'Mueble',
    itemCampos: [
      { key: 'espacio', label: 'Espacio', tipo: 'select', requerido: true, opciones: ['Cocina', 'Dormitorio', 'Living', 'Vestidor', 'Baño', 'Otro'] },
      { key: 'tipo_mueble', label: 'Tipo de mueble', tipo: 'text', requerido: true, placeholder: 'Ej: Bajo mesada, Alacena, Placard, Vanitory...' },
      { key: 'modulos', label: 'Cantidad de módulos', tipo: 'number', requerido: true, min: 1, hint: 'Ej: una alacena de 3 m son ~4 módulos' },
      { key: 'nombre_custom', label: 'Nombre custom', tipo: 'text', placeholder: 'Opcional (ej: "Bajo mesada izquierdo")' },
      { key: 'medidas', label: 'Medidas (cm)', tipo: 'dim3', requerido: true },
      { key: 'color', label: 'Color', tipo: 'datalist', opcionesRef: 'colores', requerido: true, placeholder: 'Buscá el color del catálogo...' },
      { key: 'nivel', label: 'Nivel', tipo: 'select', requerido: true, opciones: ['2', '3', '4', '5'], hint: 'Lo elige Ventas (afecta precio)' },
      { key: 'lleva_puerta', label: '¿Lleva puerta(s)?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'] },
      { key: 'cant_puertas', label: 'Cantidad de puertas / hojas', tipo: 'number', requerido: true, min: 1, dependeDe: { campo: 'lleva_puerta', valor: 'Sí' } },
      { key: 'material_puerta', label: 'Material de la puerta', tipo: 'select', requerido: true, opciones: ['Melamina', 'Vidrio', 'Laqueada', 'Madera maciza'], dependeDe: { campo: 'lleva_puerta', valor: 'Sí' } },
      { key: 'tipo_apertura', label: 'Tipo de apertura', tipo: 'select', requerido: true, opciones: ['Batiente', 'Corrediza', 'Rebatible', 'Plegable', 'Push-to-open'], dependeDe: { campo: 'lleva_puerta', valor: 'Sí' } },
      { key: 'cant_cajones', label: 'Cantidad de cajones', tipo: 'number', min: 0 },
      { key: 'tipo_zocalo', label: 'Tipo de zócalo', tipo: 'select', requerido: true, opciones: ['Plástico', 'Aluminio', 'Melamina', 'Retranqueado', 'Sin zócalo'] },
      { key: 'tipo_filo', label: 'Tipo de filo (tapacanto)', tipo: 'select', requerido: true, opciones: ['0,45 mm', '2 mm'] },
      { key: 'laqueado', label: '¿Laqueado?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'] },
      { key: 'detalle_laqueado', label: 'Detalle laqueado', tipo: 'text', requerido: true, placeholder: 'Color, mate/brillante, partes laqueadas', dependeDe: { campo: 'laqueado', valor: 'Sí' } },
      { key: 'lleva_led', label: '¿Lleva LED?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'] },
      { key: 'tipo_led', label: 'Tipo de LED', tipo: 'select', requerido: true, opciones: ['Tira', 'Spot', 'Barra rígida', 'Panel', 'Con sensor de movimiento'], dependeDe: { campo: 'lleva_led', valor: 'Sí' } },
      { key: 'desc_led', label: 'Cómo va el LED', tipo: 'textarea', requerido: true, placeholder: 'Dónde va, color (cálido/frío), si es regulable', dependeDe: { campo: 'lleva_led', valor: 'Sí' } },
      { key: 'tipo_herraje', label: 'Tipo de herraje', tipo: 'select', requerido: true, opciones: ['Cierre suave', 'Cierre común', 'Push', 'Bisagras ocultas'] },
      { key: 'caracteristicas', label: 'Características adicionales', tipo: 'textarea', placeholder: 'Divisiones internas, vidrios, especiales' },
      { key: 'boceto', label: 'Boceto del mueble', tipo: 'archivo', requerido: true, placeholder: 'Subí la imagen del boceto o pegá un link' },
      { key: 'croquis', label: 'Croquis técnico', tipo: 'archivo', requerido: true, placeholder: 'Subí el croquis con medidas o pegá un link' },
    ],
  },
  // Etapa 4 — Cierre comercial (4A plata + 4B fechas + 4C documentación)
  {
    key: 'etapa4', num: 4, titulo: 'Cierre comercial',
    desc: 'Se carga cuando el cliente acepta el presupuesto y deja la seña. El proyecto deja de ser una posibilidad y pasa a ser un compromiso con fechas.',
    campos: [
      { tipo: 'seccion', key: '_sec_4a', label: '4A · Plata' },
      { key: 'moneda', label: 'Moneda', tipo: 'radio', requerido: true, opciones: ['ARS', 'USD'] },
      { key: 'monto_total', label: 'Monto total', tipo: 'number', requerido: true, min: 0, step: 'any', hint: 'Precio final acordado' },
      { key: 'descuento', label: 'Descuento aplicado', tipo: 'number', min: 0, step: 'any', hint: 'Monto o % (aclaralo en notas)' },
      { key: 'forma_facturacion', label: 'Forma de facturación', tipo: 'select', requerido: true, opciones: ['Factura A', 'Factura B', 'Factura C', 'Sin factura'] },
      { key: 'sena', label: 'Seña / anticipo recibido', tipo: 'number', requerido: true, min: 0, step: 'any', hint: 'Monto recibido para cerrar' },
      { key: 'fecha_sena', label: 'Fecha de la seña', tipo: 'date', requerido: true, hint: 'Cuándo entró la plata' },
      { key: 'forma_pago_sena', label: 'Forma de pago de la seña', tipo: 'select', requerido: true, opciones: ['Efectivo', 'Transferencia', 'MercadoPago', 'Cheque', 'Tarjeta'] },
      {
        key: 'saldo_restante', label: 'Saldo restante', tipo: 'calculado', hint: 'Monto total − seña (se calcula solo)',
        compute: (d) => { const v = (Number(d.monto_total) || 0) - (Number(d.sena) || 0); return { value: v, display: (d.moneda ? d.moneda + ' ' : '') + formatArgentineNumber(v) }; },
      },
      { key: 'forma_pago_saldo', label: 'Forma de pago del saldo', tipo: 'select', requerido: true, opciones: ['Contraentrega', 'Antes del armado', 'En cuotas', 'Mitad y mitad', 'Otro'] },
      { key: 'detalle_cuotas', label: 'Detalle (en cuotas)', tipo: 'textarea', requerido: true, placeholder: 'Cantidad de cuotas, montos, fechas', dependeDe: { campo: 'forma_pago_saldo', valor: 'En cuotas' } },
      { key: 'detalle_otro_pago', label: 'Detalle (otro)', tipo: 'text', requerido: true, placeholder: 'Describí la forma de pago', dependeDe: { campo: 'forma_pago_saldo', valor: 'Otro' } },

      { tipo: 'seccion', key: '_sec_4b', label: '4B · Fechas comprometidas' },
      { key: 'fecha_cierre', label: 'Fecha de cierre de venta', tipo: 'date', requerido: true, hint: 'El día que se firmó' },
      {
        key: 'limite_cambios', label: 'Límite de cambios sin cargo', tipo: 'calculado', hint: 'Cierre + 14 días (automático)',
        compute: (d) => {
          if (!d.fecha_cierre) return { value: '', display: '—' };
          const dt = new Date(d.fecha_cierre + 'T00:00:00');
          dt.setDate(dt.getDate() + 14);
          const iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
          return { value: iso, display: formatFecha(iso) };
        },
      },
      { key: 'fecha_entrega_prometida', label: 'Fecha de entrega prometida', tipo: 'date', requerido: true, hint: 'La fecha clave para detectar atrasos' },
      { key: 'fecha_colocacion_tentativa', label: 'Fecha de colocación tentativa', tipo: 'date', hint: 'Estimada, ajustable (para agenda de colocadores)' },

      { tipo: 'seccion', key: '_sec_4c', label: '4C · Documentación y cláusulas' },
      { key: 'contrato_firmado', label: 'Contrato / presupuesto firmado', tipo: 'archivo', requerido: true, placeholder: 'Subí el PDF firmado o pegá un link' },
      { key: 'comprobante_sena', label: 'Comprobante de seña', tipo: 'archivo', requerido: true, placeholder: 'Subí el recibo/captura o pegá un link' },
      { key: 'clausulas', label: 'Cláusulas / condiciones especiales', tipo: 'textarea', placeholder: 'Ej: cliente provee mesada, incluye colocación, garantía 1 año en herrajes' },
      { key: 'notas_cierre', label: 'Notas del cierre', tipo: 'textarea', placeholder: 'Regateos, promesas, alertas — todo lo que conviene dejar por escrito' },
    ],
  },
  // Etapa 5A — Producción (por cada mueble; espejo de los muebles de 3B)
  {
    key: 'etapa5a', num: '5A', titulo: 'Producción (por mueble)',
    desc: 'Seguimiento de producción de cada mueble cargado en la Etapa 3B.',
    mirrorOf: 'etapa3b',
    itemCampos: [
      { key: 'estado_mueble', label: 'Estado del mueble', tipo: 'select', requerido: true, opciones: ['Pendiente', 'En producción', 'Producido', 'En colocación', 'Colocado', 'Trabado'] },
      { key: 'fecha_inicio_prod', label: 'Inicio de producción', tipo: 'date', hint: 'Cuándo empezó a armarse' },
      { key: 'fecha_fin_prod', label: 'Fin de producción', tipo: 'date', hint: 'Cuándo quedó producido' },
      { key: 'operario', label: 'Operario asignado', tipo: 'text', placeholder: 'Quién lo arma' },
      { key: 'notas_produccion', label: 'Notas de producción', tipo: 'textarea', placeholder: 'Cambios de color por stock, refuerzos, ajustes durante el armado' },
      { key: 'fotos_terminado', label: 'Fotos del mueble terminado', tipo: 'archivolist', hint: 'Para mostrar al cliente antes de colocar. Subí las fotos o pegá links.' },
      { key: 'traba_motivo', label: 'Si está trabado: motivo', tipo: 'textarea', requerido: true, placeholder: 'Qué falta para destrabarlo', dependeDe: { campo: 'estado_mueble', valor: 'Trabado' } },
      { key: 'traba_necesita', label: 'Si está trabado: qué se necesita', tipo: 'text', requerido: true, placeholder: 'Acción concreta para resolver', dependeDe: { campo: 'estado_mueble', valor: 'Trabado' } },
      { key: 'traba_responsable', label: 'Si está trabado: responsable de destrabar', tipo: 'text', requerido: true, placeholder: 'Quién tiene que hacer algo', dependeDe: { campo: 'estado_mueble', valor: 'Trabado' } },
    ],
  },
  // Etapa 5B — Colocación (a nivel proyecto)
  {
    key: 'etapa5b', num: '5B', titulo: 'Colocación',
    desc: 'Datos de la colocación a nivel proyecto.',
    campos: [
      { key: 'fecha_colocacion_agendada', label: 'Fecha de colocación agendada', tipo: 'date', requerido: true },
      { key: 'horario', label: 'Horario', tipo: 'time', hint: 'Hora estimada de llegada' },
      { key: 'colocador', label: 'Colocador responsable', tipo: 'text', requerido: true, placeholder: 'Quién va al cliente' },
      { key: 'ayudantes', label: 'Ayudantes', tipo: 'text', placeholder: 'Nombres separados por coma (si va más de uno)' },
      { key: 'vehiculo', label: 'Vehículo / transporte', tipo: 'select', requerido: true, opciones: ['Camioneta propia', 'Flete contratado', 'Cliente retira'] },
      { key: 'entrega_modo', label: '¿Entrega completa o por partes?', tipo: 'radio', requerido: true, opciones: ['Completa', 'Por partes'] },
      { key: 'notas_colocador', label: 'Notas para el colocador', tipo: 'textarea', placeholder: 'Mochetas, ascensor chico, mascotas, accesos especiales' },
    ],
  },
  // Etapa 5C — Post-colocación (cierre del proyecto)
  {
    key: 'etapa5c', num: '5C', titulo: 'Post-colocación',
    desc: 'Cierre del proyecto. Si el saldo final está cobrado, el proyecto puede pasar a finalizado.',
    campos: [
      { key: 'fecha_real_colocacion', label: 'Fecha real de colocación', tipo: 'date', requerido: true, hint: 'Cuándo se colocó de verdad' },
      {
        key: 'atraso_real', label: 'Atraso real', tipo: 'calculado', hint: 'Fecha real − fecha de entrega prometida (Etapa 4)',
        compute: (d) => {
          const prometida = (currentFichaDetalle.etapa4 || {}).fecha_entrega_prometida;
          if (!d.fecha_real_colocacion || !prometida) return { value: '', display: '—' };
          const real = new Date(d.fecha_real_colocacion + 'T00:00:00');
          const prom = new Date(prometida + 'T00:00:00');
          const dias = Math.round((real - prom) / 86400000);
          const txt = dias > 0 ? `${dias} día(s) tarde` : (dias < 0 ? `${-dias} día(s) antes` : 'En fecha');
          return { value: dias, display: txt };
        },
      },
      { key: 'cliente_conforme', label: '¿Cliente conforme?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No', 'Parcial'] },
      { key: 'observaciones_cliente', label: 'Observaciones del cliente', tipo: 'textarea', requerido: true, placeholder: 'Qué reclamó, qué falta corregir', dependeDe: { campo: 'cliente_conforme', valor: ['No', 'Parcial'] } },
      { key: 'pendientes_postcoloc', label: 'Pendientes post-colocación', tipo: 'textarea', placeholder: 'Ej: tapa de cajón faltante, regular bisagras' },
      { key: 'foto_colocado', label: 'Foto del mueble colocado', tipo: 'archivolist', requerido: true, min: 1, hint: 'Portfolio + comprobante de entrega. Subí las fotos o pegá links.' },
      { key: 'conformidad_firmada', label: 'Conformidad firmada por cliente', tipo: 'archivo', requerido: true, placeholder: 'Subí el documento de cierre o pegá un link' },
      { key: 'saldo_cobrado', label: '¿Saldo final cobrado?', tipo: 'radio', requerido: true, opciones: ['Sí', 'No'] },
      { key: 'fecha_cobro_saldo', label: 'Fecha cobro saldo', tipo: 'date', requerido: true, dependeDe: { campo: 'saldo_cobrado', valor: 'Sí' } },
      { key: 'forma_cobro_saldo', label: 'Forma de cobro del saldo', tipo: 'select', requerido: true, opciones: ['Efectivo', 'Transferencia', 'Cheque', 'MercadoPago', 'Tarjeta'], dependeDe: { campo: 'saldo_cobrado', valor: 'Sí' } },
    ],
  },
];

// ---- Persistencia local (cache frontend-first) ----
function detalleKey(id) { return 'fontana_detalle_' + id; }

function loadDetalle(proyecto) {
  let d = {};
  // 1) lo que venga del backend (cuando esté activo)
  if (proyecto && proyecto.detalle) {
    try { d = typeof proyecto.detalle === 'string' ? JSON.parse(proyecto.detalle) : proyecto.detalle; }
    catch (_) { d = {}; }
  }
  // 2) overlay del cache local (ediciones más recientes de esta máquina)
  try {
    const ls = localStorage.getItem(detalleKey(proyecto && proyecto.proyecto_id));
    if (ls) { const lo = JSON.parse(ls); d = Object.assign({}, d, lo); }
  } catch (_) { /* cache corrupto: lo ignoramos */ }
  return d || {};
}

// ========================================
// FICHA — abrir / cerrar
// ========================================

function openProyectoFicha(proyectoId) {
  const proyecto = pedidosData.find(p => (p.proyecto_id || '') === proyectoId);
  if (!proyecto) { toast('Proyecto no encontrado', 'error'); return; }

  currentFichaProyecto = proyecto;
  currentFichaDetalle = loadDetalle(proyecto);

  $('#ped-list-view').classList.add('hidden');
  $('#ped-edit-view').classList.add('hidden');
  $('#ped-detail-view').classList.remove('hidden');

  const nombre = (proyecto.cliente_nombre || [proyecto.nombre, proyecto.apellidos].filter(Boolean).join(' ')) || 'Proyecto';
  $('#ped-detail-title').textContent = nombre;

  renderFichaMeta(proyecto);
  renderFichaEtapas();
  window.scrollTo(0, 0);
}

function closeProyectoFicha() {
  $('#ped-detail-view').classList.add('hidden');
  $('#ped-list-view').classList.remove('hidden');
  currentFichaProyecto = null;
  currentFichaDetalle = {};
}

// ---- Cabecera de la ficha (datos clave del proyecto) ----
function renderFichaMeta(p) {
  const estado = (p.estado || 'en_ventas').trim();
  const chips = [];
  if (p.proyecto_id) chips.push(`<span class="ficha-meta-chip">${escapeHtml(p.proyecto_id)}</span>`);
  if (p.telefono) chips.push(`<span class="ficha-meta-chip">\u{1F4DE} ${escapeHtml(p.telefono)}</span>`);
  if (p.direccion_colocacion) chips.push(`<span class="ficha-meta-chip">\u{1F4CD} ${escapeHtml(p.direccion_colocacion)}</span>`);
  if (p.espacios) chips.push(`<span class="ficha-meta-chip">\u{1F3E0} ${escapeHtml(p.espacios)}</span>`);
  if (p.vendedor) chips.push(`<span class="ficha-meta-chip">Vendedor: ${escapeHtml(p.vendedor)}</span>`);

  $('#ped-detail-meta').innerHTML = `
    <div class="ficha-meta-top">
      <span class="badge ${getEstadoClass(estado)}">${escapeHtml(estadoProyectoLabel(estado))}</span>
      ${p.fecha_alta ? `<span class="ficha-meta-alta">Alta: ${escapeHtml(formatFecha(p.fecha_alta))}</span>` : ''}
    </div>
    <div class="ficha-meta-chips">${chips.join('')}</div>`;
}

// ========================================
// FICHA — render de etapas (acordeón)
// ========================================

function renderFichaEtapas() {
  const cont = $('#ped-etapas');
  let html = '';

  // Etapa 1 — resumen del alta (solo lectura)
  html += renderEtapa1Resumen(currentFichaProyecto);

  // Etapas 2-5
  FICHA_ETAPAS.forEach(etapa => {
    if (etapa.proximamente) {
      html += `
        <section class="ficha-etapa ficha-etapa-soon">
          <div class="ficha-etapa-head">
            <span class="ficha-etapa-num">${etapa.num}</span>
            <span class="ficha-etapa-titulo">${escapeHtml(etapa.titulo)}</span>
            <span class="ficha-etapa-status badge badge-muted">Próximamente</span>
          </div>
        </section>`;
      return;
    }
    const data = currentFichaDetalle[etapa.key];
    const prog = etapaProgreso(etapa, data);
    const statusBadge = `<span class="${etapaStatusClass(prog)}">${etapaStatusText(prog)}</span>`;

    const bodyHtml = etapa.mirrorOf
      ? renderEtapaMirror(etapa, Array.isArray(currentFichaDetalle[etapa.mirrorOf]) ? currentFichaDetalle[etapa.mirrorOf] : [], Array.isArray(data) ? data : [])
      : etapa.repeater
      ? renderEtapaRepeater(etapa, Array.isArray(data) ? data : [])
      : `<form class="ficha-form" data-etapa-form="${etapa.key}" onsubmit="return false;">
            ${etapa.campos.map(c => renderCampo(c, (data || {})[c.key], etapa.key)).join('')}
            <div class="ficha-form-actions">
              <button type="button" class="btn btn-primary" onclick="guardarEtapa('${etapa.key}')">Guardar etapa ${etapa.num}</button>
            </div>
          </form>`;

    html += `
      <section class="ficha-etapa" data-etapa="${etapa.key}">
        <button type="button" class="ficha-etapa-head" onclick="toggleEtapa('${etapa.key}')">
          <span class="ficha-etapa-num">${etapa.num}</span>
          <span class="ficha-etapa-titulo">${escapeHtml(etapa.titulo)}</span>
          ${statusBadge}
          <span class="ficha-etapa-chevron">&#9660;</span>
        </button>
        <div class="ficha-etapa-body">
          ${etapa.desc ? `<p class="ficha-etapa-desc">${escapeHtml(etapa.desc)}</p>` : ''}
          ${bodyHtml}
        </div>
      </section>`;
  });

  cont.innerHTML = html;

  // Re-bind componentes interactivos y abrir la primera etapa editable
  bindLinklists(cont);
  bindArchivos(cont);
  bindConditionals(cont);
  bindCalculados(cont);
  const firstEditable = cont.querySelector('.ficha-etapa[data-etapa]');
  if (firstEditable) firstEditable.classList.add('open');
}

// Badge de estado de una etapa (plana o repeater)
function etapaStatusClass(prog) {
  const base = 'ficha-etapa-status badge ';
  if (prog.repeater) return base + (prog.count === 0 ? 'badge-muted' : (prog.completa ? 'badge-green' : 'badge-yellow'));
  if (prog.total === 0) return base + 'badge-muted';
  return base + (prog.completa ? 'badge-green' : 'badge-yellow');
}
function etapaStatusText(prog) {
  if (prog.repeater) {
    if (prog.count === 0) return 'Sin muebles';
    if (prog.completa) return `${prog.count} mueble${prog.count > 1 ? 's' : ''}`;
    return `${prog.completos}/${prog.count} listos`;
  }
  if (prog.total === 0) return '—';
  return prog.completa ? 'Completa' : `${prog.filled}/${prog.total}`;
}

function renderEtapa1Resumen(p) {
  const filas = [
    ['Clasificación', p.clasificacion_cliente],
    ['Cómo nos conoció', p.como_nos_conocio],
    ['Espacios a hacer', p.espacios],
    ['Qué te dijo', p.que_te_dijo],
    ['Fecha tentativa', p.fecha_tentativa ? formatFecha(p.fecha_tentativa) : ''],
    ['Email', p.email],
    ['Notas', p.notas],
  ].filter(([, v]) => v);

  const body = filas.length
    ? filas.map(([k, v]) => `<div class="ficha-ro-row"><span class="ficha-ro-k">${escapeHtml(k)}</span><span class="ficha-ro-v">${escapeHtml(v)}</span></div>`).join('')
    : '<p class="ficha-etapa-desc">Sin datos adicionales cargados en el alta.</p>';

  return `
    <section class="ficha-etapa ficha-etapa-ro open">
      <button type="button" class="ficha-etapa-head" onclick="toggleEtapaEl(this)">
        <span class="ficha-etapa-num">1</span>
        <span class="ficha-etapa-titulo">Alta del proyecto</span>
        <span class="ficha-etapa-status badge badge-muted">Resumen</span>
        <span class="ficha-etapa-chevron">&#9660;</span>
      </button>
      <div class="ficha-etapa-body">${body}</div>
    </section>`;
}

function toggleEtapa(etapaKey) {
  const el = $(`.ficha-etapa[data-etapa="${etapaKey}"]`);
  if (el) el.classList.toggle('open');
}
function toggleEtapaEl(headEl) {
  headEl.closest('.ficha-etapa').classList.toggle('open');
}

// ========================================
// FICHA — render de un campo según su tipo
// ========================================

// renderCampo(campo, valor, ns): `ns` (namespace) hace únicos los id/name de
// inputs. En etapas planas ns = etapa.key; en muebles ns = "etapa3b-m{idx}",
// así los radios de un mueble no chocan con los de otro.
function renderCampo(campo, valor, ns) {
  // Sub-título de sección (4A/4B/4C). No es un campo de datos.
  if (campo.tipo === 'seccion') return `<h4 class="ficha-seccion">${escapeHtml(campo.label)}</h4>`;

  const id = `f-${ns}-${campo.key}`;
  const req = campo.requerido ? ' <span class="req">*</span>' : '';
  const hint = campo.hint ? `<span class="input-hint ficha-hint">${escapeHtml(campo.hint)}</span>` : '';
  const strVal = (valor == null) ? '' : (typeof valor === 'object' ? '' : String(valor));
  let control = '';

  switch (campo.tipo) {
    case 'textarea':
      control = `<textarea id="${id}" class="input" rows="2" data-key="${campo.key}" placeholder="${escapeHtml(campo.placeholder || '')}">${escapeHtml(strVal)}</textarea>`;
      break;
    case 'select': {
      const opts = getOpciones(campo);
      control = `<div class="ficha-select-row">
          <select id="${id}" class="input" data-key="${campo.key}">${optionsHtml(opts, strVal)}</select>
          <button type="button" class="ficha-opt-toggle" title="Agregar o quitar opciones de esta lista" onclick="toggleOpcionesEditor('${campo.key}', this)">+</button>
        </div>
        <div class="ficha-opt-editor hidden" data-editor-key="${campo.key}"></div>`;
      break;
    }
    case 'radio':
      control = `<div class="ficha-radio-group" data-key="${campo.key}">
        ${campo.opciones.map(o => `<label class="pry-check"><input type="radio" name="${id}" value="${escapeHtml(o)}"${strVal === o ? ' checked' : ''} /> ${escapeHtml(o)}</label>`).join('')}
      </div>`;
      break;
    case 'multiselect': {
      const arr = Array.isArray(valor) ? valor : [];
      control = `<div class="ficha-multi-group pry-espacios-group" data-key="${campo.key}">
        ${campo.opciones.map(o => `<label class="pry-check"><input type="checkbox" value="${escapeHtml(o)}"${arr.includes(o) ? ' checked' : ''} /> ${escapeHtml(o)}</label>`).join('')}
      </div>`;
      break;
    }
    case 'linklist': {
      const arr = (Array.isArray(valor) ? valor : []).filter(Boolean);
      const rows = (arr.length ? arr : ['']).map(v => linklistRow(v)).join('');
      control = `<div class="ficha-linklist" data-key="${campo.key}">
        <div class="ficha-linklist-rows">${rows}</div>
        <button type="button" class="btn btn-sm btn-outline ficha-linklist-add">+ Agregar link</button>
      </div>`;
      break;
    }
    case 'archivo':
      // Subida real: se elige un archivo (se sube a Drive vía n8n) o se pega un link.
      control = `<div class="ficha-archivo" data-key="${campo.key}">
        ${archivoRow(strVal)}
      </div>`;
      break;
    case 'archivolist': {
      const arr = (Array.isArray(valor) ? valor : []).filter(Boolean);
      const rows = (arr.length ? arr : ['']).map(v => archivoRow(v, true)).join('');
      control = `<div class="ficha-archivolist" data-key="${campo.key}">
        <div class="ficha-archivolist-rows">${rows}</div>
        <button type="button" class="btn btn-sm btn-outline ficha-archivolist-add">+ Agregar archivo</button>
      </div>`;
      break;
    }
    case 'datalist': {
      const listId = campo.opcionesRef === 'colores' ? 'colores-list' : '';
      control = `<input type="text" id="${id}" class="input" data-key="${campo.key}" list="${listId}" value="${escapeHtml(strVal)}" placeholder="${escapeHtml(campo.placeholder || '')}" autocomplete="off" />`;
      break;
    }
    case 'number':
      control = `<input type="number" id="${id}" class="input" data-key="${campo.key}" value="${escapeHtml(strVal)}"${campo.min != null ? ` min="${campo.min}"` : ''} step="${campo.step || '1'}" placeholder="${escapeHtml(campo.placeholder || '')}" />`;
      break;
    case 'dim3': {
      const v = (valor && typeof valor === 'object') ? valor : {};
      const cell = (dim, lbl) => `<div class="ficha-dim3-cell">
        <input type="number" class="input" data-dim="${dim}" value="${escapeHtml(v[dim] != null ? String(v[dim]) : '')}" min="0" step="any" placeholder="${lbl}" />
        <span class="ficha-dim3-lbl">${lbl}</span>
      </div>`;
      control = `<div class="ficha-dim3" data-key="${campo.key}">${cell('alto', 'Alto')}${cell('largo', 'Largo')}${cell('profundo', 'Profundo')}</div>`;
      break;
    }
    case 'calculado':
      // Solo lectura: lo completa recomputeCalculados() a partir de otros campos.
      control = `<div class="input ficha-calc" data-key="${campo.key}" data-calc-value="">—</div>`;
      break;
    case 'url':
      control = `<input type="url" id="${id}" class="input" data-key="${campo.key}" value="${escapeHtml(strVal)}" placeholder="${escapeHtml(campo.placeholder || 'https://...')}" />`;
      break;
    case 'date':
      control = `<input type="date" id="${id}" class="input" data-key="${campo.key}" value="${escapeHtml(strVal)}" />`;
      break;
    default: // text, tel, email
      control = `<input type="${campo.tipo || 'text'}" id="${id}" class="input" data-key="${campo.key}" value="${escapeHtml(strVal)}" placeholder="${escapeHtml(campo.placeholder || '')}" />`;
  }

  // Campo condicional: se oculta hasta que el campo padre tenga el/los valor(es).
  // `valor` puede ser un string o un array (cualquiera de esos valores lo activa).
  const condClass = campo.dependeDe ? ' ficha-cond' : '';
  const dvRaw = Array.isArray(campo.dependeDe && campo.dependeDe.valor) ? JSON.stringify(campo.dependeDe.valor) : (campo.dependeDe ? campo.dependeDe.valor : '');
  const condAttrs = campo.dependeDe
    ? ` data-depende-campo="${escapeHtml(campo.dependeDe.campo)}" data-depende-valor="${escapeHtml(dvRaw).replace(/"/g, '&quot;')}"`
    : '';

  return `<div class="form-group ficha-fg${condClass}"${condAttrs}>
    <label for="${id}">${escapeHtml(campo.label)}${req}</label>
    ${control}
    ${hint}
  </div>`;
}

function optionsHtml(opts, cur) {
  return '<option value="">—</option>' +
    opts.map(o => `<option value="${escapeHtml(o)}"${cur === o ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
}

function linklistRow(v) {
  return `<div class="ficha-linklist-row">
    <input type="url" class="input ficha-link-input" value="${escapeHtml(v || '')}" placeholder="https://drive.google.com/..." />
    <button type="button" class="btn-icon ficha-linklist-del" title="Quitar">&#10005;</button>
  </div>`;
}

// Fila de un campo de archivo: input con el link (lo llena la subida o se pega a
// mano) + botón para elegir archivo + estado. `withDel` agrega el botón quitar
// (sólo en listas múltiples `archivolist`).
function archivoRow(v, withDel) {
  return `<div class="ficha-archivo-item">
    <div class="ficha-archivo-row">
      <input type="url" class="input ficha-archivo-link" value="${escapeHtml(v || '')}" placeholder="Subí un archivo o pegá un link" />
      <label class="btn btn-sm btn-outline ficha-archivo-btn" title="Elegir archivo">
        <span class="ficha-archivo-btn-lbl">📎 Subir</span>
        <input type="file" class="ficha-archivo-file" accept="image/*,application/pdf" hidden />
      </label>
      ${withDel ? '<button type="button" class="btn-icon ficha-archivolist-del" title="Quitar">&#10005;</button>' : ''}
    </div>
    <div class="ficha-archivo-status"></div>
  </div>`;
}

function setArchStatus(el, msg, kind) {
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'ficha-archivo-status' + (kind ? ' is-' + kind : '');
}

// Lee un File del usuario y devuelve { base64, mime, filename } listo para el
// webhook. Las imágenes se comprimen (canvas, máx 1600px, JPEG) para que el
// payload no explote; el resto (PDF, etc.) va tal cual.
function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const esImagen = /^image\//.test(file.type) && file.type !== 'image/svg+xml';
    const reader = new FileReader();
    if (!esImagen) {
      reader.onload = () => resolve({
        base64: String(reader.result).split(',')[1] || '',
        mime: file.type || 'application/octet-stream',
        filename: file.name || 'archivo',
      });
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const s = Math.min(MAX / width, MAX / height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base = (file.name || 'foto').replace(/\.[^.]+$/, '');
        resolve({ base64: dataUrl.split(',')[1] || '', mime: 'image/jpeg', filename: base + '.jpg' });
      };
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

// Sube el archivo elegido en un input file: lo manda al webhook (acción
// subir_archivo) y, si vuelve el link, lo escribe en el input de link de esa fila.
async function handleArchivoUpload(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const item = fileInput.closest('.ficha-archivo-item');
  const linkInput = item.querySelector('.ficha-archivo-link');
  const statusEl = item.querySelector('.ficha-archivo-status');
  const btnLbl = item.querySelector('.ficha-archivo-btn-lbl');
  const proyectoId = currentFichaProyecto && currentFichaProyecto.proyecto_id;
  if (!proyectoId) {
    setArchStatus(statusEl, 'Guardá/abrí la ficha de un proyecto antes de subir', 'err');
    fileInput.value = '';
    return;
  }
  setArchStatus(statusEl, 'Subiendo…', 'load');
  const orig = btnLbl ? btnLbl.textContent : '';
  if (btnLbl) btnLbl.textContent = '⏳';
  try {
    const { base64, mime, filename } = await fileToPayload(file);
    const resp = await sendToWebhook('subir_archivo', { proyecto_id: proyectoId, filename, mime, base64 });
    if (resp && resp.ok !== false && resp.link) {
      linkInput.value = resp.link;
      setArchStatus(statusEl, '✓ ' + filename, 'ok');
    } else {
      setArchStatus(statusEl, (resp && resp.error) || 'No se pudo subir. Pegá el link a mano.', 'err');
    }
  } catch (err) {
    setArchStatus(statusEl, 'Error al subir: ' + (err.message || err) + '. Pegá el link a mano.', 'err');
  } finally {
    if (btnLbl) btnLbl.textContent = orig;
    fileInput.value = '';
  }
}

// Engancha la subida de archivos (inputs file, agregar/quitar en listas).
function bindArchivos(scope) {
  scope.querySelectorAll('.ficha-archivo-file').forEach(inp => {
    if (inp.dataset.bound) return;
    inp.dataset.bound = '1';
    inp.addEventListener('change', () => handleArchivoUpload(inp));
  });
  scope.querySelectorAll('.ficha-archivolist').forEach(al => {
    if (al.dataset.bound) return;
    al.dataset.bound = '1';
    const rows = al.querySelector('.ficha-archivolist-rows');
    al.querySelector('.ficha-archivolist-add').addEventListener('click', () => {
      const tmp = document.createElement('div');
      tmp.innerHTML = archivoRow('', true);
      const row = tmp.firstElementChild;
      rows.appendChild(row);
      bindArchivos(row);
    });
    al.addEventListener('click', (e) => {
      const del = e.target.closest('.ficha-archivolist-del');
      if (!del) return;
      const allRows = rows.querySelectorAll('.ficha-archivo-item');
      if (allRows.length > 1) {
        del.closest('.ficha-archivo-item').remove();
      } else {
        const item = del.closest('.ficha-archivo-item');
        item.querySelector('.ficha-archivo-link').value = '';
        setArchStatus(item.querySelector('.ficha-archivo-status'), '');
      }
    });
  });
}

// ========================================
// FICHA — catálogos editables de los <select>
// Los empleados agregan/quitan opciones de cada lista. Por ahora se guardan en
// ESTE dispositivo (localStorage). Para que las vean todos los empleados hay que
// promoverlas al catálogo del backend (ver docs/backend-ficha-proyecto.md).
// ========================================

function catalogoKey(k) { return 'fontana_catalogo_' + k; }

function getCatalogoOverrides(k) {
  try { return JSON.parse(localStorage.getItem(catalogoKey(k))) || { add: [], hide: [] }; }
  catch (_) { return { add: [], hide: [] }; }
}
function setCatalogoOverrides(k, o) {
  try { localStorage.setItem(catalogoKey(k), JSON.stringify(o)); } catch (_) { /* sin localStorage */ }
}

// Busca un campo por su key en todas las etapas (planas, repeater y espejo).
function findCampoByKey(key) {
  for (const e of FICHA_ETAPAS) {
    const arr = e.itemCampos || e.campos || [];
    const f = arr.find(c => c.key === key);
    if (f) return f;
  }
  return { key, opciones: [] };
}

// Opciones efectivas = base del schema − ocultadas + agregadas por empleados.
function getOpciones(campo) {
  const base = campo.opciones || [];
  const o = getCatalogoOverrides(campo.key);
  const hide = new Set(o.hide || []);
  const result = base.filter(x => !hide.has(x));
  (o.add || []).forEach(x => { if (!result.includes(x)) result.push(x); });
  return result;
}

function toggleOpcionesEditor(campoKey, btn) {
  const fg = btn.closest('.form-group');
  const editor = fg ? fg.querySelector(`.ficha-opt-editor[data-editor-key="${campoKey}"]`) : null;
  if (!editor) return;
  const abrir = editor.classList.contains('hidden');
  editor.classList.toggle('hidden', !abrir);
  btn.classList.toggle('active', abrir);
  if (abrir) buildEditor(editor, campoKey);
}

function buildEditor(editor, campoKey) {
  const opts = getOpciones(findCampoByKey(campoKey));
  editor.innerHTML = `
    <div class="ficha-opt-add">
      <input type="text" class="input ficha-opt-new" placeholder="Nueva opción..." maxlength="60" />
      <button type="button" class="btn btn-sm btn-primary ficha-opt-add-btn">Agregar</button>
    </div>
    <div class="ficha-opt-list">
      ${opts.length
        ? opts.map(o => `<span class="ficha-opt-chip">${escapeHtml(o)}<button type="button" class="ficha-opt-del" data-val="${escapeHtml(o)}" title="Quitar opción">&#10005;</button></span>`).join('')
        : '<span class="input-hint" style="text-align:left">Sin opciones todavía.</span>'}
    </div>
    <span class="input-hint ficha-opt-note">Se guarda en este dispositivo. Para que lo vean todos los empleados, hay que pasarlo al catálogo del backend.</span>`;

  const input = editor.querySelector('.ficha-opt-new');
  const doAdd = () => addOpcion(campoKey, input.value, editor);
  editor.querySelector('.ficha-opt-add-btn').addEventListener('click', doAdd);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  editor.querySelectorAll('.ficha-opt-del').forEach(b => {
    b.addEventListener('click', () => removeOpcion(campoKey, b.getAttribute('data-val')));
  });
}

function addOpcion(campoKey, rawVal, editor) {
  const val = (rawVal || '').trim();
  if (!val) return;
  const o = getCatalogoOverrides(campoKey);
  o.add = o.add || []; o.hide = o.hide || [];
  o.hide = o.hide.filter(h => h !== val);               // si estaba oculta, reaparece
  const base = findCampoByKey(campoKey).opciones || [];
  if (!base.includes(val) && !o.add.includes(val)) o.add.push(val);
  setCatalogoOverrides(campoKey, o);

  rebuildSelects(campoKey);
  // dejar seleccionada la nueva opción en el select de este editor
  const fg = editor.closest('.form-group');
  const sel = fg ? fg.querySelector(`select[data-key="${campoKey}"]`) : null;
  if (sel) sel.value = val;
  rebuildOpenEditors(campoKey);
  toast(`Opción agregada: ${val}`, 'success');
}

function removeOpcion(campoKey, val) {
  const o = getCatalogoOverrides(campoKey);
  o.add = (o.add || []).filter(x => x !== val);
  const base = findCampoByKey(campoKey).opciones || [];
  if (base.includes(val)) { o.hide = o.hide || []; if (!o.hide.includes(val)) o.hide.push(val); }
  setCatalogoOverrides(campoKey, o);
  rebuildSelects(campoKey);
  rebuildOpenEditors(campoKey);
}

// Reconstruye todos los <select> de esa lista preservando lo que cada uno tenía elegido.
function rebuildSelects(campoKey) {
  const opts = getOpciones(findCampoByKey(campoKey));
  $$(`#ped-etapas select[data-key="${campoKey}"]`).forEach(sel => {
    const cur = opts.includes(sel.value) ? sel.value : '';
    sel.innerHTML = optionsHtml(opts, cur);
    sel.value = cur;
  });
}

function rebuildOpenEditors(campoKey) {
  $$(`#ped-etapas .ficha-opt-editor[data-editor-key="${campoKey}"]`).forEach(ed => {
    if (!ed.classList.contains('hidden')) buildEditor(ed, campoKey);
  });
}

function bindLinklists(scope) {
  scope.querySelectorAll('.ficha-linklist').forEach(ll => {
    const rows = ll.querySelector('.ficha-linklist-rows');
    const addBtn = ll.querySelector('.ficha-linklist-add');
    addBtn.addEventListener('click', () => {
      const tmp = document.createElement('div');
      tmp.innerHTML = linklistRow('');
      rows.appendChild(tmp.firstElementChild);
    });
    ll.addEventListener('click', (e) => {
      const del = e.target.closest('.ficha-linklist-del');
      if (!del) return;
      const allRows = rows.querySelectorAll('.ficha-linklist-row');
      if (allRows.length > 1) del.closest('.ficha-linklist-row').remove();
      else del.closest('.ficha-linklist-row').querySelector('.ficha-link-input').value = '';
    });
  });
}

// ========================================
// FICHA — leer formulario + completitud
// ========================================

// Lee un conjunto de campos desde un contenedor (form de etapa o de mueble).
function readCampos(container, campos) {
  const out = {};
  if (!container) return out;
  campos.forEach(campo => {
    if (campo.tipo === 'seccion') return; // no es dato
    const wrap = container.querySelector(`[data-key="${campo.key}"]`);
    if (!wrap) {
      out[campo.key] = (campo.tipo === 'multiselect' || campo.tipo === 'linklist' || campo.tipo === 'archivolist') ? [] : (campo.tipo === 'dim3' ? {} : '');
      return;
    }
    switch (campo.tipo) {
      case 'calculado':
        out[campo.key] = wrap.getAttribute('data-calc-value') || '';
        break;
      case 'radio': {
        const checked = wrap.querySelector('input[type="radio"]:checked');
        out[campo.key] = checked ? checked.value : '';
        break;
      }
      case 'multiselect':
        out[campo.key] = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
        break;
      case 'linklist':
        out[campo.key] = Array.from(wrap.querySelectorAll('.ficha-link-input')).map(i => i.value.trim()).filter(Boolean);
        break;
      case 'archivo': {
        const inp = wrap.querySelector('.ficha-archivo-link');
        out[campo.key] = inp ? (inp.value || '').trim() : '';
        break;
      }
      case 'archivolist':
        out[campo.key] = Array.from(wrap.querySelectorAll('.ficha-archivo-link')).map(i => i.value.trim()).filter(Boolean);
        break;
      case 'dim3': {
        const g = {};
        wrap.querySelectorAll('[data-dim]').forEach(i => {
          const val = (i.value || '').trim();
          if (val !== '') g[i.getAttribute('data-dim')] = val;
        });
        out[campo.key] = g;
        break;
      }
      default:
        out[campo.key] = (wrap.value || '').trim();
    }
  });
  return out;
}

function readEtapaForm(etapaKey) {
  const etapa = FICHA_ETAPAS.find(e => e.key === etapaKey);
  const formEl = $(`.ficha-form[data-etapa-form="${etapaKey}"]`);
  return readCampos(formEl, etapa ? etapa.campos : []);
}

// ¿El campo condicional está activo? (sin dependeDe → siempre activo)
// `valor` puede ser un string o un array (cualquiera de esos valores lo activa).
function condActiva(campo, data) {
  if (!campo.dependeDe) return true;
  const cur = (data || {})[campo.dependeDe.campo];
  const want = campo.dependeDe.valor;
  return Array.isArray(want) ? want.includes(cur) : cur === want;
}

function valorVacio(campo, v) {
  if (campo.tipo === 'multiselect') return !Array.isArray(v) || v.length === 0;
  if (campo.tipo === 'linklist' || campo.tipo === 'archivolist') {
    const n = Array.isArray(v) ? v.filter(Boolean).length : 0;
    return n < (campo.min || 1);
  }
  if (campo.tipo === 'dim3') {
    const o = v || {};
    return !(o.alto && o.largo && o.profundo);
  }
  return v == null || String(v).trim() === '';
}

// Progreso de requeridos en una lista de campos sobre un registro (saltea condicionales inactivos).
function camposProgreso(campos, data) {
  const d = data || {};
  const reqs = campos.filter(c => c.requerido && condActiva(c, d));
  const filled = reqs.filter(c => !valorVacio(c, d[c.key])).length;
  return { total: reqs.length, filled, completa: reqs.length > 0 && filled === reqs.length };
}

function etapaProgreso(etapa, data) {
  if (etapa.mirrorOf) {
    // 5A: una ficha de producción por cada mueble definido en 3B.
    const src = Array.isArray(currentFichaDetalle[etapa.mirrorOf]) ? currentFichaDetalle[etapa.mirrorOf] : [];
    const prod = Array.isArray(data) ? data : [];
    const completos = src.filter((_, i) => camposProgreso(etapa.itemCampos, prod[i] || {}).completa).length;
    return { repeater: true, count: src.length, completos, completa: src.length > 0 && completos === src.length };
  }
  if (etapa.repeater) {
    const muebles = Array.isArray(data) ? data : [];
    const completos = muebles.filter(m => camposProgreso(etapa.itemCampos, m).completa).length;
    return { repeater: true, count: muebles.length, completos, completa: muebles.length > 0 && completos === muebles.length };
  }
  return camposProgreso(etapa.campos, data);
}

// ========================================
// FICHA — Etapa repetible (muebles, Etapa 3B)
// ========================================

function renderEtapaRepeater(etapa, muebles) {
  const cards = muebles.map((m, i) => renderMuebleCard(etapa, m, i)).join('');
  return `
    <div class="ficha-repeater" data-repeater="${etapa.key}">
      <div class="ficha-repeater-list">
        ${cards || `<p class="ficha-etapa-desc ficha-repeater-empty">Todavía no agregaste muebles. Tocá “+ Agregar mueble”.</p>`}
      </div>
      <div class="ficha-repeater-actions">
        <button type="button" class="btn btn-sm btn-outline" onclick="addMueble('${etapa.key}')">+ Agregar mueble</button>
        <button type="button" class="btn btn-primary" onclick="guardarEtapa('${etapa.key}')">Guardar muebles</button>
      </div>
    </div>`;
}

// Etapa espejo (5A): una sub-ficha por cada mueble ya cargado en 3B (etapa.mirrorOf).
// No se agregan/quitan acá; la lista viene de los muebles del diseño.
function renderEtapaMirror(etapa, muebles3b, prod) {
  if (!muebles3b.length) {
    return `<p class="ficha-etapa-desc ficha-repeater-empty">Primero cargá los muebles en la Etapa 3B. Acá vas a poder seguir la producción de cada uno.</p>`;
  }
  const cards = muebles3b.map((m, i) => renderMuebleCard(etapa, prod[i] || {}, i, muebleTitulo(m, i))).join('');
  return `
    <div class="ficha-repeater" data-repeater="${etapa.key}">
      <div class="ficha-repeater-list">${cards}</div>
      <div class="ficha-repeater-actions" style="justify-content:flex-end">
        <button type="button" class="btn btn-primary" onclick="guardarEtapa('${etapa.key}')">Guardar producción</button>
      </div>
    </div>`;
}

function muebleTitulo(m, i) {
  let t = `Mueble ${i + 1}`;
  if (m.nombre_custom) t += ` — ${m.nombre_custom}`;
  else if (m.tipo_mueble) t += ` — ${m.tipo_mueble}`;
  if (m.espacio) t += ` (${m.espacio})`;
  return t;
}

// itemData = datos de la sub-ficha; tituloOverride lo usa el espejo (5A) para
// titular cada card con el nombre del mueble de 3B. Sin override → repeater (3B).
function renderMuebleCard(etapa, itemData, i, tituloOverride) {
  const ns = `${etapa.key}-m${i}`;
  const prog = camposProgreso(etapa.itemCampos, itemData);
  const badge = prog.completa
    ? '<span class="ficha-mueble-badge badge badge-green">Listo</span>'
    : `<span class="ficha-mueble-badge badge badge-yellow">${prog.filled}/${prog.total}</span>`;
  const titulo = tituloOverride != null ? tituloOverride : muebleTitulo(itemData, i);
  const delBtn = etapa.mirrorOf ? '' :
    `<button type="button" class="btn-icon ficha-mueble-del" title="Quitar mueble" onclick="removeMueble(event, '${etapa.key}', ${i})">&#128465;</button>`;
  return `
    <div class="ficha-mueble" data-mueble-index="${i}">
      <div class="ficha-mueble-head" onclick="toggleMueble(this)">
        <span class="ficha-mueble-titulo">${escapeHtml(titulo)}</span>
        ${badge}
        ${delBtn}
        <span class="ficha-etapa-chevron">&#9660;</span>
      </div>
      <div class="ficha-mueble-body">
        <form class="ficha-form" data-mueble-form="${ns}" onsubmit="return false;">
          ${etapa.itemCampos.map(c => renderCampo(c, itemData[c.key], ns)).join('')}
        </form>
      </div>
    </div>`;
}

function toggleMueble(headEl) {
  headEl.closest('.ficha-mueble').classList.toggle('open');
}

// Lee todos los muebles del DOM (preserva lo tipeado aunque no se haya guardado).
function readMuebles(etapaKey) {
  const etapa = FICHA_ETAPAS.find(e => e.key === etapaKey);
  const cards = $$(`.ficha-repeater[data-repeater="${etapaKey}"] .ficha-mueble`);
  return Array.from(cards).map(card => readCampos(card.querySelector('.ficha-form'), etapa.itemCampos));
}

function rerenderRepeater(etapaKey, muebles, openIndex) {
  currentFichaDetalle[etapaKey] = muebles;
  const etapa = FICHA_ETAPAS.find(e => e.key === etapaKey);
  const body = $(`.ficha-etapa[data-etapa="${etapaKey}"] .ficha-etapa-body`);
  if (!body) return;
  body.innerHTML = (etapa.desc ? `<p class="ficha-etapa-desc">${escapeHtml(etapa.desc)}</p>` : '') + renderEtapaRepeater(etapa, muebles);
  bindLinklists(body);
  bindArchivos(body);
  bindConditionals(body);
  refreshEtapaStatus(etapaKey);
  if (openIndex != null) {
    const card = body.querySelector(`.ficha-mueble[data-mueble-index="${openIndex}"]`);
    if (card) card.classList.add('open');
  }
}

function addMueble(etapaKey) {
  const muebles = readMuebles(etapaKey);
  muebles.push({});
  rerenderRepeater(etapaKey, muebles, muebles.length - 1);
}

function removeMueble(ev, etapaKey, idx) {
  ev.stopPropagation();
  const muebles = readMuebles(etapaKey);
  muebles.splice(idx, 1);
  rerenderRepeater(etapaKey, muebles);
}

// ========================================
// FICHA — campos condicionales
// ========================================

function bindConditionals(scope) {
  scope.querySelectorAll('.ficha-form').forEach(form => {
    applyConditionals(form);
    if (form.dataset.condBound) return;
    form.dataset.condBound = '1';
    form.addEventListener('change', () => applyConditionals(form));
  });
}

function applyConditionals(form) {
  form.querySelectorAll('.ficha-cond').forEach(group => {
    const parentKey = group.getAttribute('data-depende-campo');
    const wantVal = group.getAttribute('data-depende-valor');
    const parentWrap = form.querySelector(`[data-key="${parentKey}"]`);
    let cur = '';
    if (parentWrap) {
      const checked = parentWrap.querySelector('input[type="radio"]:checked');
      cur = checked ? checked.value : (parentWrap.value || '');
    }
    let want = wantVal;
    if (wantVal && wantVal.charAt(0) === '[') { try { want = JSON.parse(wantVal); } catch (_) {} }
    const activo = Array.isArray(want) ? want.includes(cur) : cur === want;
    group.classList.toggle('hidden', !activo);
  });
}

// ========================================
// FICHA — campos calculados (saldo, fechas derivadas)
// ========================================

function bindCalculados(scope) {
  scope.querySelectorAll('.ficha-form[data-etapa-form]').forEach(form => {
    const etapa = FICHA_ETAPAS.find(e => e.key === form.getAttribute('data-etapa-form'));
    if (!etapa || !(etapa.campos || []).some(c => c.tipo === 'calculado')) return;
    recomputeCalculados(form);
    if (form.dataset.calcBound) return;
    form.dataset.calcBound = '1';
    const fn = () => recomputeCalculados(form);
    form.addEventListener('input', fn);
    form.addEventListener('change', fn);
  });
}

function recomputeCalculados(form) {
  const etapa = FICHA_ETAPAS.find(e => e.key === form.getAttribute('data-etapa-form'));
  if (!etapa) return;
  const calcs = (etapa.campos || []).filter(c => c.tipo === 'calculado');
  if (!calcs.length) return;
  const data = readCampos(form, etapa.campos);
  calcs.forEach(c => {
    const el = form.querySelector(`[data-key="${c.key}"]`);
    if (!el) return;
    let res = { value: '', display: '—' };
    try { if (c.compute) res = c.compute(data) || res; } catch (_) { /* compute robusto */ }
    el.textContent = (res.display != null && res.display !== '') ? res.display : '—';
    el.setAttribute('data-calc-value', res.value != null ? res.value : '');
  });
}

// ========================================
// FICHA — guardar etapa (localStorage + intento webhook)
// ========================================

async function guardarEtapa(etapaKey) {
  if (!currentFichaProyecto) return;
  const etapa = FICHA_ETAPAS.find(e => e.key === etapaKey);

  // Leer datos según el tipo de etapa + armar aviso (no bloqueante) de faltantes
  let data, faltan = [];
  if (etapa.repeater || etapa.mirrorOf) {
    data = readMuebles(etapaKey);
    const prog = etapaProgreso(etapa, data);
    if (prog.count === 0) faltan = [etapa.mirrorOf ? 'Cargá los muebles en la Etapa 3B' : 'Agregá al menos un mueble'];
    else if (prog.completos < prog.count) faltan = [`${prog.count - prog.completos} mueble(s) con datos pendientes`];
  } else {
    const formEl = $(`.ficha-form[data-etapa-form="${etapaKey}"]`);
    if (formEl) recomputeCalculados(formEl);
    data = readEtapaForm(etapaKey);
    faltan = etapa.campos
      .filter(c => c.requerido && condActiva(c, data) && valorVacio(c, data[c.key]))
      .map(c => c.label);
  }

  // Persistir en el bloque JSON
  currentFichaDetalle[etapaKey] = data;
  currentFichaDetalle._updated_at = new Date().toISOString();

  const proyectoId = currentFichaProyecto.proyecto_id;
  try {
    localStorage.setItem(detalleKey(proyectoId), JSON.stringify(currentFichaDetalle));
  } catch (_) { /* sin localStorage: seguimos al webhook igual */ }

  const btn = $(`.ficha-etapa[data-etapa="${etapaKey}"] .ficha-etapa-body .btn-primary`);
  const origLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  let serverOk = false;
  try {
    const resp = await sendToWebhook('guardar_proyecto_detalle', {
      proyecto_id: proyectoId,
      detalle: JSON.stringify(currentFichaDetalle),
    });
    serverOk = !!(resp && resp.ok !== false);
  } catch (_) { serverOk = false; }

  const nombreEtapa = etapa.repeater ? 'Muebles' : `Etapa ${etapa.num}`;
  if (serverOk) {
    toast(`${nombreEtapa}: guardado`, 'success');
  } else {
    toast(`${nombreEtapa}: guardado en este dispositivo. El guardado en servidor todavía no está activo.`, 'warning');
  }
  if (faltan.length) {
    toast(`Faltan datos: ${faltan.join(', ')}`, 'info');
  }

  // Refrescar badge de progreso sin perder lo escrito
  refreshEtapaStatus(etapaKey);

  if (btn) { btn.disabled = false; btn.textContent = origLabel; }
}

function refreshEtapaStatus(etapaKey) {
  const etapa = FICHA_ETAPAS.find(e => e.key === etapaKey);
  const prog = etapaProgreso(etapa, currentFichaDetalle[etapaKey]);
  const statusEl = $(`.ficha-etapa[data-etapa="${etapaKey}"] .ficha-etapa-head .ficha-etapa-status`);
  if (!statusEl) return;
  statusEl.className = etapaStatusClass(prog);
  statusEl.textContent = etapaStatusText(prog);
}
