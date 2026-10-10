import pg from 'pg';
import { readFile } from 'node:fs/promises';

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 10000 });
}

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('node3-atm-migrations'))");
    await client.query(await readFile(new URL('../sql/001_atm.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function transaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
