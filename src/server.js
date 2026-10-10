import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { BankClient } from './bank-client.js';
import { AtmService } from './atm-service.js';
import { createApp } from './app.js';

let pool;
try {
  const config = loadConfig();
  pool = createPool(config.databaseUrl);
  pool.on('error', () => console.warn('La conexión a PostgreSQL necesita restablecerse.'));
  await migrate(pool);
  const service = new AtmService(pool, new BankClient(config), config.encryptionKey);
  const app = createApp({ config, pool, service });
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`NODE3 disponible en el puerto ${config.port}. Modo de cliente: simulación.`));
  (async () => {
    try {
      if (config.bootstrapApiKey && !(await service.publicStatus()).configured) await service.configure(config.bootstrapApiKey);
      await service.recoverPending();
    } catch (error) { console.warn('Configuración o recuperación inicial pendiente:', error.code || 'INITIALIZATION_ERROR'); }
  })();
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log('Cerrando NODE3; las operaciones pendientes permanecen guardadas.');
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 20000).unref();
  });
} catch (error) {
  console.error('No se pudo iniciar NODE3:', error.message?.startsWith('Falta configurar') || /^(CONFIG_|SESSION_|ADMIN_|BANCO_|El Banco|PORT|CENTRAL_)/.test(error.message || '') ? error.message : 'Revisa la configuración y la conexión a PostgreSQL.');
  if (pool) await pool.end();
  process.exitCode = 1;
}
