import { HttpError } from './http.js';

// Tiny router: method + path matching with :params, prefix guards and central 400/403/404 handling.
export class Router {
  constructor({ onError }) {
    this.routes = [];
    this.before = [];
    this.guards = [];
    this.onError = onError;
  }

  use(fn) { this.before.push(fn); return this; }

  // Runs `fn` for `prefix` and everything under it, before any route matching (R05).
  guard(prefix, fn) { this.guards.push({ prefix, fn }); return this; }

  add(method, pattern, ...handlers) {
    const keys = [];
    const source = pattern.replace(/\/:([A-Za-z_]+)/g, (_, key) => { keys.push(key); return '/([^/]+)'; });
    this.routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handlers });
    return this;
  }

  get(pattern, ...handlers) { return this.add('GET', pattern, ...handlers); }
  post(pattern, ...handlers) { return this.add('POST', pattern, ...handlers); }

  async handle(ctx) {
    try {
      for (const fn of this.before) await fn(ctx);
      const { path } = ctx;
      for (const g of this.guards) {
        if (path === g.prefix || path.startsWith(`${g.prefix}/`)) {
          if ((await g.fn(ctx)) === false || ctx.sent) return;
        }
      }
      let pathMatched = false;
      for (const route of this.routes) {
        const m = route.re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== ctx.method) continue;
        ctx.params = {};
        route.keys.forEach((key, i) => {
          try { ctx.params[key] = decodeURIComponent(m[i + 1]); } catch { throw new HttpError(400, 'Malformed URL.'); }
        });
        for (const handler of route.handlers) {
          await handler(ctx);
          if (ctx.sent) return;
        }
        throw new Error(`Route ${route.method} ${path} did not send a response`);
      }
      throw new HttpError(pathMatched ? 405 : 404);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (!ctx.sent) this.onError(ctx, err instanceof HttpError ? err : new HttpError(500));
    }
  }
}
