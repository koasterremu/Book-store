// US03 Public book grid with pagination; minimal /books/:id so hidden books report "not available" (TC24).
import { html } from '../html.js';
import { parseIntStrict, clampPage } from '../validate.js';
import { layout, statusPage } from '../views/layout.js';
import { pagination, formatPrice, cover } from '../views/form.js';
import { icon } from '../views/icons.js';

export const PER_PAGE = 12;
export const MSG = { unavailable: 'This book is not available', empty: 'No books available yet' };

function bookTile(b, i) {
  return html`<article class="book-card fade-in" data-book-id="${b.id}">
  <a href="/books/${b.id}" class="book-link">
    <div class="tile">
      ${cover(b, { index: i, eager: i < 5 })}
      <span class="price-tag mono">${formatPrice(b.price)}</span>
    </div>
    <h3 class="book-title">${b.title}</h3>
    <p class="book-author">${b.author}</p>
  </a>
</article>`;
}

const hero = html`<section class="hero">
  <div class="hero-ring" aria-hidden="true"></div>
  <div class="hero-book" aria-hidden="true"><div class="hero-book-inner"><span class="mono">A little room<br>to get lost</span><span class="serif">Stories<br>make us<br>neighbours</span></div></div>
  <div class="hero-copy">
    <p class="mono eyebrow">Your next favourite is here</p>
    <h1 class="serif hero-title">Find a story<br>to <em>stay with.</em></h1>
    <p class="hero-text">A thoughtfully chosen collection from the booksellers down the street. Browse what’s on our shelves today.</p>
    <a href="#catalog" class="hero-link">Explore the catalogue ${icon('arrowRight', 16)}</a>
  </div>
</section>`;

export default function catalogRoutes(router) {
  router.get('/', (ctx) => ctx.redirect('/books', 302));

  router.get('/books', (ctx) => {
    const total = ctx.db.prepare('SELECT COUNT(*) AS n FROM books WHERE is_deleted = 0').get().n;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const page = clampPage(ctx.query.get('page'), totalPages);
    const books = ctx.db.prepare(`SELECT b.id, b.title, b.price, b.cover_path, a.name AS author, c.name AS category
      FROM books b JOIN authors a ON a.id = b.author_id JOIN categories c ON c.id = b.category_id
      WHERE b.is_deleted = 0
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ? OFFSET ?`).all(PER_PAGE, (page - 1) * PER_PAGE);

    ctx.send(200, layout(ctx, {
      title: page > 1 ? `Browse – page ${page}` : 'Browse',
      body: html`<div class="wrap catalog-page">
${page === 1 ? hero : ''}
<section id="catalog" class="catalog">
  <div class="section-head">
    <div><p class="mono eyebrow muted">Curated locally</p><h2 class="serif section-title">On our shelves</h2></div>
    ${total ? html`<span class="mono muted small">${total} titles · page ${page} of ${totalPages}</span>` : ''}
  </div>
  ${books.length === 0
    ? html`<div class="empty-card dashed">${icon('bookOpen', 26, 'text-primary')}<h3 class="serif">${MSG.empty}</h3><p class="muted">New titles are on their way. Come back soon.</p></div>`
    : html`<div class="book-grid">${books.map(bookTile)}</div>`}
  ${pagination('/books', page, totalPages)}
</section>
</div>`,
    }));
  });

  router.get('/books/:id', (ctx) => {
    const id = parseIntStrict(ctx.params.id, { min: 1 });
    const book = id && ctx.db.prepare(`SELECT b.*, a.name AS author, c.name AS category
      FROM books b JOIN authors a ON a.id = b.author_id JOIN categories c ON c.id = b.category_id
      WHERE b.id = ?`).get(id);

    if (!book || book.is_deleted) {
      const page = statusPage(ctx, {
        title: 'Not available',
        eyebrow: 'Not on the public shelf',
        heading: MSG.unavailable,
        text: 'It may have found a new home or be taking a short break.',
      });
      return ctx.send(404, page);
    }

    ctx.send(200, layout(ctx, {
      title: book.title,
      main: 'main-narrow',
      body: html`<article class="book-detail">
  <div class="detail-cover">${cover(book, { eager: true })}</div>
  <p class="mono eyebrow muted">${book.category}</p>
  <h1 class="serif detail-title">${book.title}</h1>
  <p class="muted">${book.author}</p>
  <p class="detail-price mono">${formatPrice(book.price)}</p>
  ${book.description ? html`<p class="detail-desc">${book.description}</p>` : ''}
  <a href="/books" class="btn btn-primary">${icon('arrowLeft', 16)} Back to browsing</a>
</article>`,
    }));
  });
}
