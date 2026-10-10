import { AppError, invariant } from './errors.js';
import { parseMoney, formatMoney } from './money.js';
import { normalizeCentralUrl } from './central-url.js';

const messages = {
  INSUFFICIENT_FUNDS: 'La cuenta no tiene saldo suficiente.',
  INSUFFICIENT_CASH: 'El Banco Central informa efectivo insuficiente en el cajero.',
  ACCOUNT_BLOCKED: 'La cuenta está bloqueada.',
  ACCOUNT_NOT_FOUND: 'No se encontró la cuenta.',
  NODE_INACTIVE: 'El cajero está deshabilitado en el Banco Central.',
  INVALID_API_KEY: 'El Banco Central rechazó la API Key del cajero.',
  VALIDATION_ERROR: 'El Banco Central rechazó los datos de la operación.',
};

export class BankClient {
  constructor({ centralUrl, timeoutMs }) {
    this.url = normalizeCentralUrl(centralUrl);
    this.timeoutMs = timeoutMs;
  }

  async request(path, key, { method = 'GET', body } = {}) {
    let response;
    let payload;
    try {
      response = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-API-KEY': key,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
      const text = await response.text();
      if (text.length > 65536) throw new Error('Oversized bank response');
      payload = JSON.parse(text);
    } catch {
      throw new AppError('CENTRAL_UNAVAILABLE', 'No fue posible confirmar la respuesta del Banco Central.', 503);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AppError('CENTRAL_PROTOCOL_ERROR', 'El Banco Central respondió con un formato incompatible.', 502);
    }
    return { status: response.status, ok: response.ok, payload };
  }

  failure(result) {
    if (result.status >= 500) return new AppError('CENTRAL_UNAVAILABLE', 'El Banco Central no está disponible para confirmar el resultado.', 503);
    if (result.status === 401 || result.status === 403) return new AppError('INVALID_API_KEY', 'El Banco Central rechazó la API Key o deshabilitó el cajero.', 503);
    if (result.status === 422 && result.payload.errors && typeof result.payload.errors === 'object') {
      return new AppError('VALIDATION_ERROR', messages.VALIDATION_ERROR, 422);
    }
    const code = result.payload.error?.code;
    if (Object.hasOwn(messages, code ?? '')) return new AppError(code, messages[code], result.status === 401 || result.status === 403 ? 503 : 422);
    return new AppError('CENTRAL_PROTOCOL_ERROR', 'El Banco Central respondió con un contrato incompatible o un error no reconocido.', 502);
  }

  money(value) {
    try { return formatMoney(parseMoney(typeof value === 'number' ? String(value) : value)); }
    catch { throw new AppError('CENTRAL_PROTOCOL_ERROR', 'El Banco Central devolvió un importe inválido.', 502); }
  }

  async getNode(key) {
    const result = await this.request('/nodes/me', key);
    if (result.status === 404) throw new AppError('CENTRAL_CONTRACT_PENDING', 'NODE1 todavía no ofrece la consulta del cajero. Revisa docs/central-contract.md.', 503);
    if (!result.ok) throw this.failure(result);
    const data = result.payload.data;
    invariant(data && typeof data.id === 'string' && data.id.length > 0 && data.tipo === 'cajero' && data.activo === true,
      'INVALID_ATM_NODE', 'La API Key debe pertenecer a un cajero activo.', 422);
    return { id: data.id, nombre: typeof data.nombre === 'string' ? data.nombre : 'Cajero', cash: this.money(data.efectivo_disponible) };
  }

  async getBalance(key, account) {
    const result = await this.request(`/accounts/${encodeURIComponent(account)}`, key);
    if (result.status === 404) throw new AppError('ACCOUNT_NOT_FOUND', messages.ACCOUNT_NOT_FOUND, 422);
    if (!result.ok) throw this.failure(result);
    const data = result.payload;
    invariant(data && data.numero_cuenta === account && ['activa', 'bloqueada'].includes(data.estado),
      'CENTRAL_PROTOCOL_ERROR', 'El Banco Central devolvió una cuenta incompatible.', 502);
    invariant(data.estado === 'activa', 'ACCOUNT_BLOCKED', messages.ACCOUNT_BLOCKED, 422);
    return {
      numero_cuenta: data.numero_cuenta,
      nombre_titular: typeof data.nombre_titular === 'string' ? data.nombre_titular : '',
      saldo_global: this.money(data.saldo_global), estado: data.estado,
    };
  }

  result(result, operation) {
    const data = result.payload;
    const businessRejections = ['INSUFFICIENT_FUNDS', 'INSUFFICIENT_CASH', 'ACCOUNT_BLOCKED', 'ACCOUNT_NOT_FOUND', 'VALIDATION_ERROR'];
    if ([200, 422].includes(result.status) && data.status === 'rejected' && data.idempotency_key === operation.idempotency_key && businessRejections.includes(data.error?.code)) {
      return { status: 'rejected', code: data.error.code, message: messages[data.error.code] };
    }
    if (!result.ok) {
      // Legacy 400/422, authentication errors and conflicts cannot settle an earlier debit.
      throw this.failure(result);
    }
    if ([200, 202].includes(result.status) && data.status === 'pending') return { status: 'pending' };
    const tx = data.transaction;
    invariant([200, 201].includes(result.status) && data.status === 'succeeded' && tx && typeof tx.id === 'string' && tx.id.length > 0 && tx.nodo_id === operation.node_id && tx.tipo === operation.tipo && tx.idempotency_key === operation.idempotency_key,
      'CENTRAL_PROTOCOL_ERROR', 'No fue posible validar la confirmación central de la operación.', 502);
    const accountMatches = operation.tipo === 'retiro'
      ? tx.cuenta_origen === operation.numero_cuenta && tx.cuenta_destino == null
      : tx.cuenta_destino === operation.numero_cuenta && tx.cuenta_origen == null;
    invariant(accountMatches && this.money(tx.monto) === formatMoney(operation.amount_cents) && typeof tx.created_at === 'string' && Number.isFinite(Date.parse(tx.created_at)),
      'CENTRAL_PROTOCOL_ERROR', 'La confirmación central no corresponde a la operación solicitada.', 502);
    return {
      status: 'succeeded',
      receipt: {
        transaction_id: tx.id, tipo: tx.tipo, numero_cuenta: operation.numero_cuenta,
        monto: this.money(tx.monto), saldo_global: this.money(data.saldo_global),
        efectivo_disponible: this.money(data.efectivo_disponible), created_at: tx.created_at,
      },
    };
  }

  async send(key, operation) {
    const result = await this.request('/transactions', key, {
      method: 'POST',
      body: {
        tipo: operation.tipo, monto: formatMoney(operation.amount_cents),
        idempotency_key: operation.idempotency_key,
        ...(operation.tipo === 'retiro' ? { cuenta_origen: operation.numero_cuenta } : { cuenta_destino: operation.numero_cuenta }),
      },
    });
    return this.result(result, operation);
  }

  async lookup(key, operation) {
    const result = await this.request(`/transactions/by-idempotency-key/${encodeURIComponent(operation.idempotency_key)}`, key);
    if (result.status === 404 && result.payload.error?.code === 'OPERATION_NOT_FOUND') return { status: 'not_found' };
    // Authentication/route failures during lookup do not resolve an earlier debit.
    if (!result.ok) throw this.failure(result);
    return this.result(result, operation);
  }
}
