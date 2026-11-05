// US20 Admin area, US11 Admin creates accounts, US19 Lock / unlock accounts
import { html, raw } from '../html.js';
import { readForm, field, HttpError } from '../http.js';
import { hashPassword } from '../security.js';
import { normalizeEmail, cleanText, emailError, passwordError, textError, hasErrors, parseIntStrict, ROLES, LIMITS } from '../validate.js';
import { adminLayout } from '../views/layout.js';
import { field as input, select, errorSummary, notice, statusPill, empty } from '../views/form.js';
import { icon } from '../views/icons.js';
import { MSG } from './auth.js';

function overview(ctx) {
  const one = (sql) => ctx.db.prepare(sql).get().n;
  const users = one('SELECT COUNT(*) AS n FROM users');
  const active = one("SELECT COUNT(*) AS n FROM users WHERE status = 'Active'");
  const books = one('SELECT COUNT(*) AS n FROM books');
  const hidden = one('SELECT COUNT(*) AS n FROM books WHERE is_deleted = 1');
  const stores = ctx.db.prepare(`SELECT s.name, COALESCE(SUM(CASE WHEN b.is_deleted = 0 THEN bs.quantity END), 0) AS qty
    FROM stores s LEFT JOIN book_stock bs ON bs.store_id = s.id LEFT JOIN books b ON b.id = bs.book_id
    GROUP BY s.id ORDER BY s.id`).all();
  const cards = [
    ['Accounts', users, `${active} active`, 'users', '/admin/users'],
    ['Books', books, `${hidden} hidden`, 'bookOpen', '/admin/books'],
    ['Categories', one('SELECT COUNT(*) AS n FROM categories'), 'Browse the collection', 'library', '/admin/categories'],
    ['Authors', one('SELECT COUNT(*) AS n FROM authors'), `${stores.length} store locations`, 'pencil', '/admin/authors'],
  ];
  return adminLayout(ctx, {
    title: 'A view of the shelves',
    eyebrow: 'Bookseller’s desk',
    body: html`<div class="stat-grid">
  ${cards.map(([title, value, detail, ic, href]) => html`<a href="${href}" class="card stat-card">
    <span class="stat-top"><span class="mono eyebrow muted">${title}</span>${icon(ic, 19, 'text-primary')}</span>
    <span class="serif stat-value">${value}</span>
    <span class="muted small">${detail}</span>
  </a>`)}
</div>
<div class="overview-grid">
  <div class="panel-green">
    <p class="mono eyebrow gold">The work ahead</p>
    <h2 class="serif panel-title">A well-kept catalogue is a welcome mat.</h2>
    <p class="panel-text">Add new arrivals, keep author and category details tidy, and make sure each store’s stock is up to date.</p>
    <a href="/admin/books/new" class="btn btn-ghost-light">Add a book ${icon('plus', 16)}</a>
  </div>
  <div class="card">
    <p class="mono eyebrow muted">Quick links</p>
    <div class="quick-links">
      ${[['/admin/books', 'Update the catalogue'], ['/admin/users', 'Manage reader accounts'], ['/admin/authors', 'Maintain author records']]
    .map(([href, label]) => html`<a href="${href}" class="quick-link">${label}${icon('arrowRight', 16)}</a>`)}
    </div>
  </div>
</div>
<div class="card store-card">
  <p class="mono eyebrow muted">Stock by location</p>
  <div class="store-grid">
    ${stores.map((s) => html`<div><span class="serif store-qty">${s.qty}</span><span class="muted small">${s.name} · copies on the shelf</span></div>`)}
  </div>
</div>`,
  });
}

