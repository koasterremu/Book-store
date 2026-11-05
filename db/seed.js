// Seed: 1 admin (password from .env), 3 stores, 9 categories, 31 authors and 30 books
// (catalogue taken from the Bookstore-Blueprint project).
// Usage: npm run seed            (adds demo books only when the books table is empty)
//        npm run seed:reset      (deletes the database file first)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';
import { openDb, transaction } from '../src/db.js';
import { hashPasswordSync } from '../src/security.js';
import { coverUrlFor } from '../src/covers.js';

export const STORES = ['District 1', 'District 3', 'Thu Duc City'];

export const CATEGORIES = [
  'Literary Fiction', 'Contemporary', 'Mystery', 'Fantasy', 'Science Fiction',
  'History', 'Historical', 'Biography', "Children's",
];

export const AUTHORS = [
  'Nguyễn Nhật Ánh', 'Nguyễn Phan Quế Mai', 'Ocean Vuong', 'Min Jin Lee', 'Han Kang', 'Haruki Murakami',
  'Kazuo Ishiguro', 'Agatha Christie', 'Tana French', 'Isabel Allende', 'Toni Morrison', 'Margaret Atwood',
  'Ursula K. Le Guin', 'James Clear', 'Michelle Obama', 'Khaled Hosseini', 'Anthony Doerr', 'George Orwell',
  'Chimamanda Ngozi Adichie', 'Gabrielle Zevin', 'Antoine de Saint-Exupéry', 'Markus Zusak', 'Erin Morgenstern',
  'Tara Westover', 'Richard Osman', 'Madeline Miller', 'Michelle Zauner', 'J. R. R. Tolkien', 'Sayaka Murata',
  'Matt Haig', 'E. B. White',
];

