import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { positiveMoney, formatMoney } from '../src/money.js';

export function createMockBank({ apiKey = 'mock-api-key-for-automated-tests-only' } = {}) {
  const app = express();
  app.use(express.json());
  const state = {};
  const reset = () => Object.assign(state, {
    apiKey, nodeId: 'd6f9d760-e639-46ed-8dfb-74263740fdbe',
    nodeName: 'Cajero de demostración', active: true, nodeType: 'cajero',
    cash: 500000n, accounts: new Map([['10001', { name: 'Cliente de demostración', balance: 100000n, status: 'activa' }]]),
    operations: new Map(), transactionCount: 0, postCount: 0,
    dropNextResponse: false, malformedNextResponse: false, failLookup: false, failPost: false, delayMs: 0,
    lastBody: null,
  });
  reset();
  const fail = (res, code, status = 422) => res.status(status).json({ error: { code, message: code } });
  app.use('/api', (req, res, next) => {
    if (req.get('X-API-KEY') !== state.apiKey) return fail(res, 'INVALID_API_KEY', 401);
    if (!state.active) return fail(res, 'NODE_INACTIVE', 403);
    next();
  });
  app.get('/api/nodes/me', (req, res) => res.json({ data: {
    id: state.nodeId, nombre: state.nodeName, tipo: state.nodeType, activo: state.active,
    efectivo_disponible: formatMoney(state.cash),
  } }));
  app.get('/api/accounts/:numero', (req, res) => {
    const account = state.accounts.get(req.params.numero);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });
    res.json({ numero_cuenta: req.params.numero, nombre_titular: account.name, saldo_global: formatMoney(account.balance), estado: account.status });
  });
  app.get('/api/transactions/by-idempotency-key/:key', (req, res) => {
    if (state.failLookup) return fail(res, 'UNAVAILABLE', 503);
    const result = state.operations.get(req.params.key);
    if (!result) return fail(res, 'OPERATION_NOT_FOUND', 404);
    res.json(result.data);
  });
  app.post('/api/transactions', async (req, res) => {
    state.postCount++;
    if (state.failPost) return fail(res, 'UNAVAILABLE', 503);
    const body = req.body;
    state.lastBody = structuredClone(body);
    const key = body.idempotency_key;
    if (typeof key !== 'string' || !key) return res.status(422).json({ errors: { idempotency_key: ['The idempotency key field is required.'] } });
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const previous = state.operations.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return fail(res, 'IDEMPOTENCY_CONFLICT', 409);
      return res.json(previous.data);
    }
    let amount;
    try { amount = positiveMoney(body.monto); }
    catch { return fail(res, 'VALIDATION_ERROR', 400); }
    const accountNumber = body.tipo === 'retiro' ? body.cuenta_origen : body.cuenta_destino;
    const account = state.accounts.get(accountNumber);
    let rejection;
    if (!['retiro', 'deposito'].includes(body.tipo)) rejection = 'VALIDATION_ERROR';
    else if (!account) rejection = 'ACCOUNT_NOT_FOUND';
    else if (account.status !== 'activa') rejection = 'ACCOUNT_BLOCKED';
    else if (body.tipo === 'retiro' && account.balance < amount) rejection = 'INSUFFICIENT_FUNDS';
    else if (body.tipo === 'retiro' && state.cash < amount) rejection = 'INSUFFICIENT_CASH';
    if (rejection) {
      const data = { status: 'rejected', idempotency_key: key, error: { code: rejection, message: rejection } };
      state.operations.set(key, { fingerprint, data });
      return res.status(422).json(data);
    }
    // This single-process simulator mutates synchronously before replying. NODE1 must use a DB transaction.
    const delta = body.tipo === 'retiro' ? -amount : amount;
    account.balance += delta;
    state.cash += delta;
    state.transactionCount++;
    const data = {
      message: 'Transacción exitosa', status: 'succeeded',
      transaction: {
        id: randomUUID(), nodo_id: state.nodeId, tipo: body.tipo, idempotency_key: key,
        cuenta_origen: body.tipo === 'retiro' ? accountNumber : null,
        cuenta_destino: body.tipo === 'deposito' ? accountNumber : null,
        monto: formatMoney(amount), created_at: new Date().toISOString(),
      },
      saldo_global: formatMoney(account.balance), efectivo_disponible: formatMoney(state.cash),
    };
    state.operations.set(key, { fingerprint, data });
    if (state.dropNextResponse) { state.dropNextResponse = false; return res.destroy(); }
    if (state.malformedNextResponse) {
      state.malformedNextResponse = false;
      return res.status(201).json({ ...data, transaction: { ...data.transaction, monto: '0.01' } });
    }
    if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
    res.status(201).json(data);
  });
  return { app, state, reset };
}
