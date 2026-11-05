// Automated server-side checks for Sprint 1 (F1) and Sprint 2 (F2, CR-03, F3).
// They complement – not replace – the manual browser runs recorded in the TC workbook.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, ADMIN, sleep, bookForm, countCards, PNG_1X1 } from './helpers.js';

let app;
let admin;
const customer = { full_name: 'Nguyen Van A', email: 'customer.a@example.com', password: 'Customer123' };

before(async () => {
  app = await startServer();
  admin = new Client(app.base);
  const res = await admin.login(ADMIN.email, ADMIN.password);
  assert.equal(res.status, 303, 'admin can log in');
});
after(async () => { await app?.stop(); });

const userByEmail = (email) => app.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const idOf = (table, name) => app.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name)?.id;

describe('F1 · US01 Register', () => {
  test('TC01 registration creates a Customer and stores the password as scrypt', async () => {
    const c = new Client(app.base);
    const res = await c.post('/register', { ...customer, confirm_password: customer.password });
    assert.equal(res.status, 303);
    assert.equal(res.location, '/account');
    const u = userByEmail(customer.email);
    assert.equal(u.role, 'Customer');
    assert.equal(u.status, 'Active');
    assert.match(u.password_hash, /^scrypt\$/);
    assert.ok(!u.password_hash.includes(customer.password));
  });

  test('duplicate email (any case) is rejected with "Email is already registered"', async () => {
    const res = await new Client(app.base).post('/register', {
      full_name: 'Someone', email: '  CUSTOMER.A@Example.com ', password: 'Another123', confirm_password: 'Another123',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.includes('Email is already registered'));
  });

  test('server rejects invalid data sent directly, bypassing the browser', async () => {
    const res = await new Client(app.base).post('/register', { full_name: '', email: 'not-an-email', password: 'short', confirm_password: 'x' });
    assert.equal(res.status, 400);
    assert.ok(res.body.includes('Email is invalid'));
    assert.ok(res.body.includes('Full name is required'));
    assert.ok(res.body.includes('Password must be at least 8 characters'));
    assert.equal(userByEmail('not-an-email'), undefined);
  });

  test('mismatched password confirmation is rejected', async () => {
    const res = await new Client(app.base).post('/register', { full_name: 'B', email: 'b@example.com', password: 'Password123', confirm_password: 'Password124' });
    assert.equal(res.status, 400);
    assert.ok(res.body.includes('Passwords do not match'));
  });
});

describe('F1 · US02 Login / logout', () => {
  test('login with normalised email works and sets an HttpOnly SameSite cookie', async () => {
    const c = new Client(app.base);
    const res = await c.login('  Customer.A@EXAMPLE.com ', customer.password);
    assert.equal(res.status, 303);
    assert.equal(res.location, '/account');
    const sid = res.setCookies.find((s) => s.startsWith('sid='));
    assert.match(sid, /HttpOnly/);
    assert.match(sid, /SameSite=Lax/);
  });

  test('wrong password and unknown email give the same message', async () => {
    const a = await new Client(app.base).login(customer.email, 'WrongPass1');
    const b = await new Client(app.base).login('nobody@example.com', 'WrongPass1');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.ok(a.body.includes('Invalid email or password'));
    assert.ok(b.body.includes('Invalid email or password'));
  });

  test('TC07 /account requires login and redirects back after login', async () => {
    const c = new Client(app.base);
    const res = await c.get('/account');
    assert.equal(res.status, 303);
    assert.equal(res.location, '/login?next=%2Faccount');
    const login = await c.post('/login', { email: customer.email, password: customer.password, next: '/account' });
    assert.equal(login.location, '/account');
    const page = await c.get('/account');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(customer.email));
  });

  test('open redirects via "next" are ignored', async () => {
    const res = await new Client(app.base).post('/login', { email: customer.email, password: customer.password, next: '//evil.example' });
    assert.equal(res.location, '/account');
  });

  test('logout destroys the session on the server', async () => {
    const c = new Client(app.base);
    await c.login(customer.email, customer.password);
    const stolen = c.jar.get('sid');
    await c.post('/logout');
    const replay = new Client(app.base);
    replay.jar.set('sid', stolen);
    const res = await replay.get('/account');
    assert.equal(res.status, 303);
    assert.match(res.location, /^\/login/);
  });
});

