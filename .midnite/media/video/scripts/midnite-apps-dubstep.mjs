/**
 * The synthesized half of Midnite Apps' bed (v2): an eight-bar build laid over
 * the song's own breakdown, and a sixteen-bar half-time dubstep drop, both on
 * the song's 124 BPM grid and in its key. Used by
 * `make-midnite-apps-soundtrack.mjs`, which places, levels and splices them.
 *
 * The song is G minor and its drops walk the bass G–C–G–B♭, a bar each
 * (measured by chroma over the source), so the drop's bass walks the same
 * changes and the original can come back under it without a key change. The
 * last bar turns to D, the dominant, so the return lands on G as a resolution.
 *
 * Half-time: the kick on beat 1 and the snare on beat 3 of every bar, so the
 * drop feels like 62 BPM while every hit is still on the 124 grid. The sixteen
 * bars are four phrases, each with its own bass and drum pattern:
 *
 *    1–4   the drop — a wobble opening up: half notes, quarters, then eighths
 *    5–8   the "yoy" — chopped, syncopated hits leaping octaves, saw-shaped LFO
 *    9–12  the growl — FM through a moving vowel filter, triplet LFOs
 *   13–16  stutters — a gated reese, 1/32 chops, then a bar that accelerates
 *          and rises into the return under a snare roll
 *
 * No samples: every sound is made here, so everything is on the grid by
 * construction and deterministic (seeded noise), run to run.
 */

const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Seeded white noise in [-1, 1) (mulberry32), so a re-run writes the same file. */
const noise = (seed) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
};

/** Zavalishin's TPT state-variable filter: stable with a cutoff that moves every sample. */
export class Svf {
  constructor(rate) {
    this.rate = rate;
    this.ic1 = 0;
    this.ic2 = 0;
    this.lp = 0;
    this.bp = 0;
    this.hp = 0;
  }
  run(x, fc, q = 0.707) {
    const g = Math.tan((Math.PI * Math.min(Math.max(fc, 10), this.rate * 0.45)) / this.rate);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
    return this;
  }
}

/** PolyBLEP: band-limits a saw or square's step, so low bass notes do not alias. */
const blep = (t, dt) => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
const square = (p, dt) => (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);

const bus = (n) => {
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  return {
    L,
    R,
    n,
    add(i, l, r) {
      if (i >= 0 && i < n) {
        L[i] += l;
        R[i] += r;
      }
    },
  };
};

/* ── Drums ────────────────────────────────────────────────────────────────── */

const kick = (out, at, vel, rate) => {
  const n = Math.round(0.5 * rate);
  const nz = noise(at + 11);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    ph += (42 + 120 * Math.exp(-t / 0.035) + 40 * Math.exp(-t / 0.006)) / rate;
    const amp = Math.min(1, t / 0.0015) * Math.exp(-t / 0.3);
    const x = Math.tanh(1.8 * (Math.sin(TAU * ph) * amp + nz() * Math.exp(-t / 0.003) * 0.25)) * 0.95 * vel;
    out.add(at + i, x, x);
  }
};

/** A big half-time snare: a tuned body, a clap's three bursts and a noise tail; part of it goes to the reverb. */
const snare = (out, send, at, vel, rate, tone = 190, wet = 0.45) => {
  const n = Math.round(0.5 * rate);
  const nz = noise(at * 7 + 3);
  const band = new Svf(rate);
  const high = new Svf(rate);
  const clapBand = new Svf(rate);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    ph += (tone * (1 + 0.6 * Math.exp(-t / 0.012))) / rate;
    const body = Math.sin(TAU * ph) * Math.exp(-t / 0.07) * 0.8;
    const w = nz();
    const tail = (band.run(w, 4200, 0.8).bp * 1.6 + high.run(w, 1800).hp * 0.5) * Math.exp(-t / 0.16);
    let clap = 0;
    for (let k = 0; k < 3; k++) {
      const tk = t - k * 0.011;
      if (tk >= 0) clap += Math.exp(-tk / (k === 2 ? 0.05 : 0.004));
    }
    clap *= clapBand.run(w, 1500, 1.2).bp * 1.4;
    const x = Math.tanh(1.5 * (body + tail + clap)) * 0.8 * vel;
    out.add(at + i, x * 0.97, x);
    send.add(at + i, x * wet, x * wet);
  }
};

