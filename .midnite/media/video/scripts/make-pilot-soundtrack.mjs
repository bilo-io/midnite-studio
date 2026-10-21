#!/usr/bin/env node
/**
 * Arrange the pilot's 60-second soundtrack out of a 14-second logo sting.
 *
 *   node scripts/make-pilot-soundtrack.mjs            # build
 *   node scripts/make-pilot-soundtrack.mjs --report   # build and print the map
 *
 * Writes `projects/midnite/marketing/000-pilot/input/soundtrack-60s.wav`, which
 * `Pilot.tsx` mounts as its single `<Audio>`. WAV, not MP3, on purpose: every
 * number below is a sample offset derived from the edit's frame grid, and an
 * MP3 round-trip adds encoder delay at the head that would shift the whole grid
 * against the picture by a frame or so.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * `soulprodmusic-own-it-logo` carries 14.0 seconds of audible content. The cut
 * is 60. Earlier iterations solved that by mounting the file twice and crossing
 * from one copy to the other (`v3`, see the old `LOOP` in `beats.ts`), which
 * buys one more pass through the groove and no more than that — and the edit
 * now needs five, plus a build-up and a drop that the sting does not contain.
 *
 * So the track is arranged offline instead. Everything here is derived from the
 * source; nothing is synthesised and no second song is mixed in. What changes
 * is *when* the source's own parts play and how loud each band of them is.
 *
 * ── What was measured, and how ───────────────────────────────────────────────
 *
 * Autocorrelation of the waveform (not the envelope) against a 1.5s reference
 * window at 4.70s, over lags from 0.6s to 7.0s:
 *
 *      1 bar   74 536 samples   1.6902s   50.71 frames   r=0.69
 *    ½ phrase  130 438          2.9578s   88.73          r=0.70
 *    1 phrase  223 608          5.0705s  152.11          r=0.88   ← the loop
 *      4 bars  298 137          6.7605s  202.81          r=0.36
 *
 * **The repeating unit is three bars, not four.** v3 looped 203 frames on the
 * assumption that the phrase was four bars; at that lag the waveform barely
 * correlates with itself (r=0.36) and the join only passed because it was
 * checked by onset positions rather than by similarity. 152 frames is the
 * phrase this track actually has, and it loops at r=0.88.
 *
 * The groove's first bass attack is at 4.6978s (1ms RMS of the sub band), which
 * is where the loop starts. 141 frames in — near enough the frame the picture
 * already cut on that the open did not have to move.
 *
 * Ten loops later the timeline is at 2 443 252 samples = frame 1662.07, exactly
 * a phrase boundary, so the source's own continuation from 9.768s can be
 * spliced straight back in: the last four seconds of the video are the track's
 * real ending, in its real place in the phrase, decaying to silence at 1790.
 *
 * ── What the arrangement does ────────────────────────────────────────────────
 *
 * The mix is split into a sub band (<150Hz, two cascaded one-poles) and
 * everything above it. The bass line of this track is a single sustained note
 * per attack, so the sub band *is* the bass and the rest is drums, keys and
 * air. That split is what makes the brief expressible:
 *
 *   bars  0– 4   the bass lands irregularly: three attacks where the source has
 *                five, spaced 1.24 and 1.76 bars apart. Gated in whole windows
 *                around the source's own attacks — opening the gate mid-note
 *                gives a swell, not a slap, so every window opens just before
 *                an attack the source already has.
 *   bars  4–16   unity. The bass plays the track's own 3-bar pattern, every
 *                attack, which is the "normally" the brief asks for.
 *   bars 16–19   build-up: the bass ramps out over a bar, the rest is swept by
 *                a rising highpass (20Hz → 900Hz), and the last bar is a beat
 *                repeat whose slice halves twice. Ends on a quarter-bar of near
 *                silence — the gap is what makes the drop land.
 *   bars 19–29   the drop: the sub comes back 1.35× and wobbling (a shaped LFO
 *                at four cycles a bar, eight for the two bars from 24), with
 *                extra sub hits an octave below the track's own on the offbeat,
 *                doubled at the two cuts the picture makes inside the drop.
 *   bars 29–end  unity again, into the source's own ending.
 *
 * Bar numbers are counted from the groove's first attack and are the same ones
 * `beats.ts` cuts the picture on, so "the drop is on bar 19" and "the companion
 * slide starts on bar 19" are one statement.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets/audio/sfx/soulprodmusic-own-it-logo-360211.mp3");
const OUT = join(ROOT, "projects/midnite/marketing/000-pilot/input/soundtrack-60s.wav");

const FPS = 30;
const RATE = 44100;

/* ── The grid, in samples ─────────────────────────────────────────────────── */

