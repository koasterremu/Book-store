import { config } from './config.js';
import { HttpError } from './http.js';
import { hashToken, newToken } from './security.js';

const SESSION_COOKIE = 'sid';

function clearSessionCookie(ctx) {
  ctx.setCookie(SESSION_COOKIE, '', { maxAge: 0, secure: config.secureCookies });
}

// Attaches ctx.user when the cookie maps to a live session. Expired, unknown or locked sessions are removed.
export function loadSession(ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = hashToken(token);
  const row = ctx.db.prepare(`
    SELECT s.last_seen_at, u.id, u.email, u.full_name, u.role, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(tokenHash);
  if (!row) { clearSessionCookie(ctx); return; }

  const now = Date.now();
  if (now - row.last_seen_at > config.sessionTimeoutMs) {
    ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    clearSessionCookie(ctx);
    ctx.sessionExpired = true;
    return;
  }
  if (row.status !== 'Active') {
    ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
    clearSessionCookie(ctx);
    return;
  }
  ctx.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash);
  ctx.tokenHash = tokenHash;
  ctx.user = { id: row.id, email: row.email, full_name: row.full_name, role: row.role };
}

export function startSession(ctx, user) {
  if (ctx.tokenHash) ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(ctx.tokenHash);
  const token = newToken();
  const now = Date.now();
  ctx.tokenHash = hashToken(token);
  ctx.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .run(ctx.tokenHash, user.id, now, now);
  ctx.setCookie(SESSION_COOKIE, token, { secure: config.secureCookies });
  ctx.user = { id: user.id, email: user.email, full_name: user.full_name, role: user.role };
}

export function endSession(ctx) {
  if (ctx.tokenHash) ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(ctx.tokenHash);
  clearSessionCookie(ctx);
  ctx.user = null;
  ctx.tokenHash = null;
}

export function requireLogin(ctx) {
  if (ctx.user) return true;
  const params = new URLSearchParams();
  if (ctx.method === 'GET') params.set('next', ctx.url.pathname + ctx.url.search);
  if (ctx.sessionExpired) params.set('expired', '1');
  const qs = params.toString();
  ctx.redirect(qs ? `/login?${qs}` : '/login');
  return false;
}

export function requireAdmin(ctx) {
  if (!requireLogin(ctx)) return false;
  if (ctx.user.role !== 'Administrator') {
    throw new HttpError(403, 'You do not have permission to access this page.');
  }
  return true;
}

// Only allow same-site relative redirects such as "/books?page=2".
export function safeNext(value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null;
}
