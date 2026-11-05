import http from 'node:http';
import { config } from './config.js';
import { openDb } from './db.js';
import { seedBase, seedBooks } from '../db/seed.js';
import { createContext } from './context.js';
import { serveStatic } from './static.js';
import { serveCover } from './covers.js';
import { Router } from './router.js';
import { loadSession, requireAdmin } from './middleware.js';
import { errorPage } from './views/layout.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import { categoryRoutes, authorRoutes } from './routes/taxonomy.js';
import bookRoutes from './routes/books.js';
import catalogRoutes from './routes/catalog.js';

const db = openDb(config.dbPath);
seedBase(db);
if (config.seedBooks && db.prepare('SELECT COUNT(*) AS n FROM books').get().n === 0) seedBooks(db);

const router = new Router({
  onError: (ctx, err) => ctx.send(err.status, errorPage(ctx, err.status, err.message)),
});
router.use(loadSession);
router.guard('/admin', requireAdmin); // every /admin route requires an Administrator (R05)

authRoutes(router);
catalogRoutes(router);
userRoutes(router);
categoryRoutes(router);
authorRoutes(router);
bookRoutes(router);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  // Covers are proxied and cached by src/covers.js, so images stay same-origin; fonts come from Google Fonts.
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "script-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const url = new URL(`http://localhost${req.url.startsWith('/') ? req.url : `/${req.url}`}`);
    if ((req.method === 'GET' || req.method === 'HEAD')
      && (await serveStatic(req, res, url.pathname) || await serveCover(req, res, url.pathname))) return;
    await router.handle(createContext(req, res, url, db));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
  }
});

server.listen(config.port, () => {
  console.log(`Book Store listening on http://localhost:${server.address().port}`);
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
