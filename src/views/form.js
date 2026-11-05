import { html, raw } from '../html.js';
import { icon } from './icons.js';

const describe = (name, error) => html` aria-describedby="err-${name}"${error ? raw(' aria-invalid="true"') : ''}`;
const errorLine = (name, error) => html`<p class="field-error" id="err-${name}" aria-live="polite">${error || ''}</p>`;

// `attrs` holds developer-written attribute strings only (never user data).
export function field({ label, name, type = 'text', value = '', error, required = false, attrs = '', hint, id }) {
  const fid = id || `f-${name}`;
  return html`<div class="field${error ? ' has-error' : ''}">
  <label for="${fid}">${label}</label>
  <input id="${fid}" name="${name}" type="${type}" value="${type === 'password' ? '' : value}" data-label="${label}"${required ? raw(' required') : ''} ${raw(attrs)}${describe(name, error)}>
  ${hint ? html`<p class="hint">${hint}</p>` : ''}
  ${errorLine(name, error)}
</div>`;
}

export function textarea({ label, name, value = '', error, attrs = '' }) {
  return html`<div class="field${error ? ' has-error' : ''}">
  <label for="f-${name}">${label}</label>
  <textarea id="f-${name}" name="${name}" rows="6" data-label="${label}" ${raw(attrs)}${describe(name, error)}>${value}</textarea>
  ${errorLine(name, error)}
</div>`;
}

export function select({ label, name, options, value = '', error, required = false, placeholder = 'Choose…' }) {
  const v = String(value ?? '');
  return html`<div class="field${error ? ' has-error' : ''}">
  <label for="f-${name}">${label}</label>
  <select id="f-${name}" name="${name}" data-label="${label}"${required ? raw(' required') : ''}${describe(name, error)}>
    <option value="">${placeholder}</option>
    ${options.map((o) => html`<option value="${o.value}"${String(o.value) === v ? raw(' selected') : ''}>${o.label}</option>`)}
  </select>
  ${errorLine(name, error)}
</div>`;
}

export function notice(kind, message) {
  if (!message) return '';
  return html`<div class="notice notice-${kind === 'error' ? 'error' : 'success'}" role="${kind === 'error' ? 'alert' : 'status'}">${icon(kind === 'error' ? 'alert' : 'check', 17)}<span>${message}</span></div>`;
}

export const banner = (type, message) => notice(type === 'error' ? 'error' : 'success', message);

export function errorSummary(errors) {
  return Object.values(errors).some(Boolean) ? notice('error', 'Please fix the highlighted fields and try again.') : '';
}

export function statusPill(status) {
  const ok = status === 'Visible' || status === 'Active';
  return html`<span class="pill ${ok ? 'pill-ok' : 'pill-off'}">${status}</span>`;
}

export function empty({ title, body, href, action }) {
  return html`<div class="empty-card">${icon('bookOpen', 26, 'text-primary')}<h3 class="serif">${title}</h3><p class="muted">${body}</p>${href ? html`<a class="btn btn-primary" href="${href}">${action}</a>` : ''}</div>`;
}

// Blueprint-style pager: ‹ Previous · 2 / 3 · Next ›
export function pagination(base, page, totalPages, params = {}) {
  if (totalPages <= 1) return '';
  const href = (n) => `${base}?${new URLSearchParams({ ...params, page: String(n) })}`;
  return html`<nav class="pager" aria-label="Pagination">
  ${page > 1 ? html`<a class="btn btn-outline" href="${href(page - 1)}" rel="prev">${icon('chevronLeft', 17)} Previous</a>` : html`<span class="btn btn-outline is-disabled" aria-disabled="true">${icon('chevronLeft', 17)} Previous</span>`}
  <span class="mono pager-count"><span aria-current="page">${page}</span> / ${totalPages}</span>
  ${page < totalPages ? html`<a class="btn btn-outline" href="${href(page + 1)}" rel="next">Next ${icon('chevronRight', 17)}</a>` : html`<span class="btn btn-outline is-disabled" aria-disabled="true">Next ${icon('chevronRight', 17)}</span>`}
</nav>`;
}

// Cover image with the Blueprint's coloured fallback tile (shown when there is no cover or it fails to load).
export function cover(book, { index = 0, eager = false, cls = '' } = {}) {
  const fallback = html`<div class="cover-fallback pal-${index % 5}" aria-hidden="true"><span class="mono">${book.category || ''}</span><span class="serif">${book.title}</span><span class="mono">${book.author || ''}</span></div>`;
  return html`<div class="cover ${cls}${book.cover_path ? '' : ' cover-failed'}">
  ${book.cover_path ? html`<img src="${book.cover_path}" alt="Cover of ${book.title}" width="300" height="417" decoding="async" referrerpolicy="no-referrer" data-cover ${eager ? raw('fetchpriority="high"') : raw('loading="lazy"')}>` : ''}
  ${fallback}
</div>`;
}

export const formatPrice = (vnd) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(vnd);
export const formatDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
