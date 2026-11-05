// Serves /covers/isbn/<ISBN>.jpg. The first request fetches the cover from Open Library and caches it in
// data/covers/, so later requests (and offline use) are served locally and browsers never call a third party.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { detectImage, MAX_COVER_BYTES } from './validate.js';

const CACHE_DIR = path.join(path.dirname(config.dbPath), 'covers');
const ROUTE = /^\/covers\/isbn\/(\d{9}[\dX]|\d{13})\.jpg$/;
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MISSING_TTL = 24 * 3600_000; // retry covers Open Library did not have after a day
const inFlight = new Map();

export const coverUrlFor = (isbn) => `/covers/isbn/${isbn}.jpg`;

async function fetchCover(isbn) {
  const file = path.join(CACHE_DIR, `${isbn}.img`);
  const missing = path.join(CACHE_DIR, `${isbn}.missing`);
  try { return await fs.promises.readFile(file); } catch { /* not cached */ }
  try {
    if (Date.now() - (await fs.promises.stat(missing)).mtimeMs < MISSING_TTL) return null;
  } catch { /* no marker */ }

  const res = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`, {
    redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'TheCommonShelf/0.2 (bookstore demo)' },
  });
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  if (res.status === 404) { await fs.promises.writeFile(missing, ''); return null; }
  if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_COVER_BYTES * 2 || !detectImage(buf)) { await fs.promises.writeFile(missing, ''); return null; }
  await fs.promises.writeFile(file, buf);
  return buf;
}

// Returns true when the request was a cover request (handled here), false otherwise.
export async function serveCover(req, res, pathname) {
  const m = ROUTE.exec(pathname);
  if (!m) return false;
  const isbn = m[1];
  let task = inFlight.get(isbn);
  if (!task) {
    task = fetchCover(isbn).finally(() => inFlight.delete(isbn));
    inFlight.set(isbn, task);
  }
  let buf;
  try { buf = await task; } catch (err) {
    console.warn(`[covers] ${isbn}: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Cover temporarily unavailable');
    return true;
  }
  if (!buf) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end('No cover');
    return true;
  }
  res.writeHead(200, { 'Content-Type': TYPES[detectImage(buf)], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=604800' });
  res.end(req.method === 'HEAD' ? undefined : buf);
  return true;
}
