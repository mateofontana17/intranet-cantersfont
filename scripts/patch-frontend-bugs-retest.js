#!/usr/bin/env node
/**
 * Patch frontend bugs encontrados en el retesting pre-demo:
 *
 * 1. clientes.js fetchPedidos: "Cannot read properties of null" cuando el
 *    webhook responde vacío. Fix: guardar contra null antes de leer .pedidos.
 *
 * 2. clientes.js openPedidoEdit: si cliente.cliente_id viene vacío de la
 *    sheet (bug del workflow), el option queda con value="". Fix: usar
 *    telefono como ID fallback.
 *
 * 3. clientes.js handlePedidoSubmit: lookup por cliente_id falla si vino
 *    como telefono. Fix: matchear por el mismo identificador usado en el
 *    dropdown.
 *
 * 4. app.js Compra cascade: si producto no tiene color/medida en catálogo,
 *    el form los pide pero no muestra opciones. Fix:
 *    - auto-rellenar con label "(sin variante)" / "—" si el catálogo solo
 *      tiene esa opción
 *    - validar solo que el código se resuelva, no que cada campo tenga valor
 */

const fs = require('fs');
const path = require('path');

const WF_DIR = path.join(__dirname, '..', 'web-form');
const CLIENTES_PATH = path.join(WF_DIR, 'clientes.js');
const APP_PATH = path.join(WF_DIR, 'app.js');

// --- backup helper ---
function backup(p) {
  const bak = p + '.bak2';
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, fs.readFileSync(p, 'utf8'), 'utf8');
    console.log('  backup:', bak);
  }
}

// =========== CLIENTES.JS ===========
{
  let src = fs.readFileSync(CLIENTES_PATH, 'utf8');
  backup(CLIENTES_PATH);

  // Fix 1: fetchPedidos null-safety
  const f1Orig = `    const data = await sendToWebhook('listar_pedidos', {});
    pedidosData = Array.isArray(data) ? data : (data.pedidos || data.items || data.data || []);`;
  const f1New = `    const data = await sendToWebhook('listar_pedidos', {});
    // Guardar contra respuesta null/undefined del webhook.
    const safeData = data || {};
    pedidosData = Array.isArray(safeData) ? safeData : (safeData.pedidos || safeData.items || safeData.data || []);`;
  if (src.includes(f1Orig)) {
    src = src.replace(f1Orig, () => f1New);
    console.log('✔ clientes.js fix 1: fetchPedidos null-safety');
  } else {
    console.log('⚠ clientes.js fix 1 no aplicado (texto ya modificado o cambió)');
  }

  // Fix 2: openPedidoEdit usar telefono como fallback id
  const f2Orig = `  clientesData.forEach(c => {
    const id = c.cliente_id || '';
    const nombre = c.nombre || '';
    const label = nombre ? \`\${id} - \${nombre}\` : id;
    select.innerHTML += \`<option value="\${escapeHtml(id)}" data-nombre="\${escapeHtml(nombre)}">\${escapeHtml(label)}</option>\`;
  });`;
  const f2New = `  clientesData.forEach(c => {
    const nombre = c.nombre || '';
    // Fallback: si la sheet no tiene cliente_id, usamos el telefono como id
    // único (o el nombre si tampoco hay tel). Así el dropdown siempre tiene
    // un value no-vacío y el pedido puede registrarse.
    const id = c.cliente_id || (c.telefono ? 'TEL-' + String(c.telefono).replace(/\\D/g,'') : ('NAME-' + nombre.replace(/\\s+/g, '_')));
    const labelPrefix = c.cliente_id || c.telefono || '';
    const label = nombre ? (labelPrefix ? \`\${labelPrefix} - \${nombre}\` : nombre) : id;
    select.innerHTML += \`<option value="\${escapeHtml(id)}" data-nombre="\${escapeHtml(nombre)}">\${escapeHtml(label)}</option>\`;
  });`;
  if (src.includes(f2Orig)) {
    src = src.replace(f2Orig, () => f2New);
    console.log('✔ clientes.js fix 2: openPedidoEdit fallback id');
  } else {
    console.log('⚠ clientes.js fix 2 no aplicado (texto ya modificado o cambió)');
  }

  // Fix 3: handlePedidoSubmit lookup robusto
  const f3Orig = `  const clienteId = $('#ped-cliente').value;
  const clienteSeleccionado = clientesData.find(c => c.cliente_id === clienteId);`;
  const f3New = `  const clienteId = $('#ped-cliente').value;
  // Buscar por cliente_id real o por los IDs fallback (TEL-XXX, NAME-XXX).
  const clienteSeleccionado = clientesData.find(c => {
    if (c.cliente_id && c.cliente_id === clienteId) return true;
    if (clienteId && clienteId.startsWith('TEL-') && c.telefono) {
      return ('TEL-' + String(c.telefono).replace(/\\D/g,'')) === clienteId;
    }
    if (clienteId && clienteId.startsWith('NAME-') && c.nombre) {
      return ('NAME-' + c.nombre.replace(/\\s+/g, '_')) === clienteId;
    }
    return false;
  });`;
  if (src.includes(f3Orig)) {
    src = src.replace(f3Orig, () => f3New);
    console.log('✔ clientes.js fix 3: lookup cliente robusto');
  } else {
    console.log('⚠ clientes.js fix 3 no aplicado (texto ya modificado o cambió)');
  }

  fs.writeFileSync(CLIENTES_PATH, src, 'utf8');
  console.log('✔ clientes.js actualizado\n');
}

