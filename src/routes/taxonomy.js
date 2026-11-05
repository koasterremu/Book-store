// US22 Categories, US23 Authors – same rules: unique name, length limit, no delete while books use it.
import { html, raw } from '../html.js';
import { readForm, field, HttpError } from '../http.js';
import { cleanText, textError, parseIntStrict, LIMITS } from '../validate.js';
import { adminLayout } from '../views/layout.js';
import { notice, empty } from '../views/form.js';
import { icon } from '../views/icons.js';

function taxonomyRoutes(router, { base, table, fk, singular, plural, max }) {
  const lower = singular.toLowerCase();
  const kind = plural.toLowerCase();

  const nameInput = (id, value, errId) => html`<input id="${id}" name="name" value="${value}" required maxlength="${max}" data-label="${singular} name" aria-describedby="${errId}">`;

  const page = (ctx, { error, name = '', addOpen = false, editId = 0 } = {}) => {
    const rows = ctx.db.prepare(`SELECT t.id, t.name,
        (SELECT COUNT(*) FROM books b WHERE b.${fk} = t.id) AS total,
        (SELECT COUNT(*) FROM books b WHERE b.${fk} = t.id AND b.is_deleted = 1) AS hidden
      FROM ${table} t ORDER BY t.name COLLATE NOCASE`).all();
    return adminLayout(ctx, {
      title: `${singular} records`,
      eyebrow: 'Catalogue details',
      body: html`${notice('error', error)}
<details class="reveal"${addOpen ? raw(' open') : ''}>
  <summary class="btn btn-primary reveal-toggle"><span class="when-closed">${icon('plus', 16)} Add ${lower}</span><span class="when-open">${icon('x', 16)} Close form</span></summary>
  <form method="post" action="${base}" class="card inline-card-form" data-validate>
    <div class="field grow">
      <label for="f-new-name">${singular} name</label>
      ${nameInput('f-new-name', name, 'err-new-name')}
      <p class="field-error" id="err-new-name" aria-live="polite"></p>
    </div>
    <button type="submit" class="btn btn-primary">Create ${lower}</button>
  </form>
</details>
${rows.length === 0 ? empty({ title: `No ${kind} yet`, body: `Add a ${lower} to organize the catalogue.` }) : html`<div class="record-list">
  ${rows.map((r) => html`<div class="card record">
    <div class="record-main">
      <p class="record-name">${r.name}</p>
      <p class="mono record-meta">${r.total} ${r.total === 1 ? 'book' : 'books'}${r.hidden ? ` · ${r.hidden} hidden` : ''}</p>
    </div>
    <div class="record-actions">
      <details class="rename"${editId === r.id ? raw(' open') : ''}>
        <summary class="btn btn-outline btn-sm">${icon('pencil', 14)} Rename</summary>
        <form method="post" action="${base}/${r.id}" class="rename-form" data-validate>
          <label class="sr-only" for="rename-${r.id}">New name for ${r.name}</label>
          ${nameInput(`rename-${r.id}`, r.name, `err-rename-${r.id}`)}
          <button type="submit" class="btn btn-primary btn-sm">Save changes</button>
          <p class="field-error" id="err-rename-${r.id}" aria-live="polite"></p>
        </form>
      </details>
      <form method="post" action="${base}/${r.id}/delete" class="inline-form" data-confirm="Delete ${r.name}?">
        <button type="submit" class="btn btn-quiet btn-sm text-danger"${r.total > 0 ? html` disabled title="Used by ${r.total} book(s)"` : ''}>${icon('x', 15)} Delete</button>
      </form>
    </div>
  </div>`)}
</div>`}`,
    });
  };

  const getRow = (ctx) => {
    const id = parseIntStrict(ctx.params.id, { min: 1 });
    const row = id && ctx.db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new HttpError(404, `${singular} not found.`);
    return row;
  };

  const validateName = (ctx, name, exceptId = 0) => textError(name, `${singular} name`, { max })
    || (ctx.db.prepare(`SELECT 1 FROM ${table} WHERE name = ? COLLATE NOCASE AND id <> ?`).get(name, exceptId)
      ? `${singular} "${name}" already exists` : null);

  router.get(base, (ctx) => ctx.send(200, page(ctx)));

  router.post(base, async (ctx) => {
    const name = cleanText(field(await readForm(ctx.req), 'name'));
    const error = validateName(ctx, name);
    if (error) return ctx.send(400, page(ctx, { error, name, addOpen: true }));
    ctx.db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name);
    ctx.setFlash('success', `${singular} "${name}" has been added.`);
    ctx.redirect(base);
  });

  router.post(`${base}/:id`, async (ctx) => {
    const row = getRow(ctx);
    const name = cleanText(field(await readForm(ctx.req), 'name'));
    const error = validateName(ctx, name, row.id);
    if (error) return ctx.send(400, page(ctx, { error, editId: row.id }));
    ctx.db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, row.id);
    ctx.setFlash('success', `${singular} renamed to "${name}".`);
    ctx.redirect(base);
  });

  router.post(`${base}/:id/delete`, (ctx) => {
    const row = getRow(ctx);
    const used = ctx.db.prepare(`SELECT COUNT(*) AS n FROM books WHERE ${fk} = ?`).get(row.id).n;
    if (used > 0) {
      return ctx.send(400, page(ctx, { error: `Cannot delete ${lower} "${row.name}" because ${used} book(s) still use it.` }));
    }
    ctx.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    ctx.setFlash('success', `${singular} "${row.name}" has been deleted.`);
    ctx.redirect(base);
  });
}

export const categoryRoutes = (router) => taxonomyRoutes(router, {
  base: '/admin/categories', table: 'categories', fk: 'category_id', singular: 'Category', plural: 'Categories', max: LIMITS.category,
});

export const authorRoutes = (router) => taxonomyRoutes(router, {
  base: '/admin/authors', table: 'authors', fk: 'author_id', singular: 'Author', plural: 'Authors', max: LIMITS.author,
});
