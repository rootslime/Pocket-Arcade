// Self-contained toast notifications (injects its own CSS). Used for achievements, level-ups,
// controller status and general messages on every page.
import { prefersReducedMotion } from './storage.js';

let host = null;
const queue = [];
let showing = 0;

function ensureHost() {
  if (host) return host;
  const st = document.createElement('style');
  st.textContent = `
  .pa-toasts{position:fixed;top:max(12px,env(safe-area-inset-top));right:12px;z-index:200;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none;max-width:min(360px,calc(100vw - 24px))}
  .pa-toast{pointer-events:auto;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:14px;color:#eef0ff;font:600 .9rem "Trebuchet MS","Segoe UI",system-ui,sans-serif;background:linear-gradient(135deg,#1b1f5e,#10123f);border:1px solid var(--pa-toast,#ffe14d);box-shadow:0 8px 30px rgba(0,0,0,.5),0 0 22px color-mix(in srgb,var(--pa-toast,#ffe14d) 45%,transparent);animation:paIn .35s cubic-bezier(.2,.9,.3,1.2) both}
  .pa-toast.out{animation:paOut .3s ease-in both}
  .pa-toast .ic{font-size:1.7rem;line-height:1;filter:drop-shadow(0 0 8px var(--pa-toast,#ffe14d))}
  .pa-toast .tt{display:flex;flex-direction:column;min-width:0}
  .pa-toast small{font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:.62rem;color:var(--pa-toast,#ffe14d)}
  .pa-toast strong{font-size:1rem;line-height:1.2}
  .pa-toast span.d{font-weight:500;font-size:.8rem;color:#b9bff0}
  @keyframes paIn{from{transform:translateX(120%) scale(.9);opacity:0}}
  @keyframes paOut{to{transform:translateY(-14px);opacity:0}}
  .pa-reduce .pa-toast,.pa-reduce .pa-toast.out{animation:none}
  @media (prefers-reduced-motion:reduce){.pa-toast,.pa-toast.out{animation:none}}`;
  document.head.appendChild(st);
  host = document.createElement('div');
  host.className = 'pa-toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/** Generic toast. opts: { icon, kicker, title, text, color, ms } */
export function toast(opts) {
  const h = ensureHost();
  h.classList.toggle('pa-reduce', prefersReducedMotion());
  const el = document.createElement('div');
  el.className = 'pa-toast';
  el.style.setProperty('--pa-toast', opts.color || '#ffe14d');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  el.innerHTML = `<span class="ic" aria-hidden="true">${esc(opts.icon || '★')}</span><span class="tt">${opts.kicker ? `<small>${esc(opts.kicker)}</small>` : ''}<strong>${esc(opts.title)}</strong>${opts.text ? `<span class="d">${esc(opts.text)}</span>` : ''}</span>`;
  h.appendChild(el);
  const done = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  setTimeout(done, opts.ms || 4200);
  el.addEventListener('click', done);
  while (h.children.length > 4) h.firstChild.remove();
  return el;
}

export const achievementToast = (a) => toast({ icon: a.icon, kicker: 'Achievement unlocked', title: a.name, text: a.desc, color: '#ffe14d', ms: 5200 });
export const levelUpToast = (level, rewards = []) => toast({ icon: '⬆️', kicker: 'Level up!', title: `Arcade Level ${level}`, text: rewards.length ? `New: ${rewards.map((r) => r.name).join(', ')}` : '', color: '#5dff8f', ms: 5200 });
