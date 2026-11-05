-- Book Store schema (Sprint 1 + Sprint 2). Executed on every start; all statements are idempotent.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE CHECK (email = lower(email)),
  full_name     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('Administrator', 'Customer')),
  status        TEXT    NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Locked')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 50)
);

CREATE TABLE IF NOT EXISTS authors (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 100)
);

-- Price is stored as an integer number of VND. Stock lives in book_stock (CR-03), not here.
CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  author_id   INTEGER NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price       INTEGER NOT NULL CHECK (price > 0),
  description TEXT    NOT NULL DEFAULT '',
  cover_path  TEXT,
  is_deleted  INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_visible ON books(is_deleted, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);

CREATE TABLE IF NOT EXISTS stores (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book_stock (
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (book_id, store_id)
);
