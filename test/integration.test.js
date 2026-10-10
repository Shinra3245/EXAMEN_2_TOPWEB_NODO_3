import { describe, before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import request from 'supertest';
import { createPool, migrate } from '../src/db.js';
import { BankClient } from '../src/bank-client.js';
import { AtmService } from '../src/atm-service.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';
import { createMockBank } from '../dev/mock-bank.js';

describe('NODE3 con PostgreSQL real y Banco Central simulado', { skip: !process.env.TEST_DATABASE_URL }, () => {
  let adminPool, pool, bank, server, service, app, config, schema;
  const body = (monto = '300.00') => ({ numero_cuenta: '10001', monto });
  const post = (tipo = 'retiros', monto = '300.00', key = randomUUID()) => request(app).post(`/api/${tipo}`).set('Idempotency-Key', key).send(body(monto));
  const csrf = html => html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1];
  async function login(agent) {
    const page = await agent.get('/admin/login').expect(200);
    return agent.post('/admin/login').type('form').send({ username: 'tecnico', password: 'only-for-automated-tests', _csrf: csrf(page.text) }).expect(302);
  }
  before(async () => {
    schema = `node3_test_${randomBytes(8).toString('hex')}`;
    adminPool = createPool(process.env.TEST_DATABASE_URL);
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 5 });
    await migrate(pool);
    bank = createMockBank();
    server = bank.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    config = {
      centralUrl: `http://127.0.0.1:${server.address().port}/api`, timeoutMs: 2000,
      encryptionKey: randomBytes(32).toString('hex'), sessionSecret: randomBytes(48).toString('hex'),
      adminUsername: 'tecnico', adminPasswordHash: hashPassword('only-for-automated-tests'), production: false,
    };
  });
  beforeEach(async () => {
    bank.reset();
    await pool.query('TRUNCATE atm_operations, atm_sessions');
    await pool.query('UPDATE atm_settings SET node_id=NULL,node_name=NULL,api_key_ciphertext=NULL,cash_cents=0,active_operation_id=NULL WHERE id=1');
    service = new AtmService(pool, new BankClient(config), config.encryptionKey);
    app = createApp({ config, pool, service });
    await service.configure(bank.state.apiKey);
  });
  after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (pool) await pool.end();
    if (adminPool && schema) await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (adminPool) await adminPool.end();
  });

  test('flujo del examen: 1000 -> retiro 300 -> 700, efectivo 4700 y una transacción', async () => {
    const balance = await request(app).get('/api/accounts/10001/saldo').expect(200);
    assert.equal(balance.body.data.saldo_global, '1000.00');
    const result = await post().expect(200);
    assert.equal(result.body.data.status, 'succeeded');
    assert.equal(result.body.data.receipt.saldo_global, '700.00');
    assert.equal(result.body.data.receipt.efectivo_disponible, '4700.00');
    assert.equal(bank.state.transactionCount, 1);
    assert.equal(bank.state.lastBody.idempotency_key, result.body.data.idempotency_key);
    assert.equal(bank.state.lastBody.cuenta_origen, '10001');
    assert.equal(bank.state.lastBody.cuenta_destino, undefined);
    assert.equal((await service.adminStatus()).efectivo_confirmado, '4700.00');
  });
  test('el depósito acredita cuenta destino y aumenta el efectivo disponible', async () => {
    const result = await post('depositos', '200.00').expect(200);
    assert.equal(result.body.data.receipt.saldo_global, '1200.00');
    assert.equal(result.body.data.receipt.efectivo_disponible, '5200.00');
    const central = [...bank.state.operations.values()][0].data.transaction;
    assert.equal(central.cuenta_origen, null);
    assert.equal(central.cuenta_destino, '10001');
  });
  test('rechaza efectivo insuficiente localmente sin enviar el movimiento al banco', async () => {
    const result = await post('retiros', '6000.00').expect(422);
    assert.equal(result.body.data.error.code, 'LOCAL_INSUFFICIENT_CASH');
    assert.equal(bank.state.postCount, 0);
    assert.equal((await service.adminStatus()).efectivo_confirmado, '5000.00');
  });
  test('un rechazo central definitivo libera la reserva y conserva saldos', async () => {
    const result = await post('retiros', '1100.00').expect(422);
    assert.equal(result.body.data.error.code, 'INSUFFICIENT_FUNDS');
    assert.equal((await service.adminStatus()).efectivo_disponible, '5000.00');
    assert.equal((await service.publicStatus()).available, true);
    assert.equal(bank.state.transactionCount, 0);
  });
  test('cuentas inexistentes y bloqueadas se rechazan sin alterar saldo o efectivo', async () => {
    await request(app).get('/api/accounts/not-found/saldo').expect(422);
    bank.state.accounts.get('10001').status = 'bloqueada';
    await request(app).get('/api/accounts/10001/saldo').expect(422);
    const result = await post().expect(422);
    assert.equal(result.body.data.error.code, 'ACCOUNT_BLOCKED');
    assert.equal(bank.state.transactionCount, 0);
  });
  test('doble clic/reintentos simultáneos conservan una sola transacción', async () => {
    const key = randomUUID();
    const results = await Promise.all([post('retiros', '300.00', key), post('retiros', '300.00', key)]);
    assert.ok(results.every(r => r.status === 200));
    assert.equal(results[0].body.data.id, results[1].body.data.id);
    assert.equal(bank.state.transactionCount, 1);
    const retry = await post('retiros', '300.00', key).expect(200);
    assert.equal(retry.body.data.receipt.saldo_global, '700.00');
    await post('retiros', '301.00', key).expect(409);
    assert.equal(bank.state.transactionCount, 1);
  });
  test('peticiones concurrentes distintas no gastan dos veces el mismo efectivo', async () => {
    bank.state.cash = 50000n;
    await service.synchronize();
    const results = await Promise.all([post('retiros', '400.00'), post('retiros', '400.00')]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.ok(results.some(r => [409, 422].includes(r.status)));
    assert.equal(bank.state.transactionCount, 1);
    assert.equal((await service.adminStatus()).efectivo_disponible, '100.00');
  });
  test('pérdida de respuesta después del débito conserva reserva y recupera sin duplicar', async () => {
    bank.state.dropNextResponse = true;
    const result = await post().expect(202);
    const id = result.body.data.id;
    assert.equal((await service.adminStatus()).efectivo_confirmado, '5000.00');
    assert.equal((await service.adminStatus()).efectivo_disponible, '4700.00');
    await assert.rejects(() => service.synchronize(), { code: 'ATM_BUSY' });
    await assert.rejects(() => service.configure(bank.state.apiKey), { code: 'ATM_BUSY' });
    const recovered = await request(app).get(`/api/operaciones/${id}`).expect(200);
    assert.equal(recovered.body.data.receipt.saldo_global, '700.00');
    assert.equal(bank.state.transactionCount, 1);
    assert.equal((await service.adminStatus()).efectivo_confirmado, '4700.00');
  });
  test('un timeout real conserva la operación y permite consultar la aprobación', async () => {
    bank.state.delayMs = 350;
    service.bank.timeoutMs = 100;
    const result = await post().expect(202);
    service.bank.timeoutMs = 2000;
    const recovered = await request(app).get(`/api/operaciones/${result.body.data.id}`).expect(200);
    assert.equal(recovered.body.data.status, 'succeeded');
    assert.equal(bank.state.transactionCount, 1);
  });
  test('si el banco no recibió el POST se reenvía la misma clave después de consultar', async () => {
    bank.state.failPost = true;
    const result = await post().expect(202);
    assert.equal(bank.state.transactionCount, 0);
    bank.state.failPost = false;
    const recovered = await request(app).get(`/api/operaciones/${result.body.data.id}`).expect(200);
    assert.equal(recovered.body.data.status, 'succeeded');
    assert.equal(bank.state.transactionCount, 1);
    assert.equal(bank.state.operations.size, 1);
  });
  test('una respuesta aprobada con datos incompatibles queda pendiente hasta validarse', async () => {
    bank.state.malformedNextResponse = true;
    const result = await post().expect(202);
    assert.equal((await service.publicStatus()).available, false);
    const recovered = await request(app).get(`/api/operaciones/${result.body.data.id}`).expect(200);
    assert.equal(recovered.body.data.receipt.monto, '300.00');
    assert.equal(bank.state.transactionCount, 1);
  });
  test('fallo de almacenamiento tras aprobación central se recupera al recrear el servicio', async () => {
    const apply = service.apply;
    service.apply = async () => { throw new Error('simulated local storage failure'); };
    const result = await post().expect(202);
    service.apply = apply;
    const restarted = new AtmService(pool, new BankClient(config), config.encryptionKey);
    await restarted.recoverPending();
    assert.equal((await restarted.getOperation(result.body.data.id)).status, 'succeeded');
    assert.equal(bank.state.transactionCount, 1);
    await migrate(pool);
    assert.equal((await restarted.adminStatus()).efectivo_confirmado, '4700.00');
  });
  test('API Key revocada o lookup inaccesible no libera una operación incierta', async () => {
    bank.state.dropNextResponse = true;
    const result = await post().expect(202);
    bank.state.apiKey = 'rotated-api-key-for-tests';
    const pending = await request(app).get(`/api/operaciones/${result.body.data.id}`).expect(202);
    assert.equal(pending.body.data.status, 'pending');
    assert.equal((await service.adminStatus()).efectivo_disponible, '4700.00');
    await post('depositos', '100.00').expect(409);
  });
  test('solo activa cajeros y no permite cambiar la identidad del nodo', async () => {
    bank.state.nodeType = 'sucursal';
    await assert.rejects(() => service.configure(bank.state.apiKey), { code: 'INVALID_ATM_NODE' });
    bank.state.nodeType = 'cajero';
    bank.state.nodeId = randomUUID();
    await assert.rejects(() => service.configure(bank.state.apiKey), { code: 'ATM_IDENTITY_MISMATCH' });
    const cipher = (await service.settings()).api_key_ciphertext;
    assert.ok(!cipher.includes(bank.state.apiKey));
  });
  test('la configuración y el efectivo sobreviven a un nuevo servicio sin volver a cargar el importe inicial', async () => {
    await post().expect(200);
    const restarted = new AtmService(pool, new BankClient(config), config.encryptionKey);
    const saved = await restarted.adminStatus();
    assert.equal(saved.node_id, bank.state.nodeId);
    assert.equal(saved.efectivo_confirmado, '4700.00');
    assert.equal((await restarted.balance('10001')).saldo_global, '700.00');
  });
  test('la recuperación devuelve el comprobante original aunque otra operación cambie el saldo', async () => {
    bank.state.dropNextResponse = true;
    const first = await post().expect(202);
    // Simulate an independently authorized central account change, after this operation committed.
    bank.state.accounts.get('10001').balance += 10000n;
    const recovered = await request(app).get(`/api/operaciones/${first.body.data.id}`).expect(200);
    assert.equal(recovered.body.data.receipt.saldo_global, '700.00');
    assert.equal((await service.balance('10001')).saldo_global, '800.00');
    assert.equal(bank.state.transactionCount, 1);
  });
  test('validación rechaza importes, JSON y claves inválidas antes de mutar', async () => {
    for (const amount of ['-1', '0', '1.001', '1e3']) await post('retiros', amount).expect(422);
    await request(app).post('/api/retiros').send(body()).expect(422);
    await request(app).post('/api/retiros').set('Content-Type', 'application/json').send('{invalid').expect(400);
    await request(app).post('/api/retiros').type('form').send(body()).expect(415);
    await request(app).get('/api/operaciones/not-a-uuid').expect(404);
    assert.equal(bank.state.postCount, 0);
  });
  test('el panel requiere sesión, valida CSRF, conserva sesión en PostgreSQL y nunca muestra secretos', async () => {
    await request(app).get('/admin').expect(302);
    await request(app).post('/admin/configuracion').type('form').send({ api_key: bank.state.apiKey }).expect(302);
    const agent = request.agent(app);
    await login(agent);
    const page = await agent.get('/admin').expect(200);
    assert.ok(page.text.includes('5000.00'));
    assert.ok(!page.text.includes(bank.state.apiKey));
    assert.ok(!page.text.includes(config.encryptionKey));
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM atm_sessions')).rows[0].count), 1);
    await agent.post('/admin/sincronizar').type('form').send({ _csrf: 'ñ'.repeat(64) }).expect(403);
    await agent.post('/admin/sincronizar').type('form').send({ _csrf: csrf(page.text) }).expect(200);
    await agent.post('/admin/logout').type('form').send({ _csrf: csrf(page.text) }).expect(302);
    await agent.get('/admin').expect(302);
  });
  test('cabeceras, origen, pantallas y health se entregan sin revelar configuración privada', async () => {
    const home = await request(app).get('/').expect(200);
    assert.ok(home.text.includes('Tu cajero automático'));
    assert.ok(home.headers['content-security-policy']);
    assert.equal(home.headers['x-powered-by'], undefined);
    await request(app).get('/health').expect(200);
    await request(app).get('/assets/atm.js').expect(200);
    await request(app).get('/assets/styles.css').expect(200);
    const status = await request(app).get('/api/atm').expect(200);
    assert.equal(status.body.data.mode, 'simulacion');
    assert.ok(!JSON.stringify(status.body).includes(bank.state.apiKey));
    await request(app).post('/api/retiros').set('Origin', 'https://untrusted.example').set('Idempotency-Key', randomUUID()).send(body()).expect(403);
    await request(app).get('/.env').expect(404);
  });
});
