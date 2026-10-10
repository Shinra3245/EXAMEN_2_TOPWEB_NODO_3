import { randomUUID, createHash } from 'node:crypto';
import { transaction } from './db.js';
import { decrypt, encrypt } from './security.js';
import { AppError, invariant } from './errors.js';
import { formatMoney, parseMoney, positiveMoney } from './money.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function accountNumber(value) {
  invariant(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 255 && !/[\x00-\x1f\x7f]/.test(value),
    'INVALID_ACCOUNT', 'Ingresa un número de cuenta válido.', 422);
  return value.trim();
}

export class AtmService {
  constructor(pool, bank, encryptionKey) {
    this.pool = pool;
    this.bank = bank;
    this.encryptionKey = encryptionKey;
    this.inFlight = new Map();
  }

  async settings() {
    return (await this.pool.query('SELECT * FROM atm_settings WHERE id = 1')).rows[0];
  }

  async publicStatus() {
    const row = await this.settings();
    return { configured: Boolean(row?.node_id), available: Boolean(row?.node_id && !row.active_operation_id), mode: 'simulacion' };
  }

  async adminStatus() {
    const row = await this.settings();
    const pending = row.active_operation_id ? await this.getOperation(row.active_operation_id, false) : null;
    return {
      configured: Boolean(row.node_id), node_id: row.node_id, nombre: row.node_name,
      efectivo_confirmado: formatMoney(row.cash_cents),
      efectivo_disponible: formatMoney(BigInt(row.cash_cents) - (pending?.tipo === 'retiro' ? parseMoney(pending.monto) : 0n)),
      api_key_configurada: Boolean(row.api_key_ciphertext), pending,
      updated_at: row.updated_at,
    };
  }

  key(row) {
    invariant(row?.node_id && row.api_key_ciphertext, 'ATM_NOT_CONFIGURED', 'El técnico debe configurar la conexión del cajero.', 503);
    try { return decrypt(row.api_key_ciphertext, this.encryptionKey); }
    catch { throw new AppError('CONFIG_DECRYPTION_FAILED', 'No se pudo abrir la configuración. Verifica la clave de cifrado del servidor.', 503); }
  }

  async configure(apiKey) {
    invariant(typeof apiKey === 'string' && apiKey.trim().length >= 16 && apiKey.trim().length <= 512 && !/[\r\n]/.test(apiKey),
      'INVALID_API_KEY', 'Ingresa una API Key válida proporcionada por el Banco Central.', 422);
    return transaction(this.pool, async client => {
      const row = (await client.query('SELECT * FROM atm_settings WHERE id = 1 FOR UPDATE')).rows[0];
      const node = await this.bank.getNode(apiKey.trim());
      invariant(!row.node_id || row.node_id === node.id, 'ATM_IDENTITY_MISMATCH', 'La nueva API Key debe pertenecer al mismo cajero configurado.', 409);
      // Rotation must allow recovery after revocation of the previous key. A pending
      // receipt may describe earlier cash, so preserve the local reservation until recovery.
      await client.query('UPDATE atm_settings SET node_id=$1, node_name=$2, api_key_ciphertext=$3, cash_cents=$4, updated_at=NOW() WHERE id=1',
        [node.id, node.nombre, encrypt(apiKey.trim(), this.encryptionKey), row.active_operation_id ? row.cash_cents : String(parseMoney(node.cash))]);
      return { node_id: node.id, nombre: node.nombre, efectivo_disponible: row.active_operation_id ? formatMoney(row.cash_cents) : node.cash };
    });
  }

  async synchronize() {
    return transaction(this.pool, async client => {
      const row = (await client.query('SELECT * FROM atm_settings WHERE id = 1 FOR UPDATE')).rows[0];
      invariant(!row.active_operation_id, 'ATM_BUSY', 'No se puede sincronizar mientras haya una operación pendiente.', 409);
      const node = await this.bank.getNode(this.key(row));
      invariant(row.node_id === node.id, 'ATM_IDENTITY_MISMATCH', 'La clave configurada pertenece a otro cajero.', 409);
      await client.query('UPDATE atm_settings SET cash_cents=$1,node_name=$2,updated_at=NOW() WHERE id=1', [String(parseMoney(node.cash)), node.nombre]);
      return { efectivo_disponible: node.cash };
    });
  }

  async balance(account) {
    return this.bank.getBalance(this.key(await this.settings()), accountNumber(account));
  }

  view(row) {
    return {
      id: row.id, idempotency_key: row.idempotency_key, tipo: row.tipo,
      numero_cuenta: row.numero_cuenta, monto: formatMoney(row.amount_cents),
      status: row.status, receipt: row.receipt,
      error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
      created_at: row.created_at,
    };
  }

