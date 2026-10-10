import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { hashPassword } from '../src/security.js';
import { normalizeCentralUrl } from '../src/central-url.js';

const integration = process.argv.includes('--integration');
const envFile = integration ? '.env.integration' : '.env';
const adminFile = integration ? '.local-admin.integration.txt' : '.local-admin.txt';
let centralUrl = 'http://127.0.0.1:4001/api';
if (integration) {
  const value = process.argv.find(arg => arg.startsWith('--central-url='))?.slice('--central-url='.length);
  if (!value) throw new Error('Indica la URL real: npm run setup:integration -- --central-url=https://tu-banco.example');
  centralUrl = normalizeCentralUrl(value);
  if (new URL(centralUrl).protocol !== 'https:') throw new Error('La integración real exige una URL HTTPS.');
}
for (const file of [envFile, adminFile]) {
  try { await access(file); console.error(`Ya existe ${file}. Se conserva la configuración actual.`); process.exit(1); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const databasePassword = randomBytes(24).toString('hex');
const adminPassword = randomBytes(18).toString('base64url');
const mockKey = randomBytes(32).toString('hex');
const content = [
  'NODE_ENV=development', `PORT=${integration ? 3004 : 3003}`,
  `DATABASE_URL=postgresql://atm_local:${databasePassword}@127.0.0.1:${integration ? 55435 : 55434}/${integration ? 'atm_integration' : 'atm_local'}`,
  `LOCAL_DATABASE_PASSWORD=${databasePassword}`, `BANCO_CENTRAL_URL=${centralUrl}`,
  `BANCO_CENTRAL_API_KEY=${integration ? '' : mockKey}`, `MOCK_CENTRAL_API_KEY=${integration ? '' : mockKey}`,
  'CENTRAL_TIMEOUT_MS=10000', 'ADMIN_USERNAME=tecnico', `ADMIN_PASSWORD_HASH=${hashPassword(adminPassword)}`,
  `SESSION_SECRET=${randomBytes(48).toString('hex')}`, `CONFIG_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`, '',
].join('\n');
await writeFile(envFile, content, { mode: 0o600, flag: 'wx' });
await writeFile(adminFile, `Usuario: tecnico\nContraseña: ${adminPassword}\nSolo para desarrollo local. No compartir ni subir a Git.\n`, { mode: 0o600, flag: 'wx' });
console.log(`Configuración ${integration ? 'de integración separada' : 'local'} creada. La contraseña está en ${adminFile} (archivo privado e ignorado por Git).`);
