// Verifies every breakable brick in every Brick Blast level can eventually be reached by the ball.
import { LEVELS } from '../games/brick-blast/levels.js';
let ok = true;
LEVELS.forEach((L, li) => {
  const R = L.rows.length + 4, C = 9;
  const g = [];
  for (let r = 0; r < R; r++) g.push(Array.from({ length: C }, (_, c) => (L.rows[r] ? L.rows[r][c] : '.')));
  if (L.rows.some((row) => row.length !== C)) { console.log('level', li + 1, 'bad row width'); ok = false; }
  let changed = true;
  const open = (r, c) => g[r][c] === '.';
  const reach = Array.from({ length: R }, () => Array(C).fill(false));
  const flood = () => {
    const st = [];
    for (const row of reach) row.fill(false);
    for (let c = 0; c < C; c++) if (open(R - 1, c)) st.push([R - 1, c]);
    for (let c = 0; c < C; c++) if (open(0, c)) st.push([0, c]);
    while (st.length) {
      const [r, c] = st.pop();
      if (r < 0 || c < 0 || r >= R || c >= C || reach[r][c] || !open(r, c)) continue;
      reach[r][c] = true; st.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }
  };
  while (changed) {
    changed = false; flood();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (g[r][c] === '.' || g[r][c] === '#') continue;
      const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => (a < 0 ? true : b < 0 || b >= C || a >= R ? false : reach[a][b]));
      if (adj) { g[r][c] = '.'; changed = true; }
    }
  }
  const left = g.flat().filter((ch) => ch !== '.' && ch !== '#').length;
  if (left) console.log(g.map((r) => r.join('')).join('\n'));
  console.log(`level ${li + 1} ${L.name}: ${left ? 'UNREACHABLE bricks: ' + left : 'ok'}`);
  if (left) ok = false;
});
process.exit(ok ? 0 : 1);