  async prepare(tipo, body, idempotencyKey) {
    invariant(['retiro', 'deposito'].includes(tipo), 'INVALID_TYPE', 'Operación no admitida.', 422);
    invariant(typeof idempotencyKey === 'string' && uuid.test(idempotencyKey), 'INVALID_IDEMPOTENCY_KEY', 'Incluye una clave UUID válida en Idempotency-Key.', 422);
    const account = accountNumber(body?.numero_cuenta);
    const cents = positiveMoney(body?.monto);
    const fingerprint = createHash('sha256').update(JSON.stringify([tipo, account, String(cents)])).digest('hex');
    return transaction(this.pool, async client => {
      const settings = (await client.query('SELECT * FROM atm_settings WHERE id=1 FOR UPDATE')).rows[0];
      this.key(settings);
      const existing = (await client.query('SELECT * FROM atm_operations WHERE idempotency_key=$1', [idempotencyKey])).rows[0];
      if (existing) {
        invariant(existing.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'Esta clave ya se utilizó con otros datos.', 409);
        return { row: existing, created: false };
      }
      invariant(!settings.active_operation_id, 'ATM_BUSY', 'El cajero está confirmando otra operación. Intenta de nuevo cuando termine.', 409);
      const insufficient = tipo === 'retiro' && BigInt(settings.cash_cents) < cents;
      const result = await client.query(`INSERT INTO atm_operations
        (id,idempotency_key,fingerprint,node_id,tipo,numero_cuenta,amount_cents,status,error_code,error_message)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [randomUUID(), idempotencyKey, fingerprint, settings.node_id, tipo, account, String(cents),
        insufficient ? 'rejected' : 'pending', insufficient ? 'LOCAL_INSUFFICIENT_CASH' : null,
        insufficient ? 'El cajero no tiene efectivo suficiente para este retiro.' : null]);
      const row = result.rows[0];
      if (!insufficient) await client.query('UPDATE atm_settings SET active_operation_id=$1,updated_at=NOW() WHERE id=1', [row.id]);
      return { row, created: true };
    });
  }

  async apply(operationId, result) {
    if (result.status === 'pending') return;
    await transaction(this.pool, async client => {
      const settings = (await client.query('SELECT * FROM atm_settings WHERE id=1 FOR UPDATE')).rows[0];
      const row = (await client.query('SELECT * FROM atm_operations WHERE id=$1 FOR UPDATE', [operationId])).rows[0];
      if (!row || row.status !== 'pending') return;
      invariant(settings.active_operation_id === row.id, 'LOCAL_STATE_CONFLICT', 'La operación necesita revisión del técnico.', 503);
      if (result.status === 'succeeded') {
        await client.query("UPDATE atm_operations SET status='succeeded',receipt=$2,updated_at=NOW() WHERE id=$1", [row.id, result.receipt]);
        await client.query('UPDATE atm_settings SET cash_cents=$1,active_operation_id=NULL,updated_at=NOW() WHERE id=1', [String(parseMoney(result.receipt.efectivo_disponible))]);
      } else if (result.status === 'rejected') {
        await client.query("UPDATE atm_operations SET status='rejected',error_code=$2,error_message=$3,updated_at=NOW() WHERE id=$1", [row.id, result.code, result.message]);
        await client.query('UPDATE atm_settings SET active_operation_id=NULL,updated_at=NOW() WHERE id=1');
      }
    });
  }

  async attempt(row, initial = false) {
    if (row.status !== 'pending') return;
    // Coalesce callers in this process. The bank's idempotency contract also protects restarts.
    if (this.inFlight.has(row.id)) return this.inFlight.get(row.id);
    const work = (async () => {
      try {
        const settings = await this.settings();
        const key = this.key(settings);
        let result = initial ? await this.bank.send(key, row) : await this.bank.lookup(key, row);
        if (result.status === 'not_found') {
          result = await this.bank.send(key, row);
          // A replay's authentication/validation rejection alone cannot settle an older request.
          if (result.status === 'rejected') result = await this.bank.lookup(key, row);
        }
        await this.apply(row.id, result);
      } catch (error) {
        // Keep the durable reservation on network, protocol or storage failure.
        console.warn('Operación pendiente de confirmación:', error.code || 'LOCAL_STORAGE_ERROR');
      }
    })();
    this.inFlight.set(row.id, work);
    try { await work; } finally { this.inFlight.delete(row.id); }
  }

  async move(tipo, body, idempotencyKey) {
    const { row, created } = await this.prepare(tipo, body, idempotencyKey);
    await this.attempt(row, created);
    return this.getOperation(row.id, false);
  }

  async getOperation(id, recover = true) {
    invariant(typeof id === 'string' && uuid.test(id), 'OPERATION_NOT_FOUND', 'No se encontró la operación.', 404);
    let row = (await this.pool.query('SELECT * FROM atm_operations WHERE id=$1', [id])).rows[0];
    invariant(row, 'OPERATION_NOT_FOUND', 'No se encontró la operación.', 404);
    if (recover && row.status === 'pending') {
      await this.attempt(row);
      row = (await this.pool.query('SELECT * FROM atm_operations WHERE id=$1', [id])).rows[0];
    }
    return this.view(row);
  }

  async recoverPending() {
    const rows = (await this.pool.query("SELECT * FROM atm_operations WHERE status='pending'")).rows;
    for (const row of rows) await this.attempt(row);
  }
}
