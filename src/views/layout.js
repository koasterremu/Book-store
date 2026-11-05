// Page shells in the style of the Blueprint "The Common Shelf" UI: public layout, staff workspace, status pages.
import { html, raw } from '../html.js';
import { icon } from './icons.js';
import { notice } from './form.js';

const BRAND = 'The Common Shelf';

function head(title) {
  return html`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${BRAND}</title>
<meta name="description" content="A neighbourhood bookstore – browse what's on our shelves today.">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&display=swap">
<link rel="stylesheet" href="/css/style.css">
<script src="/js/app.js" defer></script>`;
}

const flashNotice = (ctx) => (ctx.flash ? notice(ctx.flash.type === 'error' ? 'error' : 'success', ctx.flash.message) : '');

function brandMark() {
  return html`<span class="brand-badge">${icon('bookOpen', 20)}</span>`;
}

function publicHeader(ctx) {
  const u = ctx.user;
  return html`<header class="site-header">
  <div class="wrap header-inner">
    <a href="/books" class="brand">${brandMark()}<span><span class="brand-name serif">${BRAND}</span><span class="brand-tag mono">Books for the neighbourhood</span></span></a>
    <button type="button" class="menu-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="site-nav" data-toggle="site-nav">${icon('menu', 21)}</button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      <a href="/books" class="nav-link">Browse</a>
      ${u ? html`
        <a href="/account" class="nav-link">Your account</a>
        ${u.role === 'Administrator' ? html`<a href="/admin" class="nav-link">Staff desk</a>` : ''}
        <form method="post" action="/logout" class="inline-form"><button type="submit" class="btn btn-outline">${icon('logOut', 15)} Sign out</button></form>`
    : html`
        <a href="/login" class="nav-link">Sign in</a>
        <a href="/register" class="btn btn-primary">Join the shelf ${icon('arrowRight', 15)}</a>`}
    </nav>
  </div>
</header>`;
}

export function layout(ctx, { title, body, main = 'main-default' }) {
  return html`<!doctype html>
<html lang="en">
<head>${head(title)}</head>
<body class="paper-grain">
<a class="skip-link" href="#main">Skip to content</a>
${publicHeader(ctx)}
<main id="main" class="${main}">
${ctx.flash ? html`<div class="flash-slot">${flashNotice(ctx)}</div>` : ''}
${body}
</main>
<footer class="site-footer"><div class="wrap footer-inner"><p class="serif footer-quote">A good book belongs to everyone.</p><p class="mono footer-note">Independent bookselling · close to home</p></div></footer>
</body>
</html>`;
}

const ADMIN_LINKS = [
  ['/admin', 'Overview', 'library'],
  ['/admin/books', 'Books', 'bookOpen'],
  ['/admin/categories', 'Categories', 'bookOpen'],
  ['/admin/authors', 'Authors', 'pencil'],
  ['/admin/users', 'Accounts', 'users'],
];

export function adminLayout(ctx, { title, eyebrow, body, actions = '' }) {
  const p = ctx.path;
  return html`<!doctype html>
<html lang="en">
<head>${head(title)}</head>
<body class="admin-body">
<a class="skip-link" href="#main">Skip to content</a>
<div class="admin-shell">
  <aside id="admin-nav" class="admin-sidebar">
    <a href="/books" class="admin-brand"><span class="brand-badge brand-badge-gold">${icon('bookOpen', 20)}</span><span class="serif">Common Shelf</span></a>
    <p class="mono sidebar-label">Workspace</p>
    <nav class="sidebar-nav" aria-label="Staff">
      ${ADMIN_LINKS.map(([href, label, ic]) => {
    const active = p === href || (href !== '/admin' && p.startsWith(`${href}/`));
    return html`<a href="${href}" class="sidebar-link${active ? ' is-active' : ''}"${active ? raw(' aria-current="page"') : ''}>${icon(ic, 17)}${label}</a>`;
  })}
    </nav>
    <div class="sidebar-card">
      <p class="serif">The neighbourhood is reading.</p>
      <p class="sidebar-card-text">Keep the shelves inviting and the catalogue current.</p>
      <a href="/books" class="sidebar-card-link">View storefront ${icon('arrowRight', 13)}</a>
      <form method="post" action="/logout" class="inline-form"><button type="submit" class="sidebar-signout">${icon('logOut', 13)} Sign out</button></form>
    </div>
  </aside>
  <button type="button" class="sidebar-backdrop" aria-label="Close menu" data-close="admin-nav"></button>
  <main id="main" class="admin-main">
    <button type="button" class="admin-menu-btn" aria-label="Open staff navigation" aria-expanded="false" aria-controls="admin-nav" data-toggle="admin-nav">${icon('menu', 18)}</button>
    <div class="admin-content">
      <div class="admin-head">
        <div><p class="mono eyebrow">${eyebrow}</p><h1 class="serif admin-title">${title}</h1></div>
        <span class="mono workspace-pill">Staff workspace</span>
      </div>
      ${ctx.flash ? html`<div class="flash-slot">${flashNotice(ctx)}</div>` : ''}
      ${actions ? html`<div class="toolbar">${actions}</div>` : ''}
      ${body}
    </div>
  </main>
</div>
</body>
</html>`;
}

// Centered status page used for 403/404/errors and the "not available" book page.
export function statusPage(ctx, { title, eyebrow, heading, text, ic = 'bookOpen', tone = '', action = { href: '/books', label: 'Return to the catalogue', back: true } }) {
  return layout(ctx, {
    title,
    main: 'main-narrow',
    body: html`<section class="status-page">
  <span class="status-icon ${tone}">${icon(ic, 34)}</span>
  ${eyebrow ? html`<p class="mono eyebrow muted">${eyebrow}</p>` : ''}
  <h1 class="serif status-title">${heading}</h1>
  <p class="muted status-text">${text}</p>
  ${action ? html`<a href="${action.href}" class="btn btn-primary">${action.back ? icon('arrowLeft', 16) : ''} ${action.label}</a>` : ''}
</section>`,
  });
}

const ERRORS = {
  400: ['Something needs a second look', 'The request could not be processed.'],
  403: ['Staff access only.', 'This account does not have administrator access.'],
  404: ['This page is off the shelf', 'The page you are looking for does not exist.'],
  405: ['Not quite the right door', 'This action is not allowed for this address.'],
  413: ['That file is too large', 'Cover images must be 2 MB or smaller.'],
  500: ['The shelves wobbled', 'An unexpected error occurred. Please try again.'],
};

export function errorPage(ctx, status, message) {
  const [heading, fallback] = ERRORS[status] || ERRORS[500];
  return statusPage(ctx, {
    title: heading,
    eyebrow: `Error ${status}`,
    heading,
    text: message || fallback,
    ic: status === 403 ? 'shield' : status >= 500 ? 'alert' : 'bookOpen',
    tone: status >= 500 ? 'tone-danger' : '',
    action: { href: '/books', label: 'Back to the shelf', back: true },
  });
}