/** The groove's first bass attack — where the loop starts. */
const GROOVE = Math.round(4.6978 * RATE); // 207 172
/** One three-bar phrase. Measured: r=0.88 at this lag, the highest anywhere. */
const PHRASE = 223608;
/** One bar. The phrase is three of these. */
const BAR = PHRASE / 3; // 74 536
/** How many phrases play before the source's own ending is spliced back in. */
const PHRASES = 10;
/** Equal-power crossfade at every loop join. 30ms: long enough to hide a step. */
const XFADE = Math.round(0.03 * RATE);

const DURATION_FRAMES = 1800;
const OUT_N = Math.round((DURATION_FRAMES / FPS) * RATE);

/** Bar `b` counted from the groove, as a sample offset in the output. */
const bar = (b) => GROOVE + Math.round(b * BAR);
/** Bar `b` as a frame, for cross-checking against `beats.ts`. */
const barFrame = (b) => (bar(b) / RATE) * FPS;

/* ── WAV in and out ───────────────────────────────────────────────────────── */

const decode = () => {
  const tmp = mkdtempSync(join(tmpdir(), "soundtrack-"));
  const wav = join(tmp, "src.wav");
  try {
    execFileSync("npx", ["remotion", "ffmpeg", "-y", "-i", SOURCE, "-ac", "2", "-ar", String(RATE), "-c:a", "pcm_s16le", wav], {
      cwd: join(ROOT, "video-editor"),
      stdio: ["ignore", "ignore", "pipe"],
    });
    return readWav(wav);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

/** Read a PCM WAV by walking its chunks — ffmpeg writes a LIST before `data`. */
const readWav = (path) => {
  const buf = readFileSync(path);
  let off = 12;
  let data = null;
  let channels = 2;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") channels = buf.readUInt16LE(off + 10);
    if (id === "data") {
      data = buf.subarray(off + 8, off + 8 + size);
      break;
    }
    off += 8 + size + (size % 2);
  }
  const n = data.length / 2 / channels;
  const ch = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++) ch[c][i] = data.readInt16LE((i * channels + c) * 2) / 32768;
  return ch;
};

const writeWav = (path, ch) => {
  const n = ch[0].length;
  const c = ch.length;
  const body = Buffer.alloc(n * c * 2);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < c; k++)
      body.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[k][i])) * 32767), (i * c + k) * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + body.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(c, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * c * 2, 28);
  head.writeUInt16LE(c * 2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(body.length, 40);
  writeFileSync(path, Buffer.concat([head, body]));
};

/* ── Signal helpers ───────────────────────────────────────────────────────── */

/** One-pole lowpass, run twice for a 12dB/oct skirt. Returns a new array. */
const lowpass = (x, fc) => {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / RATE);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    s += a * (x[i] - s);
    y[i] = s;
  }
  let t = 0;
  for (let i = 0; i < y.length; i++) {
    t += a * (y[i] - t);
    y[i] = t;
  }
  return y;
};

/**
 * Highpass with a cutoff that moves — `fcAt(i)` is called per sample.
 *
 * A fixed `lowpass` subtracted from the signal cannot sweep, because the filter
 * state has to be advanced with the coefficient it is actually running at.
 */