describe('F1 · US20 Authorisation', () => {
  test('anonymous users are redirected from /admin to /login', async () => {
    const res = await new Client(app.base).get('/admin/books');
    assert.equal(res.status, 303);
    assert.match(res.location, /^\/login\?next=%2Fadmin%2Fbooks/);
  });

  test('a Customer gets 403 on admin pages and admin POSTs', async () => {
    const c = new Client(app.base);
    await c.login(customer.email, customer.password);
    assert.equal((await c.get('/admin')).status, 403);
    assert.equal((await c.get('/admin/unknown-page')).status, 403);
    const res = await c.post('/admin/users', { full_name: 'Hacker', email: 'hacker@example.com', password: 'Hacker1234', role: 'Administrator' });
    assert.equal(res.status, 403);
    assert.equal(userByEmail('hacker@example.com'), undefined);
  });

  test('an Administrator can open the admin area', async () => {
    const res = await admin.get('/admin');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('A view of the shelves'));
  });
});

describe('F1 · US11 Admin creates accounts', () => {
  test('admin creates an Administrator account', async () => {
    const res = await admin.post('/admin/users', { full_name: 'Second Admin', email: 'Admin2@Example.com', password: 'Admin2Pass', role: 'Administrator' });
    assert.equal(res.status, 303);
    assert.equal(userByEmail('admin2@example.com').role, 'Administrator');
  });

  test('duplicate email and invalid role are rejected', async () => {
    const dup = await admin.post('/admin/users', { full_name: 'X', email: customer.email, password: 'Password123', role: 'Customer' });
    assert.equal(dup.status, 400);
    assert.ok(dup.body.includes('Email is already registered'));
    const role = await admin.post('/admin/users', { full_name: 'X', email: 'x@example.com', password: 'Password123', role: 'Superuser' });
    assert.equal(role.status, 400);
    assert.equal(userByEmail('x@example.com'), undefined);
  });
});

describe('F1 · US19 Lock / unlock', () => {
  const locked = { full_name: 'Lock Me', email: 'lock.me@example.com', password: 'LockMe1234' };

  test('locking signs the user out and blocks login with the locked message', async () => {
    const c = new Client(app.base);
    await c.post('/register', { ...locked, confirm_password: locked.password });
    assert.equal((await c.get('/account')).status, 200);
    const id = userByEmail(locked.email).id;
    assert.equal((await admin.post(`/admin/users/${id}/lock`)).status, 303);
    assert.equal(userByEmail(locked.email).status, 'Locked');
    assert.equal((await c.get('/account')).status, 303, 'existing session is revoked');
    const login = await new Client(app.base).login(locked.email, locked.password);
    assert.equal(login.status, 403);
    assert.ok(login.body.includes('Your account is locked. Please contact the store.'));
  });

  test('a locked account with a wrong password still gets the generic message', async () => {
    const login = await new Client(app.base).login(locked.email, 'Wrong12345');
    assert.ok(login.body.includes('Invalid email or password'));
  });

  test('unlocking restores access', async () => {
    const id = userByEmail(locked.email).id;
    await admin.post(`/admin/users/${id}/unlock`);
    assert.equal((await new Client(app.base).login(locked.email, locked.password)).status, 303);
  });

  test('an admin cannot lock their own account', async () => {
    const self = userByEmail(ADMIN.email);
    const res = await admin.post(`/admin/users/${self.id}/lock`);
    assert.equal(res.status, 400);
    assert.ok(res.body.includes('You cannot lock your own account'));
    assert.equal(userByEmail(ADMIN.email).status, 'Active');
  });
});

