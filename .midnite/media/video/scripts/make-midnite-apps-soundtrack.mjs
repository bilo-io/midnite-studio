#!/usr/bin/env node
/**
 * Arrange "Midnite Apps"'s bed out of the same track as midnite video 1's bed
 * (`soulprodmusic-gym-energy`), stretched to the Iron Aria cut's length.
 *
 *   node scripts/make-midnite-apps-soundtrack.mjs            # build
 *   node scripts/make-midnite-apps-soundtrack.mjs --report   # build and print the map
 *
 * Writes `projects/midnite-apps/input/bed.wav`. This is
 * `make-midnite-video-1-soundtrack.mjs` with a longer `MAP` — read that file
 * for the measurements (124.00 BPM, the grid origin 62ms into the source, the
 * headroom scaling) and why every join sits on a 16-beat phrase line.
 *
 * The film is 376 beats = 5458 frames = 3:01.9. v1 was 264 beats, the length
 * of video 1's v11 (Iron Aria) cut; v2 grew so every app gets its own shots,
 * and its second half turns into a dubstep remix and back: after chapter 03
 * the song's breakdown comes round again under a synthesized eight-bar build,
 * a sixteen-bar half-time dubstep drop carries chapter 04 (synthesized in
 * `midnite-apps-dubstep.mjs`, in the song's key and on its grid), and then the
 * song itself comes back — drop B's last phrase for the recap, and the same
 * tail and ending as v1.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Svf, renderBuild, renderDrop } from "./midnite-apps-dubstep.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets/audio/music/soulprodmusic-gym-energy-514739.mp3");
const OUT = join(ROOT, "projects/midnite-apps/input/bed.wav");

const RATE = 44100;
const FPS = 30;
/** Must equal `BPM` in the episode's `beats.ts`. Measured; see above. */
const BPM = 124;
const BEAT = (60 / BPM) * RATE;
/** Where the source's beat 0 falls. The output's beat 0 is its sample 0. */
const SRC_ORIGIN = Math.round(0.062 * RATE);
/** Beat `b` as a sample offset in the output. */
const at = (b) => Math.round(b * BEAT);
/** Beat `b` as a sample offset in the source. */
const atSrc = (b) => SRC_ORIGIN + at(b);

/**
 * The arrangement, in beats: `[from, to)` of the output plays the source from
 * `src`. Read top to bottom, it is the film's structure.
 */
const MAP = [
  { from: 0, to: 96, src: 0, what: "intro pads (hook: the website) + drop A (chapter 01, the launcher; chapter 02 from 80)" },
  { from: 96, to: 136, src: 64, what: "drop A's second half again, into the breakdown (rest of chapter 02, the statement)" },
  { from: 136, to: 144, src: 120, what: "breakdown, last bars + riser (the breath)" },
  { from: 144, to: 208, src: 128, what: "drop B (chapter 03, app to app)" },
  { from: 208, to: 240, src: 160, what: "drop B's second half again (the rest of chapter 03)" },
  {
    from: 240,
    to: 272,
    src: 96,
    build: true,
    what: "the whole breakdown, under a synthesized build; the song high-passed away over its last 4 bars (the second statement and breath)",
  },
  { from: 272, to: 336, synth: true, what: "the dubstep drop: 16 bars, half-time, G minor (chapter 04, the whole suite)" },
  { from: 336, to: 352, src: 176, what: "back to the song: drop B's last phrase (the recap)" },
  { from: 352, to: 376, src: 192, what: "the track's own tail (outro), as v1" },
];
export const LENGTH_BEATS = 376;

/** Where the build's high-pass starts opening, and the cutoff it reaches by the gap. */
const BUILD_SWEEP = { from: 256, to: 271.5, hz: [20, 900] };
/** The dubstep drop's loudness against the song's own drop B (RMS ratio). */
const DROP_LEVEL = 1.3;
/** The build's layers over their last two bars, against drop B. */
const BUILD_LEVEL = 0.55;

/**
 * Half-beat silences at an act change, as the reference has. v1 had two (beats
 * 63.5 and 143.5) and both read as the music breaking — a beat cut out of a
 * running drop sounds like a glitch, not a transition — so v2 has none. The
 * mechanism stays for a track whose arrangement already breathes there.
 */
const DROPOUTS = [{ from: 271.5, to: 272, why: "the held breath before the dubstep drop: a gap in a build, not a beat cut out of a running drop" }];

/** The bed's peak after scaling, leaving headroom for the mix. */
const PEAK = 0.95;

/** Equal-power crossfade at each splice: long enough to hide a step, short enough to keep the kick. */
const XFADE = 2 * Math.round(0.006 * RATE); // even, so XFADE / 2 is a whole sample
/** Ramp in and out of a dropout so it clicks neither way. */
const EDGE = Math.round(0.004 * RATE);
/** Fade over the last four beats so the bed ends with the picture. */
const TAIL_FADE_BEATS = 4;

/* ── WAV in and out ───────────────────────────────────────────────────────── */