const hat = (out, at, vel, rate, open = false, pan = 0) => {
  const n = Math.round((open ? 0.25 : 0.06) * rate);
  const nz = noise(at * 13 + 5);
  const f = new Svf(rate);
  const decay = open ? 0.11 : 0.022;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const x = f.run(nz(), 8500, 0.8).hp * Math.exp(-t / decay) * 0.5 * vel;
    out.add(at + i, x * (1 - pan), x * (1 + pan));
  }
};

/** The drop's first hit: a long cymbal wash and a sub boom under the kick. */
const impact = (out, send, at, rate) => {
  const n = Math.round(2.2 * rate);
  const nzL = noise(at + 101);
  const nzR = noise(at + 202);
  const fl = new Svf(rate);
  const fr = new Svf(rate);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    ph += (32 + 28 * Math.exp(-t / 0.25)) / rate;
    const boom = Math.sin(TAU * ph) * Math.exp(-t / 0.9) * 0.7;
    const wash = Math.exp(-t / 0.7) * 0.35;
    const l = fl.run(nzL(), 5000).hp * wash + boom;
    const r = fr.run(nzR(), 5000).hp * wash + boom;
    out.add(at + i, l, r);
    send.add(at + i, l * 0.2, r * 0.2);
  }
};

/** Freeverb-style: four damped combs and two allpasses a channel, spread for width. */
const reverb = (send, rate, feedback = 0.8, damp = 0.3) => {
  const scale = rate / 44100;
  const combs = [1116, 1188, 1277, 1356];
  const alls = [556, 441];
  const run = (x, spread) => {
    const y = new Float32Array(x.length);
    for (const len0 of combs) {
      const len = Math.round((len0 + spread) * scale);
      const buf = new Float32Array(len);
      let idx = 0;
      let store = 0;
      for (let i = 0; i < x.length; i++) {
        const o = buf[idx];
        store = o * (1 - damp) + store * damp;
        buf[idx] = x[i] * 0.015 + store * feedback;
        idx = (idx + 1) % len;
        y[i] += o;
      }
    }
    for (const len0 of alls) {
      const len = Math.round((len0 + spread) * scale);
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < y.length; i++) {
        const b = buf[idx];
        const o = -y[i] + b;
        buf[idx] = y[i] + b * 0.5;
        idx = (idx + 1) % len;
        y[i] = o;
      }
    }
    return y;
  };
  return { L: run(send.L, 0), R: run(send.R, 23) };
};

/* ── The drop's score ─────────────────────────────────────────────────────── */

/** The song's changes, a bar each, as the wobble's root (an octave above the sub). G2 C3 G2 B♭2. */
const CHANGES = [43, 48, 43, 46];
/** The last bar's root: D3, the dominant, so the return to the song resolves on G. */
const DOMINANT = 50;

/**
 * One bass event: `at`/`len` in beats from the drop's start, `note` the root
 * (MIDI), `lfo` beats per filter cycle (a pair accelerates from one to the
 * other), `shape` the LFO's curve, `timbre`, and optional `glide` (seconds
 * from the previous note), `bend` (semitones over the event) and `gate` (a
 * 16th-note on/off pattern).
 */
const ev = (at, len, note, lfo, shape = "sine", timbre = "wobble", extra = {}) => ({
  at,
  len,
  note,
  lfo,
  shape,
  timbre,
  ...extra,
});