function usersPage(ctx, { values = {}, errors = {}, error } = {}) {
  const users = ctx.db.prepare('SELECT id, email, full_name, role, status FROM users ORDER BY created_at DESC, id DESC').all();
  const open = Object.values(errors).some(Boolean);
  return adminLayout(ctx, {
    title: 'Reader accounts',
    eyebrow: 'People',
    body: html`${notice('error', error)}
<details class="reveal"${open ? raw(' open') : ''}>
  <summary class="btn btn-primary reveal-toggle"><span class="when-closed">${icon('plus', 16)} Create account</span><span class="when-open">${icon('x', 16)} Close form</span></summary>
  <form method="post" action="/admin/users" class="card form-grid-2" data-validate>
    ${input({ label: 'Full name', name: 'full_name', value: values.full_name, error: errors.full_name, required: true, attrs: `maxlength="${LIMITS.fullName}"` })}
    ${input({ label: 'Email address', name: 'email', type: 'email', value: values.email, error: errors.email, required: true, attrs: 'maxlength="254"' })}
    ${input({ label: 'Temporary password', name: 'password', type: 'password', error: errors.password, required: true, attrs: 'minlength="8" maxlength="128" data-password autocomplete="new-password"', hint: 'At least 8 characters, including a letter and a number.' })}
    ${select({ label: 'Role', name: 'role', value: values.role || 'Customer', error: errors.role, required: true, options: ROLES.map((r) => ({ value: r, label: r })) })}
    <div class="span-2">${errorSummary(errors)}<button type="submit" class="btn btn-primary">Create account</button></div>
  </form>
</details>
${users.length === 0 ? empty({ title: 'No accounts to show', body: 'Accounts will appear here once created.' }) : html`<div class="table-card"><table class="data-table">
  <thead><tr><th>Reader</th><th>Role</th><th>Status</th><th class="right">Access</th></tr></thead>
  <tbody>
  ${users.map((u) => html`<tr>
    <td><span class="cell-title">${u.full_name}</span><span class="cell-sub">${u.email}</span></td>
    <td class="small">${u.role}</td>
    <td>${statusPill(u.status)}</td>
    <td class="right">${u.id === ctx.user.id ? html`<span class="mono small muted">You</span>`
    : u.status === 'Locked'
      ? html`<form method="post" action="/admin/users/${u.id}/unlock" class="inline-form"><button type="submit" class="btn btn-outline btn-sm">${icon('check', 15)} Unlock</button></form>`
      : html`<form method="post" action="/admin/users/${u.id}/lock" class="inline-form" data-confirm="Lock ${u.full_name}’s account? They will be signed out immediately."><button type="submit" class="btn btn-quiet btn-sm">${icon('lock', 15)} Lock</button></form>`}</td>
  </tr>`)}
  </tbody>
</table></div>`}`,
  });
}

function setStatus(status) {
  return (ctx) => {
    const id = parseIntStrict(ctx.params.id, { min: 1 });
    const target = id && ctx.db.prepare('SELECT id, email, full_name, status FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'User not found.');
    if (status === 'Locked' && target.id === ctx.user.id) {
      return ctx.send(400, usersPage(ctx, { error: 'You cannot lock your own account.' }));
    }
    ctx.db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id);
    if (status === 'Locked') ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    ctx.setFlash('success', status === 'Locked' ? `${target.full_name}’s account has been locked.` : `${target.full_name}’s account has been unlocked.`);
    ctx.redirect('/admin/users');
  };
}

export default function userRoutes(router) {
  router.get('/admin', (ctx) => ctx.send(200, overview(ctx)));
  router.get('/admin/users', (ctx) => ctx.send(200, usersPage(ctx)));

  router.post('/admin/users', async (ctx) => {
    const form = await readForm(ctx.req);
    const values = {
      full_name: cleanText(field(form, 'full_name')),
      email: normalizeEmail(field(form, 'email')),
      role: field(form, 'role'),
    };
    const password = field(form, 'password');
    const errors = {
      full_name: textError(values.full_name, 'Full name', { max: LIMITS.fullName }),
      email: emailError(values.email),
      password: passwordError(password),
      role: ROLES.includes(values.role) ? null : 'Please choose a valid role',
    };
    if (!errors.email && ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').get(values.email)) errors.email = MSG.duplicateEmail;
    if (hasErrors(errors)) return ctx.send(400, usersPage(ctx, { values, errors }));

    ctx.db.prepare(`INSERT INTO users (email, full_name, password_hash, role, status, created_at)
      VALUES (?, ?, ?, ?, 'Active', ?)`).run(values.email, values.full_name, await hashPassword(password), values.role, Date.now());
    ctx.setFlash('success', `Account ${values.email} (${values.role}) has been created.`);
    ctx.redirect('/admin/users');
  });

  router.post('/admin/users/:id/lock', setStatus('Locked'));
  router.post('/admin/users/:id/unlock', setStatus('Active'));
}
