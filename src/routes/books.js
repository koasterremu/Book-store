// US09 Add / edit books, US14 (CR-03) stock per store, US21 soft delete & restore
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { html } from '../html.js';
import { config } from '../config.js';
import { transaction } from '../db.js';
import { readForm, field, HttpError } from '../http.js';
import { cleanText, textError, parseIntStrict, clampPage, detectImage, hasErrors, MAX_COVER_BYTES, LIMITS } from '../validate.js';
import { adminLayout } from '../views/layout.js';
import { field as input, textarea, select, errorSummary, notice, pagination, formatPrice, statusPill, empty } from '../views/form.js';
import { icon } from '../views/icons.js';

const PER_PAGE = 20;
const STATUSES = { all: 'All', visible: 'Visible', hidden: 'Hidden' };
const FORM_LIMIT = MAX_COVER_BYTES * 3; // room for multipart overhead; the file itself is checked against 2 MB

function references(db) {
  return {
    authors: db.prepare('SELECT id, name FROM authors ORDER BY name COLLATE NOCASE').all(),
    categories: db.prepare('SELECT id, name FROM categories ORDER BY name COLLATE NOCASE').all(),
    stores: db.prepare('SELECT id, name FROM stores ORDER BY id').all(),
  };
}

function getBook(ctx) {
  const id = parseIntStrict(ctx.params.id, { min: 1 });
  const book = id && ctx.db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!book) throw new HttpError(404, 'Book not found.');
  return book;
}

async function parseBookForm(form, refs, { requireCover }) {
  const values = {
    title: cleanText(field(form, 'title')),
    author_id: field(form, 'author_id'),
    category_id: field(form, 'category_id'),
    price: field(form, 'price').trim(),
    description: field(form, 'description').trim(),
    stock: {},
  };
  const errors = {
    title: textError(values.title, 'Title', { max: LIMITS.title }),
    description: textError(values.description, 'Description', { min: 0, max: LIMITS.description }),
  };

  const authorId = parseIntStrict(values.author_id, { min: 1 });
  if (!refs.authors.some((a) => a.id === authorId)) errors.author_id = 'Please choose a valid author';
  const categoryId = parseIntStrict(values.category_id, { min: 1 });
  if (!refs.categories.some((c) => c.id === categoryId)) errors.category_id = 'Please choose a valid category';

  const price = parseIntStrict(values.price, { min: 1, max: LIMITS.price });
  if (price === null) errors.price = values.price === '' ? 'Price is required' : 'Price must be a whole number of VND greater than 0';

  const stock = {};
  for (const store of refs.stores) {
    const name = `stock_${store.id}`;
    const rawQty = field(form, name).trim();
    values.stock[store.id] = rawQty;
    const qty = parseIntStrict(rawQty, { min: 0, max: LIMITS.quantity });
    if (qty === null) errors[name] = rawQty === '' ? 'Quantity is required' : 'Quantity must be a whole number of 0 or more';
    else stock[store.id] = qty;
  }

  let cover = null;
  const file = form.get('cover');
  if (file && typeof file === 'object' && file.size > 0) {
    if (file.size > MAX_COVER_BYTES) {
      errors.cover = 'Cover image must be 2 MB or smaller';
    } else {
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = detectImage(buf);
      if (!ext) errors.cover = 'Cover must be a JPG, PNG or WEBP image';
      else cover = { buf, ext };
    }
  } else if (requireCover) {
    errors.cover = 'Cover image is required';
  }

  return {
    values, errors, cover,
    data: { title: values.title, author_id: authorId, category_id: categoryId, price, description: values.description, stock },
  };
}

async function saveCover({ buf, ext }) {
  await fs.promises.mkdir(config.uploadDir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(config.uploadDir, name), buf);
  return `/uploads/${name}`;
}

async function removeCover(coverPath) {
  if (!coverPath || !coverPath.startsWith('/uploads/') || coverPath.startsWith('/uploads/seed/')) return;
  const file = path.normalize(path.join(config.publicDir, coverPath));
  if (!file.startsWith(config.uploadDir + path.sep)) return;
  await fs.promises.unlink(file).catch(() => {});
}