const score = () => {
  const bass = [];
  const kicks = [];
  const snares = [];
  const hats = [];
  for (let bar = 0; bar < 16; bar++) {
    const b = bar * 4;
    const phrase = Math.floor(bar / 4);
    const root = bar === 15 ? DOMINANT : CHANGES[bar % 4];
    const inPhrase = bar % 4;
    /* Drums: half-time everywhere, with a different push in each phrase. */
    kicks.push({ at: b, vel: 1 });
    snares.push({ at: b + 2, vel: 1 });
    if (phrase === 0 && inPhrase === 3) kicks.push({ at: b + 3.5, vel: 0.8 });
    if (phrase === 1) kicks.push({ at: b + 1.75, vel: 0.75 });
    if (phrase === 2) {
      kicks.push({ at: b + 2.5, vel: 0.8 });
      snares.push({ at: b + 3.75, vel: 0.35 });
    }
    if (phrase === 3 && bar < 15) kicks.push({ at: b + 0.5, vel: 0.7 });
    const hatStep = phrase >= 2 ? 0.25 : 0.5;
    for (let h = 0; h < 4; h += hatStep) {
      if (bar === 15 && h >= 2) break;
      const accent = h % 1 === 0.5 ? 1 : 0.55;
      hats.push({ at: b + h, vel: accent * (phrase >= 2 ? 0.8 : 1), open: phrase === 1 && h === 3.5, pan: (h % 0.5 === 0 ? -0.2 : 0.2) });
    }

    /* Bass. */
    if (phrase === 0) {
      if (inPhrase === 0) bass.push(ev(b, 2, root, 2, "rise"), ev(b + 2, 2, root, 1));
      else if (inPhrase === 1) bass.push(ev(b, 4, root, 1));
      else if (inPhrase === 2) bass.push(ev(b, 4, root, 0.5));
      else bass.push(ev(b, 2, root, 0.5), ev(b + 2, 1, root, 1 / 3), ev(b + 3, 1, root + 12, 0.25, "saw"));
    } else if (phrase === 1) {
      /* Chopped and syncopated, leaping between root, fifth and octave, with glides — the "yoy". */
      const hits = [
        [0, 0.6, 0],
        [0.75, 0.6, 12],
        [1.5, 0.9, 7],
        [2.5, 0.4, 0],
        [3, 0.4, 12],
        [3.5, 0.5, inPhrase === 3 ? 15 : 10],
      ];
      for (const [at, len, iv] of hits) bass.push(ev(b + at, len, root + iv, 0.25, "saw", "wobble", { glide: 0.045 }));
    } else if (phrase === 2) {
      /* The growl: FM through a vowel filter, the LFO switching between straight and triplet. */
      bass.push(
        ev(b, 1.5, root, 0.5, "sine", "growl"),
        ev(b + 1.5, 0.5, root, 1 / 6, "sine", "growl"),
        ev(b + 2, 1, root + (inPhrase === 3 ? 3 : 0), 0.25, "saw", "growl"),
        ev(b + 3, 1, root + 7, 1 / 3, "rise", "growl", { glide: 0.06 }),
      );
    } else if (bar < 14) {
      /* A reese with a trance gate. */
      const gate = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1];
      bass.push(ev(b, 4, root, 4, "sine", "reese", { gate }));
    } else if (bar === 14) {
      bass.push(ev(b, 2, root, 0.5, "sine", "wobble"), ev(b + 2, 2, root, 0.125, "square", "wobble"));
    } else {
      /* The last bar: the LFO accelerates from quarters to 32nds and the note climbs an octave, into the return. */
      bass.push(ev(b, 3.75, root, [1, 0.125], "sine", "wobble", { bend: 12 }));
    }
  }
  /* The last bar's snare roll: 16ths, then 32nds, rising, then out of the way for the song's downbeat. */
  for (let s = 0; s < 3.75; s += s < 2 ? 0.25 : 0.125) snares.push({ at: 60 + s, vel: 0.35 + 0.6 * (s / 3.75), tone: 200 + 180 * (s / 3.75), wet: 0.25 });
  return { bass, kicks, snares, hats };
};

/* ── Render ───────────────────────────────────────────────────────────────── */

/**
 * The drop: `bars` × 4 beats of stereo audio at `rate`, beat length `beat`
 * samples. Unlevelled; the soundtrack script sets its loudness against the song.
 */