const sweepHighpass = (x, fcAt) => {
  const y = new Float32Array(x.length);
  let s = 0;
  let t = 0;
  for (let i = 0; i < x.length; i++) {
    const a = 1 - Math.exp((-2 * Math.PI * fcAt(i)) / RATE);
    s += a * (x[i] - s);
    t += a * (s - t);
    y[i] = x[i] - t;
  }
  return y;
};

/** Add `src[from..from+len)` into `dst` at `at`, with equal-power edges. */
const blit = (dst, src, at, from, len, gain = 1, fadeIn = 0, fadeOut = 0) => {
  for (let i = 0; i < len; i++) {
    const d = at + i;
    const s = from + i;
    if (d < 0 || d >= dst.length || s < 0 || s >= src.length) continue;
    let g = gain;
    if (fadeIn && i < fadeIn) g *= Math.sin((Math.PI / 2) * (i / fadeIn));
    if (fadeOut && i > len - fadeOut) g *= Math.sin((Math.PI / 2) * ((len - i) / fadeOut));
    dst[d] += src[s] * g;
  }
};

/** Resample by `ratio` (2 = an octave down) with linear interpolation. */
const pitchDown = (x, ratio) => {
  const n = Math.floor(x.length * ratio);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / ratio;
    const j = Math.floor(p);
    const f = p - j;
    y[i] = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? 0) * f;
  }
  return y;
};

/**
 * A piecewise-linear automation curve, sampled per sample.
 *
 * The breakpoints must already be in time order, and this checks rather than
 * sorts: a curve assembled out of several sections is easy to write out of
 * order — the bass gate below was, first time — and the failure is silent.
 * `curve` walks forward to the first breakpoint at or past `i`, so one early
 * breakpoint sitting after a late one swallows everything between them and the
 * automation simply does not happen. The render still succeeds and the track
 * still plays; it just plays the part unarranged.
 */