describe('F2 · US22 Categories and US23 Authors', () => {
  for (const [base, table, singular, max] of [['/admin/categories', 'categories', 'Category', 50], ['/admin/authors', 'authors', 'Author', 100]]) {
    test(`${singular}: create, reject duplicate / empty / too long, rename, delete`, async () => {
      assert.equal((await admin.post(base, { name: `Test ${singular}` })).status, 303);
      const dup = await admin.post(base, { name: `test ${singular.toUpperCase()}` });
      assert.equal(dup.status, 400);
      assert.ok(dup.body.includes('already exists'));
      assert.equal((await admin.post(base, { name: '   ' })).status, 400);
      assert.equal((await admin.post(base, { name: 'x'.repeat(max + 1) })).status, 400);
      assert.equal((await admin.post(base, { name: 'x'.repeat(max) })).status, 303, `${max} characters is allowed`);

      const id = idOf(table, `Test ${singular}`);
      assert.equal((await admin.post(`${base}/${id}`, { name: `Renamed ${singular}` })).status, 303);
      assert.equal(idOf(table, `Renamed ${singular}`), id);
      assert.equal((await admin.post(`${base}/${id}/delete`)).status, 303);
      assert.equal(idOf(table, `Renamed ${singular}`), undefined);
    });
  }

  test('a category or author that is used by books cannot be deleted', async () => {
    const cat = idOf('categories', 'Literary Fiction');
    const res = await admin.post(`/admin/categories/${cat}/delete`);
    assert.equal(res.status, 400);
    assert.ok(res.body.includes('still use it'));
    assert.ok(idOf('categories', 'Literary Fiction'));
    const author = idOf('authors', 'Toni Morrison');
    assert.equal((await admin.post(`/admin/authors/${author}/delete`)).status, 400);
    assert.ok(idOf('authors', 'Toni Morrison'));
  });

  test('names are HTML-escaped on output', async () => {
    await admin.post('/admin/categories', { name: '<script>alert(1)</script>' });
    const page = await admin.get('/admin/categories');
    assert.ok(page.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!page.body.includes('<script>alert(1)</script>'));
  });
});

