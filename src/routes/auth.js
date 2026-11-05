// US01 Register, US02 Login / logout, /account (TC07)
import { html } from '../html.js';
import { readForm, field } from '../http.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../security.js';
import { startSession, endSession, requireLogin, safeNext } from '../middleware.js';
import { normalizeEmail, cleanText, emailError, passwordError, textError, hasErrors, LIMITS } from '../validate.js';
import { layout } from '../views/layout.js';
import { field as input, errorSummary, notice, formatDate } from '../views/form.js';
import { icon } from '../views/icons.js';

export const MSG = {
  duplicateEmail: 'Email is already registered',
  invalidLogin: 'Invalid email or password',
  locked: 'Your account is locked. Please contact the store.',
  expired: 'Your session has expired. Please log in again.',
};

const COPY = {
  login: {
    title: 'Sign in', heading: 'Good to see you again.', lead: 'Sign in to pick up where your reading life left off.',
    eyebrow: 'Welcome back', formTitle: 'Sign in', switchText: 'New to the shelf?', switchHref: '/register', switchLabel: 'Create an account',
  },
  register: {
    title: 'Join the shelf', heading: 'Make room for more stories.', lead: 'Create your free reader account and stay close to the books we love.',
    eyebrow: 'A small first step', formTitle: 'Join our reading corner', switchText: 'Already have an account?', switchHref: '/login', switchLabel: 'Sign in',
  },
};

function authPage(ctx, mode, form) {
  const c = COPY[mode];
  return layout(ctx, {
    title: c.title,
    main: 'main-auth',
    body: html`<div class="auth-grid">
  <div class="auth-panel">
    <div>
      <p class="mono eyebrow gold">The Common Shelf</p>
      <h1 class="serif auth-heading">${c.heading}</h1>
      <p class="auth-lead">${c.lead}</p>
    </div>
    <p class="mono auth-foot">Independent bookselling, since day one</p>
  </div>
  <div class="auth-card">
    <p class="mono eyebrow muted">${c.eyebrow}</p>
    <h2 class="serif auth-title">${c.formTitle}</h2>
    ${form}
    <p class="auth-switch muted">${c.switchText} <a href="${c.switchHref}">${c.switchLabel}</a></p>
  </div>
</div>`,
  });
}

function registerPage(ctx, { values = {}, errors = {} } = {}) {
  return authPage(ctx, 'register', html`<form method="post" action="/register" class="stack-form" data-validate>
  ${input({ label: 'Your name', name: 'full_name', value: values.full_name, error: errors.full_name, required: true, attrs: `maxlength="${LIMITS.fullName}" autocomplete="name"` })}
  ${input({ label: 'Email address', name: 'email', type: 'email', value: values.email, error: errors.email, required: true, attrs: 'maxlength="254" autocomplete="email"' })}
  ${input({ label: 'Password', name: 'password', type: 'password', error: errors.password, required: true, attrs: 'minlength="8" maxlength="128" data-password autocomplete="new-password"', hint: 'Use at least 8 characters, including a letter and a number.' })}
  ${input({ label: 'Confirm password', name: 'confirm_password', type: 'password', error: errors.confirm_password, required: true, attrs: 'data-match="password" autocomplete="new-password"' })}
  ${errorSummary(errors)}
  <button type="submit" class="btn btn-primary btn-block">Create reader account ${icon('arrowRight', 16)}</button>
</form>`);
}

function loginPage(ctx, { email = '', error, next = '', info } = {}) {
  return authPage(ctx, 'login', html`<form method="post" action="/login" class="stack-form" data-validate>
  <input type="hidden" name="next" value="${next}">
  ${info ? notice('success', info) : ''}
  ${input({ label: 'Email address', name: 'email', type: 'email', value: email, required: true, attrs: 'maxlength="254" autocomplete="email"' })}
  ${input({ label: 'Password', name: 'password', type: 'password', required: true, attrs: 'maxlength="128" autocomplete="current-password"' })}
  ${notice('error', error)}
  <button type="submit" class="btn btn-primary btn-block">Sign in ${icon('arrowRight', 16)}</button>
</form>`);
}

const homeFor = (user) => (user.role === 'Administrator' ? '/admin' : '/account');