export const renderDrop = ({ rate, beat, bars = 16 }) => {
  const n = Math.round(bars * 4 * beat);
  const at = (b) => Math.round(b * beat);
  const drums = bus(n);
  const send = bus(n);
  const { bass, kicks, snares, hats } = score();

  impact(drums, send, 0, rate);
  for (const k of kicks) kick(drums, at(k.at), k.vel, rate);
  for (const s of snares) snare(drums, send, at(s.at), s.vel, rate, s.tone, s.wet);
  for (const h of hats) hat(drums, at(h.at), h.vel * 0.45, rate, h.open, h.pan);

  /* Sidechain: the bass ducks under each kick and snare, the pump the genre is built on. */
  const duck = new Float32Array(n).fill(1);
  const pump = (from, depth, tau) => {
    for (let i = from; i < Math.min(n, from + Math.round(tau * 5 * rate)); i++)
      duck[i] = Math.min(duck[i], 1 - depth * Math.exp(-(i - from) / (tau * rate)));
  };
  for (const k of kicks) pump(at(k.at), 0.6 * k.vel, 0.09);
  for (const s of snares) if (s.vel > 0.5 && s.at < 60) pump(at(s.at), 0.35, 0.07);

  const mid = bus(n);
  const sub = new Float32Array(n);
  const chans = [
    { detune: -0.006, lpf: new Svf(rate), post: new Svf(rate), fa: new Svf(rate), fb: new Svf(rate), p1: 0, p2: 0.31, p3: 0 },
    { detune: 0.006, lpf: new Svf(rate), post: new Svf(rate), fa: new Svf(rate), fb: new Svf(rate), p1: 0.17, p2: 0.53, p3: 0.25 },
  ];
  let pm = 0;
  let ps = 0;
  let env = 0;
  let subEnv = 0;
  let prevNote = bass[0].note;
  let e = -1;
  let fromNote = prevNote;
  const attack = 1 - Math.exp(-1 / (0.002 * rate));
  const release = 1 - Math.exp(-1 / (0.008 * rate));
  const subRelease = 1 - Math.exp(-1 / (0.03 * rate));

  for (let i = 0; i < n; i++) {
    const pos = i / beat;
    while (e + 1 < bass.length && pos >= bass[e + 1].at) {
      e++;
      fromNote = prevNote;
      prevNote = bass[e].note;
    }
    const cur = e >= 0 && pos < bass[e].at + bass[e].len ? bass[e] : null;
    let on = cur ? 1 : 0;
    let l = 0;
    let note = prevNote;
    if (cur) {
      const into = pos - cur.at;
      const prog = into / cur.len;
      if (cur.gate) on = cur.gate[Math.floor(into / 0.25) % cur.gate.length];
      const secs = into * (beat / rate);
      note = cur.glide && secs < cur.glide ? fromNote + (cur.note - fromNote) * (secs / cur.glide) : cur.note;
      if (cur.bend) note += cur.bend * prog * prog;
      /* LFO phase; an accelerating LFO integrates its rate so the sweep never jumps. */
      let cycles;
      if (Array.isArray(cur.lfo)) {
        const [a, b] = cur.lfo;
        const r0 = 1 / a;
        const r1 = 1 / b;
        cycles = cur.len * (r0 * prog + ((r1 - r0) * prog * prog) / 2);
      } else cycles = into / cur.lfo;
      const p = cycles % 1;
      l = cur.shape === "saw" ? 1 - p : cur.shape === "rise" ? p : cur.shape === "square" ? (p < 0.5 ? 1 : 0.15) : 0.5 - 0.5 * Math.cos(TAU * p);
    }
    env += (on - env) * (on > env ? attack : release);
    subEnv += ((cur ? 1 : 0) - subEnv) * (cur ? attack : subRelease);

    const f = hz(note);
    const dt = f / rate;
    const timbre = cur?.timbre ?? "wobble";
    pm = (pm + dt) % 1;
    for (let c = 0; c < 2; c++) {
      const ch = chans[c];
      const fd = f * (1 + ch.detune);
      const dd = fd / rate;
      ch.p1 = (ch.p1 + dd) % 1;
      ch.p2 = (ch.p2 + dd * 1.003) % 1;
      ch.p3 = (ch.p3 + dd * 0.5) % 1;
      let y;
      if (timbre === "growl") {
        const idx = 1 + 5 * l;
        const fm = Math.sin(TAU * ch.p1 + idx * Math.sin(TAU * pm));
        const x = fm + 0.3 * saw(ch.p2, dd);
        const v1 = 380 + 420 * l;
        const v2 = 820 + 1500 * l;
        y = ch.fa.run(x, v1, 6).bp * 1.4 + ch.fb.run(x, v2, 7).bp * 1.1 + ch.lpf.run(x, 220, 0.8).lp * 0.5;
        y = Math.tanh(3 * y) * 0.85;
      } else if (timbre === "reese") {
        const x = 0.5 * saw(ch.p1, dd) + 0.5 * saw((ch.p2 + 0.003 * c) % 1, dd * 1.012);
        y = Math.tanh(2 * ch.lpf.run(x, 300 * 2 ** (l * 3.5), 1.4).lp) * 0.9;
      } else {
        const x = 0.45 * saw(ch.p1, dd) + 0.45 * saw(ch.p2, dd) + 0.35 * square(ch.p3, dd * 0.5);
        y = Math.tanh(2.6 * ch.lpf.run(x, 60 * 2 ** (l * 6.5), 3).lp) * 0.9;
      }
      /* Leave the bottom octave to the sub. */
      y = ch.post.run(y, 110, 0.7).hp * env * duck[i] * 0.85;
      if (c === 0) mid.L[i] = y;
      else mid.R[i] = y;
    }
    ps = (ps + hz(note - 12) / rate) % 1;
    sub[i] = Math.tanh(1.2 * Math.sin(TAU * ps)) * subEnv * duck[i] * 0.42;
  }

  const wet = reverb(send, rate);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const hp = [new Svf(rate), new Svf(rate)];
  for (let i = 0; i < n; i++) {
    L[i] = hp[0].run(drums.L[i] + mid.L[i] + sub[i] + wet.L[i] * 0.25, 25).hp;
    R[i] = hp[1].run(drums.R[i] + mid.R[i] + sub[i] + wet.R[i] * 0.25, 25).hp;
  }
  return [L, R];
};

