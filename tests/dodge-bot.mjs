// Plays Neon Dodge with a look-ahead dodging bot to check that patterns stay fair (survivable) over time.
import { launch, watch, BASE } from './lib.mjs';
const SECS = Number(process.env.SECS || 60);
const { browser, ctx } = await launch({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage(); const errors = []; watch(page, errors);
await page.goto(BASE + 'games/neon-dodge/'); await page.waitForSelector('[data-act=start]');
await page.click('[data-act=start]');
await page.evaluate(() => {
  const { S, shell } = window.__dodge;
  const dirs = [[0, 0]]; for (let a = 0; a < 8; a++) dirs.push([Math.round(Math.cos(a * Math.PI / 4) * 100) / 100, Math.round(Math.sin(a * Math.PI / 4) * 100) / 100]);
  const danger = (vx, vy) => {
    let cost = 0; const p = S.p;
    for (let t = 0.04; t <= 0.7; t += 0.04) {
      const px = Math.max(9, Math.min(471, p.x + vx * t)), py = Math.max(9, Math.min(631, p.y + vy * t));
      for (const h of S.hz) {
        let d = 1e9;
        if (h.k === 'block') { const x = h.x + h.vx * t, y = h.y + h.vy * t; const nx = Math.max(x, Math.min(px, x + h.w)), ny = Math.max(y, Math.min(py, y + h.h)); d = Math.hypot(px - nx, py - ny); }
        else if (h.k === 'bullet') d = Math.hypot(px - (h.x + h.vx * t), py - (h.y + h.vy * t)) - h.r;
        else if (h.k === 'mine') d = Math.hypot(px - h.x, py - h.y) - h.r - 8 * t * 6;
        else if (h.k === 'laser') { const tt = h.t + t; if (tt > h.warn - 0.15 && tt < h.warn + h.active + 0.1) d = Math.abs((h.dir === 'h' ? py : px) - h.pos) - 8; else if (tt >= h.warn - 0.6 && tt <= h.warn) d = Math.abs((h.dir === 'h' ? py : px) - h.pos) - 20 + 14; }
        if (d < 14) cost += (14 - d) * (14 - d) * 3 + (d < 8 ? 500 : 0);
      }
    }
    // gentle pull to the middle / lower area
    cost += Math.abs(p.x + vx * 0.3 - 240) * 0.02 + Math.abs(p.y + vy * 0.3 - 470) * 0.01;
    return cost;
  };
  window.__botStats = { frames: 0 };
  const loop = () => {
    if (shell.state === 'playing') {
      let best = null, bc = 1e18;
      for (const [dx, dy] of dirs) { const c = danger(dx * 330, dy * 330) + (dx || dy ? 0.5 : 0); if (c < bc) { bc = c; best = [dx, dy]; } }
      const I = shell.input;
      I.set('bot', 'left', best[0] < -0.3); I.set('bot', 'right', best[0] > 0.3); I.set('bot', 'up', best[1] < -0.3); I.set('bot', 'down', best[1] > 0.3);
      if (bc > 900 && S.p.dashCd <= 0) { I.set('botd', 'dash', true); setTimeout(() => I.set('botd', 'dash', false), 50); }
    }
    window.__botStats.frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
let shot = false;
for (let s = 0; s < SECS; s += 5) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => ({ t: window.__dodge.S.t.toFixed(1), score: window.__dodge.S.score, state: window.__dodge.shell.state, hz: window.__dodge.S.hz.length }));
  console.log(JSON.stringify(st));
  if (!shot && Number(st.t) > 30) { await page.screenshot({ path: '/tmp/nd-mid.png' }); shot = true; }
  if (st.state === 'over') break;
}
console.log('errors', errors);
await browser.close();
