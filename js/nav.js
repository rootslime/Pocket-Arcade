// Spatial (directional) focus navigation for menus: arrows / D-pad move focus to the nearest
// focusable element in that direction. Used by the console UI and by in-game overlays.
const FOCUSABLE = 'button:not(:disabled), a[href], [data-nav], input:not(:disabled), select:not(:disabled), [tabindex="0"]';

function visible(el) {
  if (el.hidden || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

export function focusables(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[inert]') && visible(el));
}

/** Move focus within `container` in direction dir. Returns true if focus moved. */
export function moveFocus(container, dir) {
  const items = focusables(container);
  if (!items.length) return false;
  let cur = document.activeElement;
  if (!cur || !container.contains(cur) || !items.includes(cur)) { items[0].focus(); return true; }
  const cr = cur.getBoundingClientRect();
  const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - cx, dy = y - cy;
    let primary, off;
    if (dir === 'right') { if (dx <= 4) continue; primary = dx; off = Math.abs(dy); }
    else if (dir === 'left') { if (dx >= -4) continue; primary = -dx; off = Math.abs(dy); }
    else if (dir === 'down') { if (dy <= 4) continue; primary = dy; off = Math.abs(dx); }
    else { if (dy >= -4) continue; primary = -dy; off = Math.abs(dx); }
    const score = primary + off * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return false;
  best.focus({ preventScroll: false });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

export const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
