import { normalizeCentralUrl } from './central-url.js';

export function loadConfig(env = process.env) {
  const required = ['DATABASE_URL', 'BANCO_CENTRAL_URL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'CONFIG_ENCRYPTION_KEY'];
  for (const name of required) if (!env[name]) throw new Error(`Falta configurar ${name}. Consulta .env.example.`);
  if (!/^[a-f0-9]{64}$/.test(env.CONFIG_ENCRYPTION_KEY)) throw new Error('CONFIG_ENCRYPTION_KEY debe contener 32 bytes en hexadecimal.');
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.ADMIN_PASSWORD_HASH)) throw new Error('ADMIN_PASSWORD_HASH no tiene el formato esperado.');
  const url = new URL(normalizeCentralUrl(env.BANCO_CENTRAL_URL));
  const production = env.NODE_ENV === 'production';
  if (production && url.protocol !== 'https:') throw new Error('El Banco Central debe utilizar HTTPS en producción.');
  const port = Number(env.PORT || 3003);
  const timeoutMs = Number(env.CENTRAL_TIMEOUT_MS || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error('CENTRAL_TIMEOUT_MS inválido.');
  return {
    databaseUrl: env.DATABASE_URL,
    centralUrl: url.toString().replace(/\/$/, ''),
    bootstrapApiKey: env.BANCO_CENTRAL_API_KEY || '',
    encryptionKey: env.CONFIG_ENCRYPTION_KEY,
    sessionSecret: env.SESSION_SECRET,
    adminUsername: env.ADMIN_USERNAME || 'tecnico',
    adminPasswordHash: env.ADMIN_PASSWORD_HASH,
    port, timeoutMs, production,
  };
}
