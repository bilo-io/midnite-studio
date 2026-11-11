// Tempo, beat phase and a section energy map for a music file, no native deps.
//   node beats.mjs <file> [--bpm-min 70 --bpm-max 180] [--json out.json]
// Onset strength = half-wave-rectified spectral-ish flux from 4 band energies (one-pole filters) at 100 Hz.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const argv = process.argv.slice(2);
const file = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const SR = 22050, HOP = 220.5; // 100 Hz frames
const pcm = spawnSync(process.env.FFMPEG ?? 'ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 }).stdout;
const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
const dur = x.length / SR;
const N = Math.floor(x.length / HOP);
// Bands via cascaded one-pole low-passes: <150, 150-600, 600-2500, >2500 Hz.
const a = (fc) => Math.exp(-2 * Math.PI * fc / SR);
const [a1, a2, a3] = [a(150), a(600), a(2500)];
let l1 = 0, l2 = 0, l3 = 0;
const E = [new Float64Array(N), new Float64Array(N), new Float64Array(N), new Float64Array(N)];
const rms = new Float64Array(N);
for (let i = 0; i < x.length; i++) {
  const v = x[i];
  l1 = a1 * l1 + (1 - a1) * v; l2 = a2 * l2 + (1 - a2) * v; l3 = a3 * l3 + (1 - a3) * v;
  const f = Math.min(N - 1, Math.floor(i / HOP));
  E[0][f] += l1 * l1; E[1][f] += (l2 - l1) ** 2; E[2][f] += (l3 - l2) ** 2; E[3][f] += (v - l3) ** 2; rms[f] += v * v;
}
for (let f = 0; f < N; f++) rms[f] = Math.sqrt(rms[f] / HOP);
const onset = new Float64Array(N);
for (let b = 0; b < 4; b++) { const e = E[b].map((v) => Math.log(1e-9 + v)); for (let f = 1; f < N; f++) onset[f] += Math.max(0, e[f] - e[f - 1]) * (b === 0 ? 1.5 : 1); }
// Remove local mean.
const W = 25; const on = new Float64Array(N);
for (let f = 0; f < N; f++) { let s = 0, c = 0; for (let k = Math.max(0, f - W); k < Math.min(N, f + W); k++) { s += onset[k]; c++; } on[f] = Math.max(0, onset[f] - s / c); }
// Tempo: autocorrelation with a mild log-normal prior around 110 BPM.
const bmin = +opt('bpm-min', 70), bmax = +opt('bpm-max', 180);
let best = null; const scores = [];
for (let bpm = bmin; bpm <= bmax; bpm += 0.1) {
  const lag = 6000 / bpm; let s = 0, c = 0;
  for (let f = 0; f + lag * 4 < N; f += 1) { const i1 = Math.round(f + lag), i2 = Math.round(f + 2 * lag), i4 = Math.round(f + 4 * lag); s += on[f] * (on[i1] + 0.5 * on[i2] + 0.25 * on[i4]); c++; }
  s /= c;
  const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.9) ** 2);
  scores.push([bpm, s * prior]);
  if (!best || s * prior > best[1]) best = [bpm, s * prior];
}
const peaks = scores.filter((p, i) => i > 0 && i < scores.length - 1 && p[1] >= scores[i - 1][1] && p[1] >= scores[i + 1][1]).sort((a, b) => b[1] - a[1]).slice(0, 4);
const forced = opt('bpm'); if (forced) best = [+forced, 0];
const bpm = Math.round(best[0] * 10) / 10;
const period = 60 / bpm;
// Phase: comb over the whole file.
let bestPh = 0, bestS = -1;
for (let ph = 0; ph < period; ph += 0.002) { let s = 0; for (let t = ph; t < dur; t += period) { const f = Math.round(t * 100); s += (on[f] ?? 0) + 0.5 * ((on[f - 1] ?? 0) + (on[f + 1] ?? 0)); } if (s > bestS) { bestS = s; bestPh = ph; } }
// Downbeat: which of the 4 beat offsets carries the most low-band onset.
const low = new Float64Array(N); { const e = E[0].map((v) => Math.log(1e-9 + v)); for (let f = 1; f < N; f++) low[f] = Math.max(0, e[f] - e[f - 1]); }
let db = 0, dbS = -1; for (let k = 0; k < 4; k++) { let s = 0; for (let t = bestPh + k * period; t < dur; t += 4 * period) s += low[Math.round(t * 100)] ?? 0; if (s > dbS) { dbS = s; db = k; } }
const downbeat = bestPh + db * period;
// Energy per bar (RMS dB) to find sections and drops.
const barLen = 4 * period; const bars = [];
for (let t = downbeat; t + barLen <= dur; t += barLen) { let s = 0, c = 0; for (let f = Math.round(t * 100); f < Math.round((t + barLen) * 100); f++) { s += rms[f] ** 2; c++; } bars.push({ t: +t.toFixed(3), db: +(10 * Math.log10(s / c + 1e-12)).toFixed(1) }); }
const out = { file, duration: +dur.toFixed(3), bpm, period: +period.toFixed(5), firstBeat: +bestPh.toFixed(3), downbeat: +downbeat.toFixed(3), bars };
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
console.log(`${file.split('/').pop()}  ${dur.toFixed(1)}s  ${bpm} BPM [${peaks.map((p) => p[0].toFixed(1) + ':' + (p[1] / best[1]).toFixed(2)).join(' ')}]  first beat ${bestPh.toFixed(3)}  downbeat ${downbeat.toFixed(3)}`);
if (argv.includes('--bars')) { const mx = Math.max(...bars.map((b) => b.db)); for (const [i, b] of bars.entries()) console.log(String(i).padStart(3), b.t.toFixed(2).padStart(7), String(b.db).padStart(6), '█'.repeat(Math.max(0, Math.round((b.db - mx + 30))))); }