function bookFormPage(ctx, { refs, values, errors = {}, book }) {
  const isNew = !book;
  const action = isNew ? '/admin/books/new' : `/admin/books/${book.id}/edit`;
  const missingRefs = !refs.authors.length || !refs.categories.length;
  return adminLayout(ctx, {
    title: isNew ? 'Add a book' : 'Edit book',
    eyebrow: 'Catalogue',
    actions: html`<a href="/admin/books" class="btn btn-quiet">${icon('arrowLeft', 16)} Back to books</a>`,
    body: html`${missingRefs ? notice('error', 'Add at least one author and one category before adding books.') : ''}
${book?.is_deleted ? notice('success', 'This book is currently hidden from customers. Restore it from the book list to show it again.') : ''}
<form method="post" action="${action}" enctype="multipart/form-data" class="book-form" data-validate>
  <section class="card form-card">
    <div><p class="mono eyebrow muted">Book details</p><h2 class="serif card-title">Tell us about this title</h2></div>
    ${input({ label: 'Title', name: 'title', value: values.title, error: errors.title, required: true, attrs: `maxlength="${LIMITS.title}"` })}
    <div class="form-grid-2">
      ${select({ label: 'Author', name: 'author_id', value: values.author_id, error: errors.author_id, required: true, placeholder: 'Choose an author', options: refs.authors.map((a) => ({ value: a.id, label: a.name })) })}
      ${select({ label: 'Category', name: 'category_id', value: values.category_id, error: errors.category_id, required: true, placeholder: 'Choose a category', options: refs.categories.map((c) => ({ value: c.id, label: c.name })) })}
    </div>
    ${input({ label: 'Price (VND)', name: 'price', type: 'number', value: values.price, error: errors.price, required: true, attrs: `min="1" max="${LIMITS.price}" step="1" inputmode="numeric"` })}
    ${textarea({ label: 'Description', name: 'description', value: values.description, error: errors.description, attrs: `maxlength="${LIMITS.description}" placeholder="A few words to help a reader choose this book."` })}
    <div class="field${errors.cover ? ' has-error' : ''}">
      <p class="field-label" id="cover-label">Cover image</p>
      <div class="upload-row">
        <label class="upload-pill">${icon('upload', 16)}<span data-file-name>${isNew ? 'Upload cover' : 'Replace cover'}</span>
          <input id="f-cover" class="sr-only" name="cover" type="file" accept="image/jpeg,image/png,image/webp" data-label="Cover image" data-max-bytes="${MAX_COVER_BYTES}"${isNew ? html` required` : ''} aria-labelledby="cover-label" aria-describedby="err-cover" data-preview="cover-preview">
        </label>
        <img id="cover-preview" class="cover-preview${book?.cover_path ? '' : ' is-empty'}" ${book?.cover_path ? html`src="${book.cover_path}"` : ''} alt="Book cover preview" referrerpolicy="no-referrer">
      </div>
      <p class="hint">JPG, PNG, or WebP · up to 2 MB</p>
      <p class="field-error" id="err-cover" aria-live="polite">${errors.cover || ''}</p>
    </div>
  </section>
  <aside class="card form-card stock-card">
    <div><p class="mono eyebrow muted">Stock by location</p><h2 class="serif card-title">Where it lives</h2><p class="muted small">Set the current quantity at each store.</p></div>
    ${refs.stores.length ? refs.stores.map((s) => input({ label: s.name, name: `stock_${s.id}`, type: 'number', value: values.stock[s.id] ?? '0', error: errors[`stock_${s.id}`], required: true, attrs: `min="0" max="${LIMITS.quantity}" step="1" inputmode="numeric"` }))
    : html`<p class="muted-box">No store locations are configured.</p>`}
    ${errorSummary(errors)}
    <button type="submit" class="btn btn-primary btn-block"${missingRefs || !refs.stores.length ? html` disabled` : ''}>${isNew ? 'Add to catalogue' : 'Save book changes'} ${icon('check', 16)}</button>
  </aside>
</form>`,
  });
}

function listPage(ctx) {
  const status = Object.hasOwn(STATUSES, ctx.query.get('status') ?? '') ? ctx.query.get('status') : 'all';
  const where = { all: '', visible: 'WHERE b.is_deleted = 0', hidden: 'WHERE b.is_deleted = 1' }[status];
  const total = ctx.db.prepare(`SELECT COUNT(*) AS n FROM books b ${where}`).get().n;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = clampPage(ctx.query.get('page'), totalPages);
  const books = ctx.db.prepare(`SELECT b.id, b.title, b.price, b.is_deleted, a.name AS author, c.name AS category,
      COALESCE((SELECT SUM(quantity) FROM book_stock s WHERE s.book_id = b.id), 0) AS stock
    FROM books b JOIN authors a ON a.id = b.author_id JOIN categories c ON c.id = b.category_id
    ${where}
    ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`).all(PER_PAGE, (page - 1) * PER_PAGE);

  return adminLayout(ctx, {
    title: 'Books',
    eyebrow: 'Catalogue',
    actions: html`<nav class="filter-pills" aria-label="Filter by visibility">
      ${Object.entries(STATUSES).map(([key, label]) => html`<a href="/admin/books?status=${key}" class="filter-pill"${key === status ? html` aria-current="page"` : ''}>${label}</a>`)}
      <span class="mono small muted">${total} ${total === 1 ? 'title' : 'titles'}</span>
    </nav>
    <a href="/admin/books/new" class="btn btn-primary">${icon('plus', 16)} Add a book</a>`,
    body: html`${books.length === 0
      ? empty(status === 'all'
        ? { title: 'Nothing on the list yet', body: 'Add the first title to begin the catalogue.', href: '/admin/books/new', action: 'Add first book' }
        : { title: 'No books in this view', body: 'Try another filter.' })
      : html`<div class="table-card"><table class="data-table wide">
  <thead><tr><th>Title</th><th>Category</th><th>Price</th><th>Stock total</th><th>Visibility</th><th class="right">Actions</th></tr></thead>
  <tbody>
  ${books.map((b) => html`<tr>
    <td><span class="cell-title">${b.title}</span><span class="cell-sub">${b.author}</span></td>
    <td class="small">${b.category}</td>
    <td class="mono small nowrap">${formatPrice(b.price)}</td>
    <td class="mono small">${b.stock}</td>
    <td>${statusPill(b.is_deleted ? 'Hidden' : 'Visible')}</td>
    <td><div class="row-actions">
      <a href="/admin/books/${b.id}/edit" class="btn btn-outline btn-sm">${icon('pencil', 15)} Edit</a>
      ${b.is_deleted
    ? html`<form method="post" action="/admin/books/${b.id}/restore" class="inline-form"><button type="submit" class="btn btn-quiet btn-sm">${icon('check', 15)} Restore</button></form>`
    : html`<form method="post" action="/admin/books/${b.id}/delete" class="inline-form" data-confirm="Hide “${b.title}” from the customer catalogue?"><button type="submit" class="btn btn-quiet btn-sm text-danger">Hide</button></form>`}
    </div></td>
  </tr>`)}
  </tbody>
</table></div>`}
${pagination('/admin/books', page, totalPages, { status })}`,
  });
}

