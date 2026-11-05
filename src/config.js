import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader. Variables already present in the environment win over the file.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const env = process.env;
const timeoutMinutes = Number.parseFloat(env.SESSION_TIMEOUT_MINUTES ?? '30');

export const config = {
  port: Number(env.PORT ?? 3000),
  dbPath: path.resolve(ROOT, env.DB_PATH || 'data/bookstore.db'),
  adminEmail: (env.ADMIN_EMAIL || 'admin@bookstore.local').trim().toLowerCase(),
  adminName: env.ADMIN_NAME || 'Store Administrator',
  adminPassword: env.ADMIN_PASSWORD || '',
  demoCustomerEmail: (env.DEMO_CUSTOMER_EMAIL || '').trim().toLowerCase(),
  demoCustomerName: env.DEMO_CUSTOMER_NAME || 'Demo Reader',
  demoCustomerPassword: env.DEMO_CUSTOMER_PASSWORD || '',
  sessionTimeoutMs: Math.max(1000, (Number.isFinite(timeoutMinutes) ? timeoutMinutes : 30) * 60_000),
  seedBooks: env.SEED_BOOKS !== '0',
  secureCookies: env.SECURE_COOKIES === '1',
  publicDir: path.join(ROOT, 'public'),
  uploadDir: path.join(ROOT, 'public', 'uploads'),
};