// [title, author, category, price VND, description, ISBN]
export const BOOKS = [
  ['The Mountains Sing', 'Nguyễn Phan Quế Mai', 'Literary Fiction', 248000, 'A sweeping family story carried across generations of modern Vietnamese history.', '9781641293416'],
  ["On Earth We're Briefly Gorgeous", 'Ocean Vuong', 'Contemporary', 285000, 'A letter from a son to a mother that opens a tender, searching life story.', '9780525562023'],
  ['Pachinko', 'Min Jin Lee', 'Literary Fiction', 329000, 'Four generations of one Korean family build a life far from home.', '9781455563937'],
  ['The Vegetarian', 'Han Kang', 'Literary Fiction', 219000, "A quiet domestic life changes after one woman's startling decision.", '9780553448184'],
  ['Norwegian Wood', 'Haruki Murakami', 'Contemporary', 259000, 'A young man remembers love, loss, and the unsettled years of growing up.', '9780375704024'],
  ['Never Let Me Go', 'Kazuo Ishiguro', 'Science Fiction', 259000, 'Three friends look back on their childhood and a future they cannot escape.', '9781400078776'],
  ['And Then There Were None', 'Agatha Christie', 'Mystery', 195000, 'Ten strangers arrive on an island, where an unseen host begins to judge them.', '9780062073488'],
  ['In the Woods', 'Tana French', 'Mystery', 279000, 'A detective returns to the site of a childhood mystery to investigate a new one.', '9780143113492'],
  ['The House of the Spirits', 'Isabel Allende', 'Literary Fiction', 279000, 'The fortunes and secrets of the Trueba family unfold across a changing country.', '9781501117015'],
  ['Beloved', 'Toni Morrison', 'Literary Fiction', 255000, 'A haunting novel about memory, motherhood, and the long shadow of slavery.', '9781400033416'],
  ["The Handmaid's Tale", 'Margaret Atwood', 'Science Fiction', 245000, 'One woman records what it means to live under a regime built on control.', '9780385490818'],
  ['A Wizard of Earthsea', 'Ursula K. Le Guin', 'Fantasy', 219000, 'A young mage learns the cost of power and the work of knowing oneself.', '9780547773742'],
  ['Atomic Habits', 'James Clear', 'Biography', 315000, 'A practical guide to making small habits work in your favor.', '9780735211292'],
  ['Becoming', 'Michelle Obama', 'Biography', 385000, 'The former First Lady reflects on the people and places that shaped her.', '9781524763138'],
  ['The Kite Runner', 'Khaled Hosseini', 'Contemporary', 279000, 'Two childhood friends are bound by one act and a lifetime of consequence.', '9781594631931'],
  ['All the Light We Cannot See', 'Anthony Doerr', 'Historical', 339000, 'Two young lives cross during the final years of the Second World War.', '9781501173219'],
  ['Animal Farm', 'George Orwell', 'Literary Fiction', 159000, "A farm's revolution becomes a sharp fable about power and memory.", '9780451526342'],
  ['Americanah', 'Chimamanda Ngozi Adichie', 'Contemporary', 289000, 'A love story follows two Nigerians across continents and back home.', '9780307455925'],
  ['Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'Contemporary', 329000, 'Two friends make games together and learn what it takes to keep making a life.', '9780593321201'],
  ['The Little Prince', 'Antoine de Saint-Exupéry', "Children's", 189000, 'A pilot meets a small traveler whose questions reveal a larger world.', '9780156012195'],
  ['The Book Thief', 'Markus Zusak', 'Historical', 289000, 'A girl finds comfort and courage in books during wartime Germany.', '9780375842207'],
  ['The Night Circus', 'Erin Morgenstern', 'Fantasy', 299000, 'A mysterious circus opens only at night, where two magicians are bound to compete.', '9780307744432'],
  ['Educated', 'Tara Westover', 'Biography', 315000, 'A memoir about family, learning, and building a life through education.', '9780399590504'],
  ['The Thursday Murder Club', 'Richard Osman', 'Mystery', 279000, 'Four retirement-village residents turn their curiosity toward an unsolved murder.', '9781984880963'],
  ['The Song of Achilles', 'Madeline Miller', 'Fantasy', 279000, 'A retelling of an ancient friendship and the war that tests it.', '9780062060624'],
  ['Crying in H Mart', 'Michelle Zauner', 'Biography', 289000, 'A daughter uses food, music, and memory to understand the mother she lost.', '9780525657743'],
  ['The Hobbit', 'J. R. R. Tolkien', 'Fantasy', 259000, "A home-loving hobbit joins an unlikely journey toward a dragon's hoard.", '9780547928227'],
  ['Convenience Store Woman', 'Sayaka Murata', 'Contemporary', 199000, "A woman finds order in her work and questions other people's expectations.", '9780802128256'],
  ['The Midnight Library', 'Matt Haig', 'Fantasy', 269000, 'A library of possible lives helps one woman reconsider the choices she made.', '9780525559474'],
  ["Charlotte's Web", 'E. B. White', "Children's", 179000, 'A friendship between a pig and a spider changes the life of a farm.', '9780064400558'],
];

// Open Library cover by ISBN, served through the local cache in src/covers.js.
// A missing cover returns 404 and the page shows the coloured fallback tile instead.
export const isbnCover = coverUrlFor;

export function seedBase(db) {
  const insertStore = db.prepare('INSERT OR IGNORE INTO stores (name) VALUES (?)');
  for (const name of STORES) insertStore.run(name);

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(config.adminEmail)) return;
  if (!config.adminPassword) {
    console.warn('[seed] ADMIN_PASSWORD is not set in .env – the admin account was not created.');
    return;
  }
  db.prepare(`INSERT INTO users (email, full_name, password_hash, role, status, created_at)
    VALUES (?, ?, ?, 'Administrator', 'Active', ?)`).run(config.adminEmail, config.adminName, hashPasswordSync(config.adminPassword), Date.now());
  console.log(`[seed] Created administrator ${config.adminEmail}`);
}

export function seedBooks(db) {
  const stores = db.prepare('SELECT id FROM stores ORDER BY id').all();

  transaction(db, () => {
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    const insertAuthor = db.prepare('INSERT OR IGNORE INTO authors (name) VALUES (?)');
    CATEGORIES.forEach((n) => insertCategory.run(n));
    AUTHORS.forEach((n) => insertAuthor.run(n));
    const idOf = (table, name) => db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name).id;

    const insertBook = db.prepare(`INSERT INTO books (title, author_id, category_id, price, description, cover_path, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`);
    const insertStock = db.prepare('INSERT INTO book_stock (book_id, store_id, quantity) VALUES (?, ?, ?)');
    const base = Date.now() - BOOKS.length * 3_600_000;

    BOOKS.forEach(([title, author, category, price, description, isbn], i) => {
      const created = base + i * 3_600_000; // later rows are newer
      const id = Number(insertBook.run(title, idOf('authors', author), idOf('categories', category), price, description,
        isbnCover(isbn), created, created).lastInsertRowid);
      stores.forEach((s, j) => insertStock.run(id, s.id, 3 + ((i * 3 + j * 2) % 14)));
    });
  });
  console.log(`[seed] Added ${BOOKS.length} books`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
    console.log(`[seed] Removed ${config.dbPath}`);
  }
  const db = openDb(config.dbPath);
  seedBase(db);
  if (db.prepare('SELECT COUNT(*) AS n FROM books').get().n === 0) seedBooks(db);
  else console.log('[seed] Books already exist – skipped (use npm run seed:reset to start over).');
  db.close();
}
