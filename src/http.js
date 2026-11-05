export class HttpError extends Error {
  constructor(status, message) {
    super(message || '');
    this.status = status;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key || key in out) continue;
    const value = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, sameSite = 'Lax', secure = false } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=/`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (httpOnly) s += '; HttpOnly';
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += '; Secure';
  return s;
}

// Reads the whole body. When it exceeds `limit` the rest is drained (not buffered) and a 413 is raised.
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { tooLarge = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => (tooLarge
      ? reject(new HttpError(413, 'The request is too large. Cover images must be 2 MB or smaller.'))
      : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

// Parses application/x-www-form-urlencoded and multipart/form-data with the built-in Fetch API.
export async function readForm(req, limit = 100_000) {
  const type = String(req.headers['content-type'] || '');
  const body = await readBody(req, limit);
  if (!body.length) return new FormData();
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type)) {
    throw new HttpError(400, 'Unsupported form encoding.');
  }
  try {
    return await new Response(body, { headers: { 'content-type': type } }).formData();
  } catch {
    throw new HttpError(400, 'Malformed form data.');
  }
}

export function field(form, name) {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
}
