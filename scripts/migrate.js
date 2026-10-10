import { createPool, migrate } from '../src/db.js';
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
const pool = createPool(process.env.DATABASE_URL);
try { await migrate(pool); console.log('Esquema propio de NODE3 preparado.'); }
finally { await pool.end(); }
