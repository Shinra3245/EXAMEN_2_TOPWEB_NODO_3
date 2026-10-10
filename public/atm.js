const $ = selector => document.querySelector(selector);
const storageKey = 'node3.atm.pending.v1';
let pending = null;
let working = false;
let configured = !$('#movement-button').disabled;
try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* Invalid local storage is ignored. */ }
if (pending && (!['retiro', 'deposito'].includes(pending.tipo) || typeof pending.key !== 'string' || typeof pending.body?.numero_cuenta !== 'string' || typeof pending.body?.monto !== 'string')) pending = null;

const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
function save() {
  try { if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending)); else sessionStorage.removeItem(storageKey); }
  catch { /* The live request still keeps its key when storage is unavailable. */ }
}
function lock() {
  $('#movement-button').disabled = working || Boolean(pending) || !configured;
  $('#balance-button').disabled = working || !configured;
  $('#numero_cuenta').disabled = working || Boolean(pending);
  $('#monto').disabled = working || Boolean(pending);
  document.querySelectorAll('[name=tipo]').forEach(input => { input.disabled = working || Boolean(pending); });
  $('#recover-button').disabled = working;
}
function show(title, message, recover = false) {
  $('#result-area').hidden = false;
  $('#result-title').textContent = title;
  $('#result-message').textContent = message;
  $('#receipt').hidden = true;
  $('#recover-button').hidden = !recover;
}
function receipt(operation) {
  const rows = [
    ['Transacción central', operation.receipt.transaction_id],
    ['Operación', operation.tipo === 'retiro' ? 'Retiro' : 'Depósito'],
    ['Cuenta', operation.numero_cuenta], ['Importe', money(operation.monto)],
    ['Saldo resultante', money(operation.receipt.saldo_global)],
    ['Fecha', new Date(operation.receipt.created_at).toLocaleString('es-MX')],
  ];
  $('#receipt').replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    $('#receipt').append(dt, dd);
  }
  $('#receipt').hidden = false;
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(25000), headers: { Accept: 'application/json', ...options.headers } });
  const payload = await response.json();
  if (!response.ok && !payload.data) {
    const error = new Error(payload.error?.message || 'No fue posible completar la solicitud.');
    error.code = payload.error?.code;
    throw error;
  }
  return payload.data;
}
async function refreshStatus() {
  try {
    const status = await request('/api/atm');
    configured = status.configured;
    $('#atm-status').textContent = !configured ? 'Pendiente de configuración' : status.available ? 'Cajero disponible' : 'Confirmando una operación';
    $('#atm-status').classList.toggle('status-ok', status.available);
    $('#atm-status').classList.toggle('status-warn', !status.available);
  } catch { /* Keep the last observed status. */ }
}
function acceptOperation(operation) {
  if (!operation || !['succeeded', 'rejected', 'pending'].includes(operation.status)) throw new Error('Respuesta del cajero incompatible. Conserva la operación para consultar su estado.');
  if (operation.status === 'pending') {
    pending.id = operation.id; save();
    show('Confirmación pendiente', 'El Banco Central aún no confirmó el resultado. Consulta esta operación; evita repetirla desde otra pestaña.', true);
  } else if (operation.status === 'rejected') {
    pending = null; save();
    show('Operación rechazada', operation.error?.message || 'La operación fue rechazada.');
  } else {
    pending = null; save();
    show('Operación completada', operation.tipo === 'retiro' ? 'Retiro aprobado. Se simuló la entrega del efectivo.' : 'Depósito aprobado. El saldo y el efectivo del cajero se actualizaron.');
    receipt(operation);
    $('#balance-amount').textContent = money(operation.receipt.saldo_global);
  }
}
async function processPending() {
  if (!pending || working) return;
  working = true; lock();
  const hadId = Boolean(pending.id);
  try {
    const operation = pending.id
      ? await request(`/api/operaciones/${encodeURIComponent(pending.id)}`)
      : await request(`/api/${pending.tipo === 'retiro' ? 'retiros' : 'depositos'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.body),
      });
    acceptOperation(operation);
  } catch (error) {
    // These failures precede creation of a new local operation. Other failures keep the key.
    if (!hadId && ['INVALID_AMOUNT', 'INVALID_ACCOUNT', 'INVALID_IDEMPOTENCY_KEY', 'ATM_NOT_CONFIGURED', 'ATM_BUSY'].includes(error.code)) {
      pending = null; save(); show('No se pudo iniciar la operación', error.message);
    } else show('Resultado por confirmar', 'No se recibió una confirmación válida. Usa “Consultar confirmación” para recuperar la misma operación.', true);
  } finally { await refreshStatus(); working = false; lock(); }
}
$('#balance-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (working) return;
  working = true; lock();
  try {
    const account = $('#numero_cuenta').value.trim();
    if (!account) throw new Error('Ingresa tu número de cuenta.');
    const balance = await request(`/api/accounts/${encodeURIComponent(account)}/saldo`);
    $('#holder-name').textContent = balance.nombre_titular;
    $('#balance-amount').textContent = money(balance.saldo_global);
    $('#balance-result').hidden = false;
  } catch (error) {
    $('#balance-result').hidden = true;
    show('No se pudo consultar el saldo', error.message, Boolean(pending));
  } finally { working = false; lock(); }
});
$('#movement-form').addEventListener('submit', event => {
  event.preventDefault();
  if (working || pending) return;
  const account = $('#numero_cuenta').value.trim();
  if (!account) { show('Falta el número de cuenta', 'Ingresa tu número de cuenta antes de confirmar.'); $('#numero_cuenta').focus(); return; }
  pending = { key: crypto.randomUUID(), tipo: document.querySelector('[name=tipo]:checked').value, body: { numero_cuenta: account, monto: $('#monto').value } };
  save(); processPending();
});
$('#recover-button').addEventListener('click', processPending);
if (pending) {
  $('#numero_cuenta').value = pending.body.numero_cuenta;
  $('#monto').value = pending.body.monto;
  document.querySelector(`[name=tipo][value=${pending.tipo}]`).checked = true;
  show('Operación por confirmar', 'Hay una operación guardada en esta pestaña. Consulta su resultado antes de iniciar otra.', true);
}
lock();
