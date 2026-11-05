import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

const format = (salt, key) => `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;

// Stored as scrypt$N$r$p$salt$key (TC01).
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return format(salt, await scrypt(password, salt, KEYLEN, { N, r: R, p: P }));
}

export function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  return format(salt, crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P }));
}

export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, actual);
}

// Used when the email does not exist so the response time does not reveal it.
export const DUMMY_HASH = hashPasswordSync(crypto.randomBytes(12).toString('hex'));

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
