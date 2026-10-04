// Small UI helpers: HTML escaping and an accessible modal stack.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stack = [];
let root = null;

function ensureRoot() {
  if (!root) { root = document.createElement('div'); root.id = 'modal-root'; document.body.appendChild(root); }
  return root;
}

/**
 * Open a modal. opts: { title, html, dismissable=true, wide, onClose, className }
 * Returns { el, close }. Focus is trapped inside and restored on close.
 */
export function openModal(opts) {
  const host = ensureRoot();
  const prevFocus = document.activeElement;
  const el = document.createElement('div');
  el.className = 'modal' + (opts.className ? ' ' + opts.className : '');
  const id = 'modal-title-' + Math.random().toString(36).slice(2, 7);
  el.innerHTML = `<div class="modal-card${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1">
    ${opts.dismissable === false ? '' : '<button type="button" class="modal-x" data-close aria-label="Close dialog">×</button>'}
    <h2 id="${id}">${esc(opts.title)}</h2>
    <div class="modal-body">${opts.html || ''}</div></div>`;
  host.appendChild(el);
  const card = el.querySelector('.modal-card');
  const entry = { el, card, close, opts };
  stack.push(entry);
  document.body.classList.add('modal-open');
  const root = document.getElementById('view');
  if (root) root.setAttribute('inert', '');
  const nav = document.querySelector('.nav');
  if (nav) nav.setAttribute('inert', '');
  const first = card.querySelector('[autofocus], input, button.primary, button:not([data-close]), a[href]') || card;
  setTimeout(() => { if (!card.contains(document.activeElement)) first.focus({ preventScroll: true }); }, 30);

  el.addEventListener('mousedown', (e) => { if (e.target === el && opts.dismissable !== false) close(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...card.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]')].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });

  function close() {
    const i = stack.indexOf(entry);
    if (i < 0) return;
    stack.splice(i, 1);
    el.remove();
    if (!stack.length) {
      document.body.classList.remove('modal-open');
      if (root) root.removeAttribute('inert');
      if (nav) nav.removeAttribute('inert');
      if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
    }
    if (opts.onClose) opts.onClose();
  }
  return entry;
}

export const topModal = () => stack[stack.length - 1] || null;
export const closeTopModal = () => { const m = topModal(); if (m && m.opts.dismissable !== false) { m.close(); return true; } return false; };
export const closeAllModals = () => { while (stack.length) stack[stack.length - 1].close(); };
export const hasModal = () => stack.length > 0;

// Escape closes the top modal even if focus has not moved inside it yet.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !stack.length) return;
  const m = stack[stack.length - 1];
  if (m.opts.dismissable === false) return;
  e.preventDefault(); e.stopPropagation();
  m.close();
}, true);
