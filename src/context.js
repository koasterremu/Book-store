import { parseCookies, serializeCookie } from './http.js';

const FLASH_TYPES = new Set(['success', 'error', 'info']);

export function createContext(req, res, url, db) {
  const cookies = parseCookies(req.headers.cookie);
  const outCookies = new Map();

  const ctx = {
    req, res, db, url, cookies,
    method: req.method === 'HEAD' ? 'GET' : req.method,
    path: url.pathname,
    query: url.searchParams,
    params: {},
    user: null,
    tokenHash: null,
    sessionExpired: false,
    flash: null,
    sent: false,

    setCookie(name, value, opts) { outCookies.set(name, serializeCookie(name, value, opts)); },

    // One-shot message shown on the next page (after a redirect).
    setFlash(type, message) { this.setCookie('flash', JSON.stringify({ type, message })); },

    send(status, body = '', headers = {}) {
      if (this.sent) return;
      this.sent = true;
      res.statusCode = status;
      if (outCookies.size) res.setHeader('Set-Cookie', [...outCookies.values()]);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const text = String(body);
      res.setHeader('Content-Length', Buffer.byteLength(text));
      res.end(req.method === 'HEAD' ? undefined : text);
    },

    redirect(location, status = 303) { this.send(status, '', { Location: location }); },
  };

  if (cookies.flash) {
    try {
      const f = JSON.parse(cookies.flash);
      if (FLASH_TYPES.has(f.type) && typeof f.message === 'string') ctx.flash = f;
    } catch { /* ignore malformed flash */ }
    ctx.setCookie('flash', '', { maxAge: 0 });
  }
  return ctx;
}