// =========== APP.JS Compra cascade UX ===========
{
  let src = fs.readFileSync(APP_PATH, 'utf8');
  backup(APP_PATH);

  // Fix 4: relajar validación de color/medida en handleCompraSubmit.
  // Solo requerimos que el código se resuelva. Color/medida/producto pueden
  // quedar vacíos si el catálogo no los provee para esa selección.
  const f4Orig = `  if (!color) {
    showFieldError($('#ss-compra-color .ss-input'), 'Seleccione un color/variante');
    valid = false;
  }
  if (!medidaDisplay) {
    showFieldError($('#ss-compra-medida .ss-input'), 'Seleccione una medida');
    valid = false;
  }
  if (!productoValue) {
    showFieldError($('#ss-compra-producto .ss-input'), 'Seleccione un producto');
    valid = false;
  }`;
  const f4New = `  // Estos campos son obligatorios SOLO si el catálogo tiene opciones
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
  }`;
  if (src.includes(f4Orig)) {
    src = src.replace(f4Orig, () => f4New);
    console.log('✔ app.js fix 4: relajar validación compra cascade');
  } else {
    console.log('⚠ app.js fix 4 no aplicado (texto ya modificado o cambió)');
  }

  // Fix 5: en refreshCompraCascade, marcar campos sin opciones como deshabilitados
  // y auto-rellenar con un placeholder claro.
  const f5Orig = `  Object.entries(fieldMap).forEach(([field, { ss, extract }]) => {
    if (field === justSelected) return;
    const opts = uniqSorted(filteredCompraItems(field).map(extract));
    ss.setOptions(opts);
  });`;
  const f5New = `  Object.entries(fieldMap).forEach(([field, { ss, extract }]) => {
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
  });`;
  if (src.includes(f5Orig)) {
    src = src.replace(f5Orig, () => f5New);
    console.log('✔ app.js fix 5: cascade auto-fill / disable');
  } else {
    console.log('⚠ app.js fix 5 no aplicado (texto ya modificado o cambió)');
  }

  fs.writeFileSync(APP_PATH, src, 'utf8');
  console.log('✔ app.js actualizado');
}

console.log('\n✔ Todos los fixes aplicados. Falta redeploy a Netlify.');
