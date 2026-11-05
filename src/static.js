import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// Serves /css, /js, /img and /uploads from public/. Returns false when the request is not a static file.
export async function serveStatic(req, res, pathname) {
  if (!/^\/(css|js|img|uploads)\//.test(pathname)) return false;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  const file = path.normalize(path.join(config.publicDir, rel));
  if (!file.startsWith(config.publicDir + path.sep)) return false;
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return false;
  let stat;
  try { stat = await fs.promises.stat(file); } catch { return false; }
  if (!stat.isFile()) return false;

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': rel.startsWith('/uploads/') ? 'public, max-age=86400' : 'public, max-age=300',
    'Last-Modified': stat.mtime.toUTCString(),
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}