const curve = (points) => {
  for (let k = 1; k < points.length; k++)
    if (points[k][0] < points[k - 1][0])
      throw new Error(`curve breakpoints out of order at ${k}: ${points[k - 1][0]} then ${points[k][0]}`);
  return (i) => {
  if (i <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k++) {
    if (i <= points[k][0]) {
      const [x0, y0] = points[k - 1];
      const [x1, y1] = points[k];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
  };
};

/* ── The arrangement ──────────────────────────────────────────────────────── */

/**
 * The bass gate for bars 0–4, as [openBar, closeBar] windows.
 *
 * Each window opens a few hundredths of a bar before an attack the source
 * already has — the track's bass lands at bar offsets 0, 1.24 and 2.01 within
 * every phrase, and a gate that opens between two of those fades a note in from
 * its own decay, which sounds like a mistake rather than like an arrangement.
 * Heard: attacks at 0, 1.24 and 3.00. Skipped: 2.01 and 4.24's early half.
 */
const SPARSE = [
  [-0.05, 0.6],
  [1.18, 1.85],
  [2.95, 3.55],
];
/** Where the gate stops being a gate. Bar 4.18, just before the 4.24 attack. */
const SPARSE_UNTIL = 4.18;

/** Build-up and drop, in bars from the groove. */
const BUILD = { from: 16, to: 19 };
const DROP = { from: 19, to: 29 };
/** The cuts the picture makes inside the drop — each gets an extra sub hit. */
const DROP_CUTS = [20.5];

const main = () => {
  const src = decode();
  const report = process.argv.includes("--report");

  /* 1. Lay the timeline out: the sting's open, ten phrases, then its ending. */
  const laid = [new Float32Array(OUT_N), new Float32Array(OUT_N)];
  for (let c = 0; c < 2; c++) {
    blit(laid[c], src[c], 0, 0, GROOVE + XFADE, 1, 0, XFADE);
    for (let k = 0; k < PHRASES; k++)
      blit(laid[c], src[c], GROOVE + k * PHRASE, GROOVE, PHRASE + XFADE, 1, XFADE, XFADE);
    const tailAt = GROOVE + PHRASES * PHRASE;
    blit(laid[c], src[c], tailAt, GROOVE + PHRASE, src[c].length - GROOVE - PHRASE, 1, XFADE, 0);
  }

  /*
    2. Split into the bass and everything else.

    150Hz, and the number is a measurement rather than a round one. A DFT of
    the sustaining bass note puts its fundamental at 40Hz; a DFT of the gap
    between two notes finds nothing at all below 230Hz and the kit starting at
    350Hz. So there is a clear empty octave to put the crossover in.

    Where in it matters, because `high` is `x - low` and that complement is
    only as clean as the filter: at 40Hz a two-pole at 120Hz still leaves 19%
    of the bass in the high band, which caps the gate below at -14dB no matter
    what gain it is given. At 150Hz the leak is 6.7% (-23dB) and the gate
    actually removes the note. Going higher would clean it up further and start
    taking the kit's body with it — a two-pole at 150Hz claims 15% of 350Hz,
    which is a bearable -1.5dB off the drums when the bass is muted.
  */
  const low = laid.map((x) => lowpass(x, 150));
  const high = laid.map((x, c) => {
    const y = new Float32Array(OUT_N);
    for (let i = 0; i < OUT_N; i++) y[i] = x[i] - low[c][i];
    return y;
  });

  /* 3. The bass automation: sparse, unity, out for the build, wobbling in the drop. */
  const edge = Math.round(0.025 * RATE); // how fast a gate opens or shuts
  const gate = curve([
    /*
      Unity until just before the first window: the sting's own two hits at
      frames 39 and 102 are the logo landing, and are not the groove's bass.
    */
    [0, 1],
    [bar(SPARSE[0][0]) - edge - 1, 1],
    ...SPARSE.flatMap(([a, b]) => [
      [bar(a) - edge, 0],
      [bar(a), 1],
      [bar(b), 1],
      [bar(b) + edge, 0],
    ]),
    [bar(SPARSE_UNTIL) - edge, 0],
    [bar(SPARSE_UNTIL), 1],
    [bar(BUILD.from), 1],
    [bar(BUILD.from + 1), 0],
    [bar(DROP.from) - edge, 0],
    [bar(DROP.from), 1.35],
    [bar(DROP.to), 1.35],
    [bar(DROP.to) + edge, 1],
    [OUT_N, 1],
  ]);

  /*
    The wobble. A raised cosine rather than a sine: dubstep's bass is *gated*
    open and shut, so the curve wants to sit at its floor longer than at its
    peak. Four cycles a bar for the first five bars of the drop and eight for
    two bars from 24, so the second half of the drop is the same bass playing
    faster rather than a different sound.
  */
  const wobbleAt = (i) => {
    if (i < bar(DROP.from) || i >= bar(DROP.to)) return 1;
    const perBar = i >= bar(24) && i < bar(26) ? 8 : 4;
    const phase = (((i - bar(DROP.from)) / BAR) * perBar) % 1;
    const shaped = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    return 0.3 + 0.7 * shaped ** 1.6;
  };

  for (let c = 0; c < 2; c++)
    for (let i = 0; i < OUT_N; i++) low[c][i] *= gate(i) * wobbleAt(i);

  /*
    4. Extra sub hits — "a few extra beats". The one-shot is the track's own
    first bass attack, an octave down, so the extras are the same instrument.
  */
  const oneShot = low.map((x) => pitchDown(x.slice(GROOVE - 200, GROOVE + Math.round(0.42 * RATE)), 2));

  /*
    A hit on every downbeat of the drop and one on the last eighth of each bar.

    The downbeats are not decoration. The track's bass attacks at phrase
    offsets 0, 1.24 and 2.01, and the drop starts on bar 19 — offset 1.0, which
    is the *gap* before the 1.24 attack. Measured at 40Hz, the first quarter of
    the drop came back at 0.2 against a normal 24: the loudest moment in the
    cut had no bass under it at all. The picture's drop is where it is because
    that is where the optimiser slide ends; the arrangement has to put a note
    there rather than the other way round.
  */
  const hits = [];
  for (let b = DROP.from; b < DROP.to; b += 1) hits.push(b, b + 0.875);
  for (const b of DROP_CUTS) hits.push(b + 0.125);
  hits.push(DROP.to - 0.5, DROP.to - 0.375, DROP.to - 0.25);
  for (const b of hits)
    for (let c = 0; c < 2; c++)
      blit(low[c], oneShot[c], bar(b), 0, oneShot[c].length, b === DROP.from ? 0.9 : 0.5, 60, Math.round(0.12 * RATE));

  /*
    5. The build-up, on the band that carries the drums: a rising highpass that
    thins the kit to a hiss, a beat repeat over the last bar whose slice halves
    twice, and a quarter-bar of near silence to fall into.
  */
  const sweep = curve([
    [bar(BUILD.from), 20],
    [bar(BUILD.to - 0.3), 900],
    [bar(BUILD.to), 900],
    [bar(BUILD.to) + 1, 20],
  ]);
  for (let c = 0; c < 2; c++) {
    const swept = sweepHighpass(high[c], sweep);
    for (let i = bar(BUILD.from); i < bar(BUILD.to); i++) high[c][i] = swept[i];
  }

  /* The beat repeat: one slice, re-fired at 1/8, 1/16 and 1/32 of a bar. */
  const stutter = [
    { from: 18.0, to: 18.5, step: 0.125 },
    { from: 18.5, to: 18.75, step: 0.0625 },
    { from: 18.75, to: BUILD.to - 0.25, step: 0.03125 },
  ];
  for (let c = 0; c < 2; c++) {
    const slice = high[c].slice(bar(18), bar(18.125));
    for (const { from, to, step } of stutter)
      for (let b = from; b < to - 1e-6; b += step) {
        const len = Math.round(step * BAR);
        for (let i = 0; i < len; i++) high[c][bar(b) + i] = 0;
        blit(high[c], slice, bar(b), 0, len, 0.9, 40, 40);
      }
  }
  /* The gap. Not silence — a tail, so the drop lands on a breath not a cut. */
  const hush = curve([
    [bar(BUILD.to - 0.25), 1],
    [bar(BUILD.to - 0.12), 0.06],
    [bar(BUILD.to) - 1, 0.06],
    [bar(BUILD.to), 1],
  ]);
  for (let c = 0; c < 2; c++)
    for (let i = bar(BUILD.to - 0.25); i < bar(BUILD.to); i++) high[c][i] *= hush(i);

  /* 6. Recombine, then hold the peak under 1 with a soft knee rather than clipping. */
  const out = [new Float32Array(OUT_N), new Float32Array(OUT_N)];
  let peak = 0;
  for (let c = 0; c < 2; c++)
    for (let i = 0; i < OUT_N; i++) {
      const v = low[c][i] + high[c][i];
      out[c][i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
  const target = 0.94;
  for (let c = 0; c < 2; c++)
    for (let i = 0; i < OUT_N; i++) out[c][i] = Math.tanh((out[c][i] / peak) * 1.15) * target;

  writeWav(OUT, out);

  console.log(`wrote ${OUT.replace(`${ROOT}/`, "")}`);
  console.log(`  ${OUT_N} samples = ${(OUT_N / RATE).toFixed(2)}s = ${DURATION_FRAMES} frames`);
  console.log(`  peak before limiting ${peak.toFixed(3)}`);
  if (report) {
    console.log("\nbar → frame (these are the numbers beats.ts cuts on):");
    for (const b of [0, 1, 4, 7, 10, 13, 14, 16, 19, 20.5, 24, 29, 30, 31])
      console.log(`  bar ${String(b).padStart(5)}  frame ${barFrame(b).toFixed(2).padStart(8)}`);
  }
};

main();
