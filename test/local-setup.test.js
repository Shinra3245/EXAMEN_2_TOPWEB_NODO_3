import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/setup-local.js', import.meta.url));
test('prepara integración separada con secretos privados sin modificar la demostración', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'node3-setup-'));
  try {
    await writeFile(join(cwd, '.env'), 'existing-demo-config');
    const args = [script, '--integration', '--central-url=https://central.example/api/'];
    const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const content = await readFile(join(cwd, '.env.integration'), 'utf8');
    assert.equal(await readFile(join(cwd, '.env'), 'utf8'), 'existing-demo-config');
    assert.match(content, /PORT=3004/);
    assert.match(content, /127\.0\.0\.1:55435\/atm_integration/);
    assert.match(content, /BANCO_CENTRAL_URL=https:\/\/central\.example\/api\n/);
    assert.match(content, /BANCO_CENTRAL_API_KEY=\n/);
    assert.match(content, /MOCK_CENTRAL_API_KEY=\n/);
    assert.equal((await stat(join(cwd, '.env.integration'))).mode & 0o777, 0o600);
    assert.equal((await stat(join(cwd, '.local-admin.integration.txt'))).mode & 0o777, 0o600);
    const password = (await readFile(join(cwd, '.local-admin.integration.txt'), 'utf8')).match(/Contraseña: (.+)/)[1];
    assert.ok(!result.stdout.includes(password));
    assert.equal(spawnSync(process.execPath, args, { cwd }).status, 1);
    assert.equal(await readFile(join(cwd, '.env.integration'), 'utf8'), content);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('rechaza configuración de integración sin URL efectiva o sin HTTPS antes de escribir archivos', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'node3-setup-'));
  try {
    for (const args of [[], ['--central-url=http://central.example']]) {
      const result = spawnSync(process.execPath, [script, '--integration', ...args], { cwd });
      assert.equal(result.status, 1);
      await assert.rejects(() => access(join(cwd, '.env.integration')));
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
