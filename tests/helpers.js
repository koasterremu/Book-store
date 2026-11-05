import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ADMIN = { email: 'admin@test.local', password: 'AdminTest123' };

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

// Starts the real server on a fresh, temporary database.
export async function startServer(env = {}) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookstore-test-'));
  const dbPath = path.join(dir, 'test.db');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port), DB_PATH: dbPath,
      ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password,
      SESSION_TIMEOUT_MINUTES: '30', SEED_BOOKS: '1', SECURE_COOKIES: '0',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
  });
  const db = new DatabaseSync(dbPath);
  return {
    base: `http://127.0.0.1:${port}`,
    db,
    async stop() {
      // Remove covers uploaded during the test run (seed covers are remote URLs).
      for (const { cover_path: p } of db.prepare("SELECT cover_path FROM books WHERE cover_path LIKE '/uploads/%'").all()) {
        if (p) fs.rmSync(path.join(ROOT, 'public', p), { force: true });
      }
      db.close();
      child.kill();
      await new Promise((r) => child.once('exit', r));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// fetch wrapper with a cookie jar and no automatic redirects.
export class Client {
  constructor(base) { this.base = base; this.jar = new Map(); }

  async request(method, url, body) {
    const headers = {};
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body) payload = new URLSearchParams(body);
    const res = await fetch(this.base + url, { method, headers, body: payload, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie();
    for (const sc of setCookies) {
      const [pair, ...attrs] = sc.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (!value || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a))) this.jar.delete(name); else this.jar.set(name, value);
    }
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, setCookies, body: await res.text() };
  }

  get(url) { return this.request('GET', url); }
  post(url, body = {}) { return this.request('POST', url, body); }
  login(email, password) { return this.post('/login', { email, password }); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export function bookForm(fields, cover = PNG_1X1, coverName = 'cover.png', coverType = 'image/png') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (cover) fd.append('cover', new Blob([cover], { type: coverType }), coverName);
  return fd;
}

export const countCards = (htmlText) => (htmlText.match(/class="book-card[ "]/g) || []).length;