const decode = () => {
  const tmp = mkdtempSync(join(tmpdir(), "soundtrack-"));
  const wav = join(tmp, "src.wav");
  try {
    execFileSync("ffmpeg", ["-y", "-i", SOURCE, "-ac", "2", "-ar", String(RATE), "-c:a", "pcm_f32le", wav], {
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
  let float = false;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      float = buf.readUInt16LE(off + 8) === 3;
      channels = buf.readUInt16LE(off + 10);
    }
    if (id === "data") {
      data = buf.subarray(off + 8, off + 8 + size);
      break;
    }
    off += 8 + size + (size % 2);
  }
  const width = float ? 4 : 2;
  const n = data.length / width / channels;
  const ch = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * width;
      ch[c][i] = float ? data.readFloatLE(o) : data.readInt16LE(o) / 32768;
    }
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

/* ── Arrange ──────────────────────────────────────────────────────────────── */

const src = decode();
const n = at(LENGTH_BEATS);
const out = src.map(() => new Float32Array(n));

/*
  Each segment is written with XFADE samples of run-on past its end, and the
  next one fades in over the same span — so a join is a crossfade between two
  takes of the same beat position, centred on the grid line.
*/
MAP.forEach((seg, i) => {
  const o0 = at(seg.from);
  const o1 = at(seg.to);
  const s0 = atSrc(seg.src);
  const first = i === 0;
  const last = i === MAP.length - 1;
  const start = first ? o0 : o0 - XFADE / 2;
  const end = last ? o1 : o1 + XFADE / 2;
  if (seg.synth) return;
  for (let o = start; o < end; o++) {
    if (o < 0 || o >= n) continue;
    const s = s0 + (o - o0);
    let g = 1;
    if (!first && o < o0 + XFADE / 2) g = Math.sin(((o - start) / XFADE) * (Math.PI / 2));
    if (!last && o >= o1 - XFADE / 2) g = Math.cos(((o - (o1 - XFADE / 2)) / XFADE) * (Math.PI / 2));
    for (let c = 0; c < out.length; c++) out[c][o] += (src[c][s] ?? 0) * g;
  }
});

/* ── The remix ─────────────────────────────────────────────────────────────── */

const rmsOf = (ch, a, b) => {
  let sum = 0;
  for (const c of ch) for (let i = a; i < b; i++) sum += c[i] * c[i];
  return Math.sqrt(sum / (ch.length * (b - a)));
};
/** Every synthesized part is levelled against the song's own drop B. */
const dropB = rmsOf(src, atSrc(128), atSrc(192));
const srcPeak = Math.max(...src.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));

const build = MAP.find((seg) => seg.build);
{
  const sweep = out.map(() => new Svf(RATE));
  const [h0, h1] = BUILD_SWEEP.hz;
  for (let o = at(BUILD_SWEEP.from); o < at(build.to); o++) {
    const p = Math.min(1, (o - at(BUILD_SWEEP.from)) / (at(BUILD_SWEEP.to) - at(BUILD_SWEEP.from)));
    const fc = h0 * (h1 / h0) ** p;
    for (let c = 0; c < out.length; c++) out[c][o] = sweep[c].run(out[c][o], fc).hp;
  }
  const layer = renderBuild({ rate: RATE, beat: BEAT, beats: build.to - build.from, gap: 272 - 271.5 });
  const o0 = at(build.from);
  const tail = Math.round((build.to - build.from - 8.5) * BEAT);
  const g = (BUILD_LEVEL * dropB) / rmsOf(layer, tail, tail + Math.round(8 * BEAT));
  for (let c = 0; c < out.length; c++) for (let i = 0; i < layer[c].length; i++) out[c][o0 + i] += layer[c][i] * g;
}

for (const d of DROPOUTS) {
  const a = at(d.from);
  const b = at(d.to);
  for (let o = a - EDGE; o < b + EDGE; o++) {
    const g = o < a ? 1 - (o - (a - EDGE)) / EDGE : o >= b ? (o - b) / EDGE : 0;
    for (let c = 0; c < out.length; c++) out[c][o] *= g;
  }
}

/* The drop goes in after the gap is cut, so its first hit is not ramped. */
const drop = MAP.find((seg) => seg.synth);
{
  const bars = (drop.to - drop.from) / 4;
  const layer = renderDrop({ rate: RATE, beat: BEAT, bars });
  const o0 = at(drop.from);
  const len = Math.min(layer[0].length, at(drop.to) - o0);
  const g = (DROP_LEVEL * dropB) / rmsOf(layer, 0, len);
  const fade = XFADE / 2;
  for (let c = 0; c < out.length; c++)
    for (let i = 0; i < len; i++) {
      const edge = i >= len - fade ? Math.cos(((i - (len - fade)) / fade) * (Math.PI / 2)) : 1;
      /* A soft ceiling at the song's own peak, so the synth never sets the bed's level. */
      out[c][o0 + i] += srcPeak * Math.tanh((layer[c][i] * g) / srcPeak) * edge;
    }
}

const fade0 = at(LENGTH_BEATS - TAIL_FADE_BEATS);
for (let o = fade0; o < n; o++) {
  const g = Math.cos(((o - fade0) / (n - fade0)) * (Math.PI / 2));
  for (let c = 0; c < out.length; c++) out[c][o] *= g;
}

let peak = 0;
for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
const scale = PEAK / peak;
for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= scale;

writeWav(OUT, out);

if (process.argv.includes("--report")) {
  const f = (b) => Math.round((at(b) / RATE) * FPS);
  console.log(`bed.wav · ${(n / RATE).toFixed(2)}s · ${LENGTH_BEATS} beats at ${BPM} BPM`);
  console.log(`  peak ${peak.toFixed(3)} → ${PEAK} (×${scale.toFixed(4)}); play it at volume ÷ ${scale.toFixed(4)} to match the source`);
  for (const s of MAP)
    console.log(
      `  beats ${String(s.from).padStart(3)}–${String(s.to).padEnd(3)} frames ${String(f(s.from)).padStart(4)}–${String(f(s.to)).padEnd(4)} ← ${s.synth ? "synth      " : `src ${s.src}–${s.src + s.to - s.from}`}  ${s.what}`,
    );
  for (const d of DROPOUTS) console.log(`  dropout beats ${d.from}–${d.to} (frames ${f(d.from)}–${f(d.to)}) ${d.why}`);
}
