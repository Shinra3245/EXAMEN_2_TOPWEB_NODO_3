import { describe, before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { BankClient } from '../src/bank-client.js';
import { createMockBank } from '../dev/mock-bank.js';

const operation = () => ({
  idempotency_key: randomUUID(), node_id: 'd6f9d760-e639-46ed-8dfb-74263740fdbe',
  tipo: 'retiro', numero_cuenta: '0010001', amount_cents: '30000',
});
const receipt = op => ({
  message: 'Transacción exitosa', status: 'succeeded',
  transaction: {
    id: randomUUID(), nodo_id: op.node_id, tipo: op.tipo, idempotency_key: op.idempotency_key,
    cuenta_origen: op.numero_cuenta, cuenta_destino: null, monto: '300.00', created_at: new Date().toISOString(),
  },
  saldo_global: '700.00', efectivo_disponible: '4700.00',
});

describe('adaptador del contrato Laravel de NODE1', () => {
  let server, client, reply, captured;
  const apiKey = 'private-test-api-key-not-for-client';
  before(async () => {
    server = createServer(async (req, res) => {
      let text = '';
      for await (const chunk of req) text += chunk;
      captured = { path: req.url, headers: req.headers, body: text ? JSON.parse(text) : null };
      res.writeHead(reply.status, { 'Content-Type': reply.html ? 'text/html' : 'application/json' });
      res.end(reply.html || JSON.stringify(reply.body));
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    client = new BankClient({ centralUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 1000 });
  });
  beforeEach(() => { reply = { status: 200, body: {} }; captured = null; });
  after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

  test('lee la cuenta sin data y conserva sus ceros iniciales', async () => {
    reply.body = { numero_cuenta: '0010001', nombre_titular: 'Prueba', saldo_global: '1000.00', estado: 'activa' };
    assert.equal((await client.getBalance(apiKey, '0010001')).saldo_global, '1000.00');
    assert.equal(captured.path, '/api/accounts/0010001');
    assert.equal(captured.headers['x-api-key'], apiKey);
  });
  test('normaliza 404, 401 y 422 de Laravel sin exponer sus mensajes internos', async () => {
    reply = { status: 404, body: { message: 'Cuenta no encontrada' } };
    await assert.rejects(() => client.getBalance(apiKey, 'missing'), { code: 'ACCOUNT_NOT_FOUND' });
    reply = { status: 401, body: { error: 'Invalid or inactive API Key' } };
    await assert.rejects(() => client.getBalance(apiKey, '0010001'), { code: 'INVALID_API_KEY' });
    reply = { status: 422, body: { errors: { monto: ['private database detail'] } } };
    await assert.rejects(() => client.getBalance(apiKey, '0010001'), error => error.code === 'VALIDATION_ERROR' && !error.message.includes('private database detail'));
  });
  test('la configuración usa metadata mínima sin flags de capacidades inventadas', async () => {
    reply.body = { data: { id: operation().node_id, nombre: 'Cajero', tipo: 'cajero', activo: true, efectivo_disponible: '5000.00' } };
    assert.equal((await client.getNode(apiKey)).cash, '5000.00');
    reply.body.data.tipo = 'sucursal';
    await assert.rejects(() => client.getNode(apiKey), { code: 'INVALID_ATM_NODE' });
    reply = { status: 404, body: { message: 'Not Found' } };
    await assert.rejects(() => client.getNode(apiKey), { code: 'CENTRAL_CONTRACT_PENDING' });
  });
  test('envía clave en JSON y acepta 201 nuevo y 200 repetido con el mismo comprobante', async () => {
    const op = operation();
    reply = { status: 201, body: receipt(op) };
    const first = await client.send(apiKey, op);
    assert.deepEqual(captured.body, { tipo: 'retiro', monto: '300.00', idempotency_key: op.idempotency_key, cuenta_origen: '0010001' });
    assert.equal(captured.headers['idempotency-key'], undefined);
    reply.status = 200;
    assert.deepEqual(await client.send(apiKey, op), first);
  });
  test('el depósito envía solo cuenta destino', async () => {
    const op = { ...operation(), tipo: 'deposito' };
    reply = { status: 201, body: receipt(op) };
    reply.body.transaction.cuenta_origen = null;
    reply.body.transaction.cuenta_destino = op.numero_cuenta;
    await client.send(apiKey, op);
    assert.equal(captured.body.cuenta_destino, op.numero_cuenta);
    assert.equal(captured.body.cuenta_origen, undefined);
  });
  test('no confirma transacciones ajenas, claves distintas ni recibos incompletos', async () => {
    const op = operation();
    const mutations = [
      data => { delete data.transaction.idempotency_key; },
      data => { data.transaction.idempotency_key = randomUUID(); },
      data => { data.transaction.nodo_id = randomUUID(); },
      data => { data.transaction.tipo = 'deposito'; },
      data => { data.transaction.cuenta_origen = 'another-account'; },
      data => { data.transaction.cuenta_destino = 'another-account'; },
      data => { data.transaction.monto = '301.00'; },
      data => { data.transaction.created_at = 'invalid'; },
      data => { delete data.saldo_global; },
      data => { delete data.efectivo_disponible; },
      data => { delete data.status; },
    ];
    for (const mutate of mutations) {
      reply = { status: 201, body: receipt(op) };
      mutate(reply.body);
      await assert.rejects(() => client.send(apiKey, op), { code: 'CENTRAL_PROTOCOL_ERROR' });
    }
  });
  test('errores antiguos de movimiento no equivalen a un rechazo recuperable', async () => {
    for (const response of [
      { status: 400, body: { message: 'Error al procesar la transacción', error: 'duplicate key value' } },
      { status: 422, body: { errors: { idempotency_key: ['Required'] } } },
      { status: 401, body: { error: 'Invalid or inactive API Key' } },
      { status: 409, body: { error: { code: 'IDEMPOTENCY_CONFLICT' } } },
      { status: 503, body: { error: 'Unavailable' } },
    ]) {
      reply = response;
      await assert.rejects(() => client.send(apiKey, operation()));
    }
  });
  test('solo reconoce rechazos definitivos vinculados a la misma clave', async () => {
    const op = operation();
    reply = { status: 422, body: { status: 'rejected', idempotency_key: op.idempotency_key, error: { code: 'INSUFFICIENT_FUNDS' } } };
    assert.equal((await client.send(apiKey, op)).status, 'rejected');
    reply.body.idempotency_key = randomUUID();
    await assert.rejects(() => client.send(apiKey, op));
  });
  test('solo un 404 con OPERATION_NOT_FOUND permite reenviar', async () => {
    const op = operation();
    reply = { status: 404, body: { error: { code: 'OPERATION_NOT_FOUND' } } };
    assert.equal((await client.lookup(apiKey, op)).status, 'not_found');
    assert.equal(captured.path, `/api/transactions/by-idempotency-key/${op.idempotency_key}`);
    reply = { status: 404, body: { message: 'Not Found' } };
    await assert.rejects(() => client.lookup(apiKey, op));
    reply = { status: 404, html: '<html>Not Found</html>' };
    await assert.rejects(() => client.lookup(apiKey, op));
    reply = { status: 401, body: { error: 'Invalid or inactive API Key' } };
    await assert.rejects(() => client.lookup(apiKey, op));
  });
  test('202 pending conserva la reserva y no fabrica comprobantes', async () => {
    reply = { status: 202, body: { status: 'pending' } };
    assert.deepEqual(await client.send(apiKey, operation()), { status: 'pending' });
  });
});

test('el simulador resuelve repeticiones concurrentes y conflictos con el contrato acordado', async () => {
  const bank = createMockBank();
  const server = bank.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const client = new BankClient({ centralUrl: `http://127.0.0.1:${server.address().port}/api/`, timeoutMs: 1000 });
    const op = { ...operation(), numero_cuenta: '10001' };
    const results = await Promise.all([client.send(bank.state.apiKey, op), client.send(bank.state.apiKey, op)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(bank.state.transactionCount, 1);
    assert.equal(bank.state.accounts.get('10001').balance, 70000n);
    await assert.rejects(() => client.send(bank.state.apiKey, { ...op, amount_cents: '30100' }));
    bank.state.accounts.get('10001').balance += 10000n;
    assert.deepEqual(await client.lookup(bank.state.apiKey, op), results[0]);
    assert.equal(bank.state.transactionCount, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
