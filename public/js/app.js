// Progressive enhancement only. Every rule is enforced again on the server, and every page works without this file.
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Form validation (mirrors src/validate.js) ---------- */
  function label(el) { return el.getAttribute('data-label') || el.name; }

  function check(el, form) {
    var v = el.value;
    if (el.type === 'file') {
      var f = el.files && el.files[0];
      if (!f) return el.required ? label(el) + ' is required' : '';
      var max = Number(el.getAttribute('data-max-bytes') || 0);
      if (max && f.size > max) return 'Cover image must be 2 MB or smaller';
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return 'Cover must be a JPG, PNG or WEBP image';
      return '';
    }
    if (el.required && !v.trim()) return label(el) + ' is required';
    if (!v) return '';
    if (el.type === 'email' && !EMAIL_RE.test(v.trim())) return 'Email is invalid';
    if (el.minLength > 0 && v.length < el.minLength) return label(el) + ' must be at least ' + el.minLength + ' characters';
    if (el.maxLength > 0 && v.trim().length > el.maxLength) return label(el) + ' must be at most ' + el.maxLength + ' characters';
    if (el.hasAttribute('data-password') && !(/[A-Za-z]/.test(v) && /\d/.test(v))) return 'Password must contain at least one letter and one number';
    var match = el.getAttribute('data-match');
    if (match && form.elements[match] && form.elements[match].value !== v) return 'Passwords do not match';
    if (el.type === 'number') {
      if (!/^\d+$/.test(v.trim())) return label(el) + ' must be a whole number' + (el.min === '1' ? ' greater than 0' : ' of 0 or more');
      if (el.min !== '' && Number(v) < Number(el.min)) return label(el) + ' must be at least ' + el.min;
      if (el.max !== '' && Number(v) > Number(el.max)) return label(el) + ' must be at most ' + el.max;
    }
    return '';
  }

  function show(el, msg) {
    var ids = (el.getAttribute('aria-describedby') || '').split(' ');
    var box = document.getElementById(ids[0]);
    if (box) box.textContent = msg;
    if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  }

  function fields(form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.name && el.type !== 'hidden' && el.type !== 'submit' && el.tagName !== 'BUTTON';
    });
  }

  document.querySelectorAll('form[data-validate]').forEach(function (form) {
    form.noValidate = true;
    form.addEventListener('submit', function (e) {
      var first = null;
      fields(form).forEach(function (el) {
        var msg = check(el, form);
        show(el, msg);
        if (msg && !first) first = el;
      });
      if (first) { e.preventDefault(); first.focus(); }
    });
    fields(form).forEach(function (el) {
      el.addEventListener(el.type === 'file' || el.tagName === 'SELECT' ? 'change' : 'blur', function () {
        if (el.value || el.getAttribute('aria-invalid')) show(el, check(el, form));
      });
    });
  });

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  /* ---------- Menus: public nav and staff sidebar ---------- */
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    var target = document.getElementById(btn.getAttribute('data-toggle'));
    if (!target) return;
    btn.addEventListener('click', function () {
      var open = target.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  document.querySelectorAll('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-close'));
      if (target) target.classList.remove('is-open');
      document.querySelectorAll('[data-toggle="' + btn.getAttribute('data-close') + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.is-open').forEach(function (el) { el.classList.remove('is-open'); });
    document.querySelectorAll('[data-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  });

  /* ---------- Covers: show the coloured fallback tile when an image cannot load ---------- */
  function markFailed(img) { if (img.parentNode) img.parentNode.classList.add('cover-failed'); }
  document.querySelectorAll('img[data-cover]').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) markFailed(img); // failed before this script ran
    img.addEventListener('error', function () { markFailed(img); });
  });

  /* ---------- Cover upload: show file name and a local preview ---------- */
  document.querySelectorAll('input[type="file"][data-preview]').forEach(function (input) {
    var nameEl = input.parentNode.querySelector('[data-file-name]');
    var original = nameEl ? nameEl.textContent : '';
    var preview = document.getElementById(input.getAttribute('data-preview'));
    var originalSrc = preview ? preview.getAttribute('src') : null;
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (nameEl) nameEl.textContent = f ? f.name : original;
      if (!preview) return;
      if (f && /^image\/(jpeg|png|webp)$/.test(f.type)) {
        preview.src = URL.createObjectURL(f);
        preview.classList.remove('is-empty');
      } else if (originalSrc) {
        preview.src = originalSrc;
      } else {
        preview.removeAttribute('src');
        preview.classList.add('is-empty');
      }
    });
  });
})();