function writeStock(db, bookId, stock) {
  const stmt = db.prepare(`INSERT INTO book_stock (book_id, store_id, quantity) VALUES (?, ?, ?)
    ON CONFLICT (book_id, store_id) DO UPDATE SET quantity = excluded.quantity`);
  for (const [storeId, qty] of Object.entries(stock)) stmt.run(bookId, Number(storeId), qty);
}

function setDeleted(flag) {
  return (ctx) => {
    const book = getBook(ctx);
    ctx.db.prepare('UPDATE books SET is_deleted = ?, updated_at = ? WHERE id = ?').run(flag, Date.now(), book.id);
    ctx.setFlash('success', flag ? `“${book.title}” is now hidden from customers.` : `“${book.title}” is back on the public shelf.`);
    ctx.redirect(flag ? '/admin/books?status=hidden' : '/admin/books');
  };
}

export default function bookRoutes(router) {
  router.get('/admin/books', (ctx) => ctx.send(200, listPage(ctx)));

  router.get('/admin/books/new', (ctx) => {
    const refs = references(ctx.db);
    ctx.send(200, bookFormPage(ctx, { refs, values: { stock: {} } }));
  });

  router.post('/admin/books/new', async (ctx) => {
    const refs = references(ctx.db);
    const form = await readForm(ctx.req, FORM_LIMIT);
    const { values, errors, data, cover } = await parseBookForm(form, refs, { requireCover: true });
    if (hasErrors(errors)) return ctx.send(400, bookFormPage(ctx, { refs, values, errors }));

    const coverPath = await saveCover(cover);
    const now = Date.now();
    try {
      transaction(ctx.db, () => {
        const id = Number(ctx.db.prepare(`INSERT INTO books (title, author_id, category_id, price, description, cover_path, is_deleted, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(data.title, data.author_id, data.category_id, data.price, data.description, coverPath, now, now).lastInsertRowid);
        writeStock(ctx.db, id, data.stock);
      });
    } catch (err) {
      await removeCover(coverPath);
      throw err;
    }
    ctx.setFlash('success', `“${data.title}” has been added to the catalogue.`);
    ctx.redirect('/admin/books');
  });

  router.get('/admin/books/:id/edit', (ctx) => {
    const book = getBook(ctx);
    const refs = references(ctx.db);
    const stock = Object.fromEntries(ctx.db.prepare('SELECT store_id, quantity FROM book_stock WHERE book_id = ?').all(book.id)
      .map((r) => [r.store_id, String(r.quantity)]));
    const values = { ...book, price: String(book.price), stock };
    ctx.send(200, bookFormPage(ctx, { refs, values, book }));
  });

  router.post('/admin/books/:id/edit', async (ctx) => {
    const book = getBook(ctx);
    const refs = references(ctx.db);
    const form = await readForm(ctx.req, FORM_LIMIT);
    const { values, errors, data, cover } = await parseBookForm(form, refs, { requireCover: false });
    if (hasErrors(errors)) return ctx.send(400, bookFormPage(ctx, { refs, values, errors, book }));

    const coverPath = cover ? await saveCover(cover) : book.cover_path;
    transaction(ctx.db, () => {
      ctx.db.prepare(`UPDATE books SET title = ?, author_id = ?, category_id = ?, price = ?, description = ?, cover_path = ?, updated_at = ?
        WHERE id = ?`).run(data.title, data.author_id, data.category_id, data.price, data.description, coverPath, Date.now(), book.id);
      writeStock(ctx.db, book.id, data.stock);
    });
    if (cover) await removeCover(book.cover_path);
    ctx.setFlash('success', `“${data.title}” has been updated.`);
    ctx.redirect('/admin/books');
  });

  router.post('/admin/books/:id/delete', setDeleted(1));
  router.post('/admin/books/:id/restore', setDeleted(0));
}
