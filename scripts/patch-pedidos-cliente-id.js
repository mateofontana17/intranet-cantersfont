#!/usr/bin/env node
/**
 * Fix completo del bug "pedidos se cargan OK pero no aparecen":
 *
 * CAUSA RAÍZ:
 * - El workflow `normalizar pedido` valida cliente_id con regex /^CLI-\d{3,}$/
 * - La sheet Clientes no tiene IDs generados (todos vacíos)
 * - El frontend manda valor vacío o el fallback TEL-XXX que tampoco matchea
 * - normalizar pedido tira error, workflow no responde, webhook devuelve vacío
 * - El frontend trata respuesta vacía como éxito y muestra "registrado"
 *
 * FIXES:
 * 1. WORKFLOW: relajar validación cliente_id (acepta cualquier string no-vacío)
 * 2. WORKFLOW: Mapear Clientes inyecta cliente_id = CLI-XXX (row_number) si falta
 * 3. WORKFLOW: " Crear Cliente" asigna cliente_id antes de append
 * 4. FRONTEND: chequear respuesta vacía/no-ok en handlePedidoSubmit
 * 5. FRONTEND: revertir hack TEL-XXX (ahora los IDs vienen del backend)
 *
 * Uso:
 *   node patch-pedidos-cliente-id.js          (solo modifica local)
 *   node patch-pedidos-cliente-id.js --apply  (modifica local + pushea n8n)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const LOCAL_WF = path.join(__dirname, '..', 'workflows', 'clean', 'formulario-webhook.json');
const CLIENTES_JS = path.join(__dirname, '..', 'web-form', 'clientes.js');
const WORKFLOW_ID = '7ntDbXur9JBetv23';

function loadEnv(p) {
  const v = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    v[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return v;
}

// ============ WORKFLOW PATCH ============
const wf = JSON.parse(fs.readFileSync(LOCAL_WF, 'utf8'));

// --- Fix 1: relajar validación cliente_id en normalizar pedido ---
const normNode = wf.nodes.find((n) => n.name === 'normalizar pedido');
if (!normNode) throw new Error('No se encontró nodo "normalizar pedido"');

const oldRegex = 'const isClienteIdValido = (s) => typeof s === \'string\' && /^CLI-\\d{3,}$/.test(s);';
const newRegex = 'const isClienteIdValido = (s) => typeof s === \'string\' && s.trim().length > 0;';
if (normNode.parameters.jsCode.includes(oldRegex)) {
  normNode.parameters.jsCode = normNode.parameters.jsCode.replace(oldRegex, newRegex);
  console.log('✔ Fix 1: validación cliente_id relajada (acepta cualquier string no-vacío)');
} else if (normNode.parameters.jsCode.includes(newRegex)) {
  console.log('  Fix 1 ya aplicado');
} else {
  console.log('⚠ Fix 1: no se encontró el regex original, revisar manualmente');
}

// --- Fix 2: Mapear Clientes auto-genera cliente_id desde row_number ---
const mapClientesNode = wf.nodes.find((n) => n.name === 'Mapear Clientes');
if (mapClientesNode) {
  const oldMapper = mapClientesNode.parameters.jsCode;
  const newMapper = `return $input.all()
  .map((item, idx) => {
    const out = {};
    for (const [key, value] of Object.entries(item.json)) {
      if (key === 'row_number') continue;
      out[key] = value == null ? '' : (typeof value === 'string' ? value.trim() : value);
    }
    // Si no hay cliente_id en la sheet, generar uno determinístico desde
    // row_number para que el workflow pueda validar y los pedidos vincular.
    if (!out.cliente_id) {
      const rn = item.json.row_number || (idx + 2);
      out.cliente_id = 'CLI-' + String(rn).padStart(3, '0');
    }
    return { json: out };
  })
  .filter(item => item.json.nombre || item.json.telefono);`;
  if (oldMapper !== newMapper) {
    mapClientesNode.parameters.jsCode = newMapper;
    console.log('✔ Fix 2: Mapear Clientes ahora inyecta cliente_id desde row_number');
  } else {
    console.log('  Fix 2 ya aplicado');
  }
} else {
  console.log('⚠ Fix 2: no se encontró nodo Mapear Clientes');
}

// --- Fix 3: " Crear Cliente" asigna cliente_id antes de append ---
// El nodo es Google Sheets append. Necesitamos un Code node previo que
// inyecte cliente_id. Verificamos si ya existe, si no lo agregamos.
const crearClienteNode = wf.nodes.find((n) => n.name === ' Crear Cliente');
const generarIdNode = wf.nodes.find((n) => n.name === 'Generar Cliente ID');

if (crearClienteNode && !generarIdNode) {
  // Agregar nodo de generación de ID antes de Crear Cliente.
  const newNode = {
    parameters: {
      jsCode: `// Genera cliente_id único antes de insertar en la sheet.
// Lee el siguiente número de CLI-XXX disponible basado en el timestamp.
const data = $json.body && $json.body.data ? $json.body.data : ($json.data || $json);
// Generar ID determinístico desde timestamp para evitar colisiones.
const now = Date.now();
const id = 'CLI-' + String(now).slice(-6);
return [{
  json: {
    cliente_id: id,
    nombre: data.nombre || '',
    telefono: data.telefono || '',
    email: data.email || '',
    direccion: data.direccion || '',
    localidad: data.localidad || '',
    notas: data.notas || '',
  },
}];`,
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [crearClienteNode.position[0] - 200, crearClienteNode.position[1]],
    id: 'gen-cli-id-' + Math.random().toString(36).slice(2, 10),
    name: 'Generar Cliente ID',
  };
  wf.nodes.push(newNode);
  console.log('✔ Fix 3a: nodo "Generar Cliente ID" agregado');

  // Re-cablear: Switch output 7 (registrar_cliente) → Generar Cliente ID → Crear Cliente
  // Encontrar quien apunta actualmente a " Crear Cliente"
  for (const [srcName, conns] of Object.entries(wf.connections)) {
    if (!conns.main) continue;
    for (let i = 0; i < conns.main.length; i++) {
      const out = conns.main[i];
      if (!out) continue;
      for (let j = 0; j < out.length; j++) {
        if (out[j].node === ' Crear Cliente') {
          out[j] = { node: 'Generar Cliente ID', type: 'main', index: 0 };
          console.log(`  ↻ ${srcName}[${i}] redirigido a Generar Cliente ID`);
        }
      }
    }
  }

  // Generar Cliente ID → Crear Cliente
  wf.connections['Generar Cliente ID'] = {
    main: [[{ node: ' Crear Cliente', type: 'main', index: 0 }]],
  };
  console.log('✔ Fix 3b: conexiones actualizadas');
} else if (generarIdNode) {
  console.log('  Fix 3 ya aplicado (nodo existe)');
}

fs.writeFileSync(LOCAL_WF, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('✔ Workflow local actualizado\n');

// ============ FRONTEND PATCH ============
let cjs = fs.readFileSync(CLIENTES_JS, 'utf8');

// --- Fix 4: revertir hack TEL-XXX (los IDs ahora vienen del backend) ---
const tel1Orig = `  clientesData.forEach(c => {
    const nombre = c.nombre || '';
    // Fallback: si la sheet no tiene cliente_id, usamos el telefono como id
    // único (o el nombre si tampoco hay tel). Así el dropdown siempre tiene
    // un value no-vacío y el pedido puede registrarse.
    const id = c.cliente_id || (c.telefono ? 'TEL-' + String(c.telefono).replace(/\\D/g,'') : ('NAME-' + nombre.replace(/\\s+/g, '_')));
    const labelPrefix = c.cliente_id || c.telefono || '';
    const label = nombre ? (labelPrefix ? \`\${labelPrefix} - \${nombre}\` : nombre) : id;
    select.innerHTML += \`<option value="\${escapeHtml(id)}" data-nombre="\${escapeHtml(nombre)}">\${escapeHtml(label)}</option>\`;
  });`;
const tel1New = `  clientesData.forEach(c => {
    const id = c.cliente_id || '';
    const nombre = c.nombre || '';
    const label = nombre ? \`\${id} - \${nombre}\` : id;
    select.innerHTML += \`<option value="\${escapeHtml(id)}" data-nombre="\${escapeHtml(nombre)}">\${escapeHtml(label)}</option>\`;
  });`;
if (cjs.includes(tel1Orig)) {
  cjs = cjs.replace(tel1Orig, () => tel1New);
  console.log('✔ Fix 4: revert hack TEL-XXX en openPedidoEdit');
} else {
  console.log('  Fix 4: hack TEL-XXX ya removido o no existía');
}

const tel2Orig = `  const clienteId = $('#ped-cliente').value;
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
const tel2New = `  const clienteId = $('#ped-cliente').value;
  const clienteSeleccionado = clientesData.find(c => c.cliente_id === clienteId);`;
if (cjs.includes(tel2Orig)) {
  cjs = cjs.replace(tel2Orig, () => tel2New);
  console.log('✔ Fix 4b: revert lookup TEL-XXX en handlePedidoSubmit');
} else {
  console.log('  Fix 4b: lookup TEL-XXX ya removido o no existía');
}

// --- Fix 5: chequear que registrar_pedido respondió OK ---
const resp1Orig = `    const resp = await sendToWebhook('registrar_pedido', {
      cliente_id: clienteId,
      cliente_nombre: clienteNombre,
      fecha_entrega: fechaEntrega,
      sena: sena || 0,
      total: total || 0,
      notas,
      items,
    });
    notifyPedidoResult(resp);
    closePedidoEdit();
    await fetchPedidos();`;
const resp1New = `    const resp = await sendToWebhook('registrar_pedido', {
      cliente_id: clienteId,
      cliente_nombre: clienteNombre,
      fecha_entrega: fechaEntrega,
      sena: sena || 0,
      total: total || 0,
      notas,
      items,
    });
    // Validar que el backend efectivamente registró el pedido.
    // Si la respuesta es vacía/null o ok:false → es un error silencioso del workflow.
    if (!resp || resp.ok === false || (!resp.pedido_id && !resp.ok && !resp.estado)) {
      const msg = (resp && resp.error) || 'El servidor no confirmó el pedido. Revisá los datos e intentá de nuevo.';
      toast(msg, 'error');
      return;
    }
    notifyPedidoResult(resp);
    closePedidoEdit();
    await fetchPedidos();`;
if (cjs.includes(resp1Orig)) {
  cjs = cjs.replace(resp1Orig, () => resp1New);
  console.log('✔ Fix 5: validar respuesta no-vacía en handlePedidoSubmit');
} else {
  console.log('  Fix 5 ya aplicado o estructura cambió');
}

fs.writeFileSync(CLIENTES_JS, cjs, 'utf8');
console.log('✔ clientes.js actualizado\n');

// ============ PUSH A N8N ============
if (!process.argv.includes('--apply')) {
  console.log('── DRY RUN ── Usá --apply para pushear el workflow a n8n.');
  return;
}

(async () => {
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.N8N_API_KEY || '';
  const endpoint = `${baseUrl}/api/v1/workflows/${WORKFLOW_ID}`;
  console.log('── PUT', endpoint);
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' },
  };
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('✖', res.status, text);
    process.exit(1);
  }
  const result = JSON.parse(text);
  console.log('✔ Pusheado. versionId:', result.versionId);

  // Re-activar
  const actRes = await fetch(endpoint + '/activate', {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': apiKey },
  });
  console.log('✔ Activate:', actRes.status);
})();
