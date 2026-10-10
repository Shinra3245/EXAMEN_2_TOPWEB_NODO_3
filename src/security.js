import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 512) return false;
  const [kind, salt, hash] = String(encoded).split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hash ?? '')) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}

export function encrypt(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(value, key) {
  const [iv, tag, encrypted] = value.split(':');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, 'hex')), cipher.final()]).toString('utf8');
}
