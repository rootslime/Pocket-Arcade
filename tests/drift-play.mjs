// Plays a full Drift Circuit race in the browser with a pure-pursuit bot (real keyboard-equivalent inputs).
import { launch, watch, BASE } from './lib.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const track = process.argv[2] || 'neon';
const { browser, ctx } = await launch({ viewport: { width: 1000, height: 700 } });
const page = await ctx.newPage(); const errors = []; watch(page, errors);
await page.goto(BASE + 'games/drift-circuit/'); await page.waitForSelector('[data-act=start]');
await page.click(`.mode-btn[data-mode=${track}]`);
await page.click('[data-act=start]');
await page.evaluate(() => {
  const D = window.__drift, I = D.shell.input;
  const loop = () => {
    if (D.shell.state === 'playing') {
      const r = D.race, c = r.car, T = r.track;
      const sp = Math.hypot(c.vx, c.vy);
      const tgt = T.pts[(c.idx + 10 + Math.floor(sp / 18)) % T.N];
      let d = Math.atan2(tgt.y - c.y, tgt.x - c.x) - c.a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      I.set('bot', 'left', d < -0.04); I.set('bot', 'right', d > 0.04);
      I.set('bot', 'gas', !(Math.abs(d) > 0.55 && sp > 260)); I.set('bot', 'brake', Math.abs(d) > 0.8 && sp > 240);
      I.set('bot', 'hand', Math.abs(d) > 0.5 && sp > 240); I.set('bot', 'boost', r.boost > 0.5 && Math.abs(d) < 0.12);
    }
    requestAnimationFrame(loop);
  };
  loop();
});
let shot = false;
for (let i = 0; i < 160; i++) {
  await sleep(1000);
  const st = await page.evaluate(() => ({ s: window.__drift.shell.state, lap: window.__drift.race.lap, t: window.__drift.race.time.toFixed(1) }));
  if (!shot && st.lap >= 2) { await page.screenshot({ path: `/tmp/dc-${track}.png` }); shot = true; }
  if (st.s === 'over') { console.log('finished', JSON.stringify(st)); break; }
}
await page.waitForSelector('.p-score', { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: `/tmp/dc-${track}-end.png` });
console.log(await page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1')).games.driftCircuit));
console.log(errors);
await browser.close();