export default function authRoutes(router) {
  router.get('/register', (ctx) => {
    if (ctx.user) return ctx.redirect(homeFor(ctx.user));
    ctx.send(200, registerPage(ctx));
  });

  router.post('/register', async (ctx) => {
    const form = await readForm(ctx.req);
    const values = { full_name: cleanText(field(form, 'full_name')), email: normalizeEmail(field(form, 'email')) };
    const password = field(form, 'password');
    const errors = {
      full_name: textError(values.full_name, 'Full name', { max: LIMITS.fullName }),
      email: emailError(values.email),
      password: passwordError(password),
    };
    if (!errors.password && password !== field(form, 'confirm_password')) errors.confirm_password = 'Passwords do not match';
    if (!errors.email && ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').get(values.email)) errors.email = MSG.duplicateEmail;
    if (hasErrors(errors)) return ctx.send(400, registerPage(ctx, { values, errors }));

    const hash = await hashPassword(password);
    let id;
    try {
      id = ctx.db.prepare(`INSERT INTO users (email, full_name, password_hash, role, status, created_at)
        VALUES (?, ?, ?, 'Customer', 'Active', ?)`).run(values.email, values.full_name, hash, Date.now()).lastInsertRowid;
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
      return ctx.send(400, registerPage(ctx, { values, errors: { email: MSG.duplicateEmail } }));
    }
    startSession(ctx, { id: Number(id), email: values.email, full_name: values.full_name, role: 'Customer' });
    ctx.setFlash('success', `Welcome to the shelf, ${values.full_name}! Your reader account is ready.`);
    ctx.redirect('/account');
  });

  router.get('/login', (ctx) => {
    const next = safeNext(ctx.query.get('next')) || '';
    if (ctx.user) return ctx.redirect(next || homeFor(ctx.user));
    const info = ctx.query.get('expired') === '1' || ctx.sessionExpired ? MSG.expired
      : next ? 'Please sign in to continue.' : null;
    ctx.send(200, loginPage(ctx, { next, info }));
  });

  router.post('/login', async (ctx) => {
    const form = await readForm(ctx.req);
    const email = normalizeEmail(field(form, 'email'));
    const password = field(form, 'password');
    const next = safeNext(field(form, 'next')) || '';
    if (!email || !password) {
      return ctx.send(400, loginPage(ctx, { email, next, error: 'Email and password are required' }));
    }
    const user = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return ctx.send(401, loginPage(ctx, { email, next, error: MSG.invalidLogin }));
    if (user.status === 'Locked') return ctx.send(403, loginPage(ctx, { email, next, error: MSG.locked }));

    startSession(ctx, user);
    ctx.redirect(next || homeFor(user));
  });

  router.post('/logout', (ctx) => {
    endSession(ctx);
    ctx.setFlash('success', 'You have been signed out. See you soon.');
    ctx.redirect('/login');
  });

  router.get('/account', requireLogin, (ctx) => {
    const u = ctx.db.prepare('SELECT email, full_name, role, status, created_at FROM users WHERE id = ?').get(ctx.user.id);
    ctx.send(200, layout(ctx, {
      title: 'Your account',
      main: 'main-account',
      body: html`<p class="mono eyebrow">Reader account</p>
<h1 class="serif account-title">Welcome, ${u.full_name}.</h1>
<div class="account-grid">
  <div class="card">
    <p class="mono eyebrow muted">Account details</p>
    <p class="serif account-name">${u.full_name}</p>
    <p class="muted">${u.email}</p>
    <p class="mono small muted account-since">Member since ${formatDate(u.created_at)}</p>
  </div>
  <div class="card card-sage">
    <p class="mono eyebrow">${u.role === 'Administrator' ? 'Staff status' : 'Reader status'}</p>
    <p class="serif account-name">${u.status}</p>
    <p class="small text-primary">${u.role === 'Administrator' ? 'You can manage the catalogue from the staff desk.' : 'You’re part of our local reading community.'}</p>
    ${u.role === 'Administrator' ? html`<a href="/admin" class="btn btn-primary account-cta">Open staff desk ${icon('arrowRight', 15)}</a>` : html`<a href="/books" class="btn btn-primary account-cta">Browse the shelves ${icon('arrowRight', 15)}</a>`}
  </div>
</div>`,
    }));
  });
}
