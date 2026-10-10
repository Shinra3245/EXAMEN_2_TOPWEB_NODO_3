import { AppError } from './errors.js';

export function parseMoney(value) {
  if (typeof value !== 'string' || !/^\d{1,13}(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new AppError('INVALID_AMOUNT', 'Ingresa un importe válido con hasta dos decimales.', 422);
  }
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 999999999999999n) throw new AppError('INVALID_AMOUNT', 'El importe excede el límite admitido.', 422);
  return cents;
}

export function positiveMoney(value) {
  const cents = parseMoney(value);
  if (cents <= 0n) throw new AppError('INVALID_AMOUNT', 'El importe debe ser mayor que cero.', 422);
  return cents;
}

export function formatMoney(value) {
  const cents = BigInt(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