describe('F2 · US09 Books and CR-03 / US14 stock per store', () => {
  let valid;
  const stores = () => app.db.prepare('SELECT id FROM stores ORDER BY id').all().map((s) => s.id);

  before(() => {
    const [s1, s2, s3] = stores();
    valid = {
      title: 'Sprint Test Book', author_id: idOf('authors', 'Agatha Christie'), category_id: idOf('categories', 'Mystery'),
      price: 123000, description: 'Created by the automated test.', [`stock_${s1}`]: 5, [`stock_${s2}`]: 0, [`stock_${s3}`]: 7,
    };
  });

  test('three stores are seeded', () => {
    const names = app.db.prepare('SELECT name FROM stores ORDER BY id').all().map((s) => s.name);
    assert.deepEqual(names, ['District 1', 'District 3', 'Thu Duc City']);
  });

  test('admin adds a book with cover and stock for each store; it appears first on /books', async () => {
    const res = await admin.post('/admin/books/new', bookForm(valid));
    assert.equal(res.status, 303);
    const book = app.db.prepare('SELECT * FROM books WHERE title = ?').get(valid.title);
    assert.equal(book.price, 123000);
    assert.match(book.cover_path, /^\/uploads\/[0-9a-f]+\.png$/);
    const stock = app.db.prepare('SELECT quantity FROM book_stock WHERE book_id = ? ORDER BY store_id').all(book.id).map((r) => r.quantity);
    assert.deepEqual(stock, [5, 0, 7]);
    const grid = await new Client(app.base).get('/books');
    assert.equal(Number(grid.body.match(/class="book-card[^"]*" data-book-id="(\d+)"/)[1]), book.id, 'newest book is first');
    const img = await fetch(app.base + book.cover_path);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
  });

  test('server rejects invalid book data sent directly', async () => {
    const before = app.db.prepare('SELECT COUNT(*) AS n FROM books').get().n;
    for (const [patch, message] of [
      [{ price: 0 }, 'Price must be a whole number'],
      [{ price: -5 }, 'Price must be a whole number'],
      [{ price: '12.5' }, 'Price must be a whole number'],
      [{ price: '' }, 'Price is required'],
      [{ title: '' }, 'Title is required'],
      [{ title: 'x'.repeat(201) }, 'Title must be at most 200 characters'],
      [{ author_id: 999999 }, 'Please choose a valid author'],
      [{ category_id: 'abc' }, 'Please choose a valid category'],
    ]) {
      const res = await admin.post('/admin/books/new', bookForm({ ...valid, ...patch }));
      assert.equal(res.status, 400, JSON.stringify(patch));
      assert.ok(res.body.includes(message), `${JSON.stringify(patch)} → ${message}`);
    }
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM books').get().n, before);
  });

  test('cover must exist, be at most 2 MB and be a real image', async () => {
    const missing = await admin.post('/admin/books/new', bookForm(valid, null));
    assert.equal(missing.status, 400);
    assert.ok(missing.body.includes('Cover image is required'));

    const big = Buffer.concat([PNG_1X1, Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await admin.post('/admin/books/new', bookForm(valid, big));
    assert.equal(tooBig.status, 400);
    assert.ok(tooBig.body.includes('Cover image must be 2 MB or smaller'));

    const fake = await admin.post('/admin/books/new', bookForm(valid, Buffer.from('<?php echo 1; ?>'), 'evil.png', 'image/png'));
    assert.equal(fake.status, 400);
    assert.ok(fake.body.includes('Cover must be a JPG, PNG or WEBP image'));
  });

  test('stock must be a whole number ≥ 0 for every store (direct request)', async () => {
    const [s1, s2] = stores();
    for (const patch of [{ [`stock_${s1}`]: -1 }, { [`stock_${s2}`]: '2.5' }, { [`stock_${s2}`]: '' }]) {
      const res = await admin.post('/admin/books/new', bookForm({ ...valid, title: 'Bad stock', ...patch }));
      assert.equal(res.status, 400, JSON.stringify(patch));
    }
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM books WHERE title = 'Bad stock'").get().n, 0);
  });

  test('editing a book updates fields and stock and keeps the cover when none is uploaded', async () => {
    const book = app.db.prepare('SELECT * FROM books WHERE title = ?').get(valid.title);
    const [s1] = stores();
    const res = await admin.post(`/admin/books/${book.id}/edit`, bookForm({ ...valid, price: 99000, [`stock_${s1}`]: 12 }, null));
    assert.equal(res.status, 303);
    const after = app.db.prepare('SELECT * FROM books WHERE id = ?').get(book.id);
    assert.equal(after.price, 99000);
    assert.equal(after.cover_path, book.cover_path);
    assert.equal(app.db.prepare('SELECT quantity FROM book_stock WHERE book_id = ? AND store_id = ?').get(book.id, s1).quantity, 12);
  });
});

describe('F2 · US21 Soft delete and restore', () => {
  test('TC24 a deleted book is hidden from customers and /books/:id says it is not available', async () => {
    const book = app.db.prepare("SELECT id, title FROM books WHERE title = 'Sprint Test Book'").get();
    assert.equal((await admin.post(`/admin/books/${book.id}/delete`)).status, 303);
    assert.equal(app.db.prepare('SELECT is_deleted FROM books WHERE id = ?').get(book.id).is_deleted, 1);

    const guest = new Client(app.base);
    assert.ok(!(await guest.get('/books')).body.includes(`data-book-id="${book.id}"`));
    const detail = await guest.get(`/books/${book.id}`);
    assert.equal(detail.status, 404);
    assert.ok(detail.body.includes('This book is not available'));

    const list = await admin.get('/admin/books?status=hidden');
    assert.ok(list.body.includes(book.title));
    assert.ok(list.body.includes('Hidden'));
  });

  test('restore makes the book visible again', async () => {
    const book = app.db.prepare("SELECT id FROM books WHERE title = 'Sprint Test Book'").get();
    assert.equal((await admin.post(`/admin/books/${book.id}/restore`)).status, 303);
    assert.equal((await new Client(app.base).get(`/books/${book.id}`)).status, 200);
  });

  test('a Customer cannot delete books by posting directly', async () => {
    const c = new Client(app.base);
    await c.login(customer.email, customer.password);
    const book = app.db.prepare("SELECT id FROM books WHERE title = 'Sprint Test Book'").get();
    assert.equal((await c.post(`/admin/books/${book.id}/delete`)).status, 403);
    assert.equal(app.db.prepare('SELECT is_deleted FROM books WHERE id = ?').get(book.id).is_deleted, 0);
  });
});

describe('F3 · US03 Book grid', () => {
  const visible = () => app.db.prepare('SELECT COUNT(*) AS n FROM books WHERE is_deleted = 0').get().n;

  test('the 30 Blueprint books are seeded with Open Library covers', () => {
    assert.ok(app.db.prepare("SELECT COUNT(*) AS n FROM books WHERE cover_path LIKE '/covers/isbn/%'").get().n >= 30);
    assert.ok(app.db.prepare("SELECT 1 FROM books WHERE title = 'The Mountains Sing'").get());
  });

  test('12 books per page, newest first, and the last page holds the rest', async () => {
    const guest = new Client(app.base);
    const p1 = await guest.get('/books');
    assert.equal(countCards(p1.body), 12);
    const newest = app.db.prepare('SELECT id FROM books WHERE is_deleted = 0 ORDER BY created_at DESC, id DESC LIMIT 12').all().map((r) => r.id);
    const shown = [...p1.body.matchAll(/class="book-card[^"]*" data-book-id="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(shown, newest);

    const last = Math.ceil(visible() / 12);
    const lp = await guest.get(`/books?page=${last}`);
    assert.equal(countCards(lp.body), visible() - (last - 1) * 12);
  });

  test('page numbers are limited to the valid range', async () => {
    const guest = new Client(app.base);
    const last = Math.ceil(visible() / 12);
    assert.ok((await guest.get('/books?page=999')).body.includes(`aria-current="page">${last}<`));
    assert.ok((await guest.get('/books?page=abc')).body.includes('aria-current="page">1<'));
    assert.ok((await guest.get('/books?page=-3')).body.includes('aria-current="page">1<'));
  });

  test('TC34 /books loads in under 2 seconds with 30+ books', async () => {
    const t = performance.now();
    const res = await fetch(`${app.base}/books`, { headers: { 'cache-control': 'no-cache' } });
    await res.text();
    const ms = performance.now() - t;
    assert.equal(res.status, 200);
    assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`);
  });
});

describe('Session timeout and empty catalogue (separate servers)', () => {
  let short;
  before(async () => { short = await startServer({ SESSION_TIMEOUT_MINUTES: '0.03', SEED_BOOKS: '0' }); }); // ~1.8 s
  after(async () => { await short?.stop(); });

  test('TC36 an empty database shows "No books available yet"', async () => {
    const res = await new Client(short.base).get('/books');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('No books available yet'));
    assert.equal(countCards(res.body), 0);
  });

  test('TC12 an idle session expires and the user must log in again', async () => {
    const c = new Client(short.base);
    await c.post('/register', { full_name: 'Idle User', email: 'idle@example.com', password: 'IdleUser123', confirm_password: 'IdleUser123' });
    assert.equal((await c.get('/account')).status, 200);
    await sleep(2500);
    const res = await c.get('/account');
    assert.equal(res.status, 303);
    assert.match(res.location, /expired=1/);
    const login = await c.get(res.location);
    assert.ok(login.body.includes('Your session has expired'));
  });
});
