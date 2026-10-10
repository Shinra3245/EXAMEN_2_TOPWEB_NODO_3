import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseMoney, positiveMoney, formatMoney } from '../src/money.js';
import { encrypt, decrypt, hashPassword, verifyPassword } from '../src/security.js';
import { loadConfig } from '../src/config.js';

test('el dinero conserva centavos exactos y rechaza importes ambiguos', () => {
  assert.equal(parseMoney('0.10') + parseMoney('0.20'), 30n);
  assert.equal(formatMoney(parseMoney('9999999999999.99')), '9999999999999.99');
  assert.equal(formatMoney(parseMoney('000300.5')), '300.50');
  for (const value of ['-1', '0', '0.00', '1.001', '1e3', 'NaN', '', '1,000.00', '10000000000000', 300, null]) {
    assert.throws(() => positiveMoney(value));
  }
});
test('las API Keys cifradas rechazan manipulación y claves incorrectas', () => {
  const key = randomBytes(32).toString('hex');
  const secret = 'private-bank-node-api-key';
  const cipher = encrypt(secret, key);
  assert.ok(!cipher.includes(secret));
  assert.equal(decrypt(cipher, key), secret);
  assert.throws(() => decrypt(cipher, randomBytes(32).toString('hex')));
  const parts = cipher.split(':');
  parts[2] = (parts[2][0] === '0' ? '1' : '0') + parts[2].slice(1);
  assert.throws(() => decrypt(parts.join(':'), key));
});
test('la contraseña administrativa no se almacena como texto y el verificador es conservador', () => {
  const hash = hashPassword('only-a-test-password');
  assert.ok(!hash.includes('only-a-test-password'));
  assert.equal(verifyPassword('only-a-test-password', hash), true);
  assert.equal(verifyPassword('incorrect', hash), false);
  assert.equal(verifyPassword({}, hash), false);
  assert.equal(verifyPassword('x', 'malformed'), false);
});
test('producción exige HTTPS y secretos completos; desarrollo permite el simulador local', () => {
  const env = {
    DATABASE_URL: 'postgres://test:test@localhost/atm_test', BANCO_CENTRAL_URL: 'http://127.0.0.1:4001/api',
    ADMIN_PASSWORD_HASH: hashPassword('test-password'), SESSION_SECRET: 's'.repeat(48), CONFIG_ENCRYPTION_KEY: 'a'.repeat(64),
  };
  assert.equal(loadConfig(env).port, 3003);
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, SESSION_SECRET: '' }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ...env, CONFIG_ENCRYPTION_KEY: 'short' }));
  assert.throws(() => loadConfig({ ...env, BANCO_CENTRAL_URL: 'https://user:secret@example.com/api' }));
  assert.throws(() => loadConfig({ ...env, CENTRAL_TIMEOUT_MS: '0' }));
  assert.equal(loadConfig({ ...env, RENDER_EXTERNAL_URL: 'https://node3-atm.onrender.com' }).publicOrigin, 'https://node3-atm.onrender.com');
  assert.throws(() => loadConfig({ ...env, APP_URL: 'https://user:secret@example.com' }));
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production', BANCO_CENTRAL_URL: 'https://central.example', APP_URL: 'http://atm.example' }));
});

test('normaliza la URL del Banco Central con un solo sufijo /api', async () => {
  const { normalizeCentralUrl } = await import('../src/central-url.js');
  for (const input of ['https://central.example', 'https://central.example/', 'https://central.example/api', 'https://central.example/api/', 'https://central.example/api/api/']) {
    assert.equal(normalizeCentralUrl(input), 'https://central.example/api');
  }
  assert.equal(normalizeCentralUrl('https://central.example/banco/'), 'https://central.example/banco/api');
  for (const input of ['ftp://central.example', 'https://user:secret@central.example', 'https://central.example?key=secret', 'https://central.example/#fragment']) {
    assert.throws(() => normalizeCentralUrl(input));
  }
});
