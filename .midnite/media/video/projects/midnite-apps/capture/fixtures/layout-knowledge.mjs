// Offline force layout for the sampled knowledge graph: seeds each community
// around a circle, then runs Fruchterman–Reingold. Writes `positions` in place.
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('./data/knowledge-sample.json', import.meta.url);
const g = JSON.parse(readFileSync(p, 'utf8'));
const linked = new Set(g.links.flatMap((l) => [l.source, l.target]));
g.nodes = g.nodes.filter((n) => linked.has(n.id));
const N = g.nodes.length;
const idx = new Map(g.nodes.map((n, i) => [n.id, i]));
const comms = [...new Set(g.nodes.map((n) => n.community))];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const x = new Float64Array(N), y = new Float64Array(N);
g.nodes.forEach((n, i) => {
  const a = (comms.indexOf(n.community) / comms.length) * Math.PI * 2;
  x[i] = Math.cos(a) * 600 + (rnd() - 0.5) * 200;
  y[i] = Math.sin(a) * 600 + (rnd() - 0.5) * 200;
});
const E = g.links.map((l) => [idx.get(l.source), idx.get(l.target), l.source.split('_')[0] === l.target.split('_')[0] ? 1 : 1]);
const sameComm = (a, b) => g.nodes[a].community === g.nodes[b].community;
const k = 38;
let t = 120;
const dx = new Float64Array(N), dy = new Float64Array(N);
for (let it = 0; it < 420; it++) {
  dx.fill(0); dy.fill(0);
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      let ddx = x[i] - x[j], ddy = y[i] - y[j];
      const d2 = ddx * ddx + ddy * ddy + 0.01;
      const f = (k * k) / d2;
      dx[i] += ddx * f; dy[i] += ddy * f; dx[j] -= ddx * f; dy[j] -= ddy * f;
    }
  for (const [a, b] of E) {
    const ddx = x[a] - x[b], ddy = y[a] - y[b];
    const d = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
    const f = (d / k) * (sameComm(a, b) ? 1 : 0.25);
    dx[a] -= ddx * f; dy[a] -= ddy * f; dx[b] += ddx * f; dy[b] += ddy * f;
  }
  for (let i = 0; i < N; i++) {
    // gentle gravity keeps stragglers in
    dx[i] -= x[i] * 0.02; dy[i] -= y[i] * 0.02;
    const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) + 0.01;
    const s = Math.min(d, t) / d;
    x[i] += dx[i] * s; y[i] += dy[i] * s;
  }
  t = Math.max(2, t * 0.985);
}
g.positions = Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: Math.round(x[i] * 10) / 10, y: Math.round(y[i] * 10) / 10 }]));
writeFileSync(p, JSON.stringify(g));
const xs = [...x], ys = [...y];
console.log('extent', Math.min(...xs) | 0, Math.max(...xs) | 0, Math.min(...ys) | 0, Math.max(...ys) | 0);