/**
 * The build's own layers, laid over the song's breakdown: a snare roll that
 * doubles its rate every two bars and climbs in pitch, a noise riser opening
 * from 400 Hz to 9 kHz, and a saw sweeping up three octaves from G2 over the
 * last four bars. Everything stops `gap` beats before the end — the held
 * breath before the drop.
 */
export const renderBuild = ({ rate, beat, beats = 32, gap = 0.5 }) => {
  const n = Math.round(beats * beat);
  const at = (b) => Math.round(b * beat);
  const out = bus(n);
  const send = bus(n);
  const stop = beats - gap;

  for (let s = 0; s < stop - 1e-9; ) {
    const prog = s / stop;
    snare(out, send, at(s), 0.22 + 0.7 * prog ** 1.5, rate, 170 + 250 * prog, 0.3);
    s += s < 8 ? 1 : s < 16 ? 0.5 : s < 28 ? 0.25 : 0.125;
  }

  const nzL = noise(9001);
  const nzR = noise(9002);
  const fl = new Svf(rate);
  const fr = new Svf(rate);
  const sweep = new Svf(rate);
  let ph = 0;
  for (let i = at(8); i < at(stop); i++) {
    const prog = (i / beat - 8) / (stop - 8);
    const fc = 400 * (9000 / 400) ** prog;
    const g = 0.01 * 30 ** prog;
    out.add(i, fl.run(nzL(), fc, 1.5).bp * g, fr.run(nzR(), fc, 1.5).bp * g);
    const b = i / beat;
    if (b >= 16) {
      const p = (b - 16) / (stop - 16);
      const f = hz(43) * 8 ** p;
      ph = (ph + f / rate) % 1;
      const y = sweep.run(saw(ph, f / rate), 600 + 6000 * p, 1.2).lp * 0.12 * p;
      out.add(i, y, y);
    }
  }

  const wet = reverb(send, rate, 0.75);
  for (let i = 0; i < at(stop); i++) {
    out.L[i] += wet.L[i] * 0.2;
    out.R[i] += wet.R[i] * 0.2;
  }
  /* Nothing past the stop: the reverb is cut there too, so the gap is silence. */
  out.L.fill(0, at(stop));
  out.R.fill(0, at(stop));
  return [out.L, out.R];
};
