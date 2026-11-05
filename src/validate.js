// Shared validation rules. The server is the source of truth; public/js/app.js mirrors these for fast feedback.

export const ROLES = ['Administrator', 'Customer'];
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
export const LIMITS = { fullName: 100, category: 50, author: 100, title: 200, description: 2000, price: 1_000_000_000, quantity: 1_000_000 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();
export const cleanText = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
export const hasErrors = (errors) => Object.values(errors).some(Boolean);

export function emailError(email) {
  if (!email) return 'Email is required';
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Email is invalid';
  return null;
}

export function passwordError(password) {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number';
  return null;
}

export function textError(value, label, { min = 1, max }) {
  if (value.length < min) return min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`;
  if (value.length > max) return `${label} must be at most ${max} characters`;
  return null;
}

// Accepts only plain integers ("12", not "12.5", "1e3" or " 12abc"). Returns null when invalid or out of range.
export function parseIntStrict(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const s = String(value ?? '').trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export function clampPage(value, totalPages) {
  return Math.min(parseIntStrict(value, { min: 1 }) ?? 1, Math.max(1, totalPages));
}

// Identifies an image by its magic bytes rather than by the client-supplied type or file name.
export function detectImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
