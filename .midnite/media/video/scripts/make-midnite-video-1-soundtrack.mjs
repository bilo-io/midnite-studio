#!/usr/bin/env node
/**
 * Arrange "Midnite video 1 — the automated workflow"'s bed out of the
 * neon-HUD template's own track.
 *
 *   node scripts/make-midnite-video-1-soundtrack.mjs            # build
 *   node scripts/make-midnite-video-1-soundtrack.mjs --report   # build and print the map
 *
 * Writes `projects/youtube-tutorials/midnite-video-1-automated-workflow/input/bed.wav`,
 * which the episode's `Episode.tsx` mounts as its only music. WAV rather than
 * MP3 because every number here is a sample offset on the picture's beat grid,
 * and an MP3 round-trip adds encoder delay at the head that would pull the
 * whole bed a frame or so off the cuts.
 *
 * ── Why a re-arrangement ─────────────────────────────────────────────────────
 *
 * The brief asks for the template's sound "with a tiny bit more variation".
 * The template plays `soulprodmusic-gym-energy` straight from the top and
 * stops on its break. This edit keeps the same track (so the same style,
 * tempo and key) but takes the listener through more of it, and in an order
 * the picture can lean on:
 *
 *   intro pads → drop A, with its second half played twice → a short breakdown → its riser → drop B → the track's
 *   own tail as the ending.
 *
 * Nothing is synthesised and no second song is mixed in.
 *
 * ── Headroom (v2) ────────────────────────────────────────────────────────────
 *
 * The source is mastered hot: decoded as float it peaks at 1.09, over full
 * scale. v1 decoded it straight to 16-bit, which clamps every one of those
 * peaks — 95 hard-clipped transients across the drops, mostly on kicks, a
 * handful between beats, and they read as loud cracks out of rhythm. The
 * template never had them, because Remotion decodes the mp3 as float and
 * scales it by 0.55 before anything can clip. So the source is now decoded to
 * 32-bit float and the whole bed scaled to peak at `PEAK` before it is
 * written; `content.ts` raises the bed's volume by the same factor (printed by
 * `--report`), so it plays exactly as loud as before, minus the clipping.
 *
 * ── What was measured ────────────────────────────────────────────────────────
 *
 * **124.00 BPM, not 123.05.** librosa's `beat_track` reports 123.05, which is
 * one of its tempo bins rather than a measurement, and the template's
 * `beats.ts` inherited it. Against a 123.05 grid this track's onsets drift
 * about −4ms a beat: −64ms by beat 32, six frames by beat 64. Fitting a comb
 * of beat times to the percussive onset envelope (scratch `fit.py`: BPM
 * 123.00–125.00 in 0.01 steps, origin ±150ms in 2ms steps, over beats 16–190)
 * lands on exactly 124.00 BPM with the grid's origin **62ms** into the file,
 * and every 16-beat phrase from 0 to 208 then sits within 2ms of it.
 *
 * The bed is written with that origin moved to sample 0, so in the episode
 * beat `b` is simply frame `b × 60/124 × 30`. Band energy per four beats
 * gives the track's sections, in source beats:
 *
 *      0– 32  pads, light kick from 16
 *     32– 96  drop A (four 16-beat phrases, a fill every 16th beat from 44)
 *     96–128  breakdown: pads only, riser from 124
 *    128–192  drop B, the same pattern as drop A
 *    192–208  tail, decaying to silence by ~210
 *
 * Every splice below is on a 16-beat phrase boundary, between sections whose
 * loop phase matches, so the groove never stumbles across a join.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets/audio/music/soulprodmusic-gym-energy-514739.mp3");
const OUT = join(ROOT, "projects/youtube-tutorials/midnite-video-1-automated-workflow/input/bed.wav");

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
  { from: 0, to: 96, src: 0, what: "intro pads (hook) + drop A (chapter 01, chapter 02 from 80)" },
  { from: 96, to: 136, src: 64, what: "drop A's second half again, into the breakdown (rest of chapter 02, the breath)" },
  { from: 136, to: 144, src: 120, what: "breakdown, last bars + riser" },
  { from: 144, to: 208, src: 128, what: "drop B (chapter 03 + recap)" },
  { from: 208, to: 232, src: 192, what: "the track's own tail (outro)" },
];
export const LENGTH_BEATS = 232;

/**
 * Half-beat silences at an act change, as the reference has. v1 had two (beats
 * 63.5 and 143.5) and both read as the music breaking — a beat cut out of a
 * running drop sounds like a glitch, not a transition — so v2 has none. The
 * mechanism stays for a track whose arrangement already breathes there.
 */
const DROPOUTS = [];

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
  for (let o = start; o < end; o++) {
    if (o < 0 || o >= n) continue;
    const s = s0 + (o - o0);
    let g = 1;
    if (!first && o < o0 + XFADE / 2) g = Math.sin(((o - start) / XFADE) * (Math.PI / 2));
    if (!last && o >= o1 - XFADE / 2) g = Math.cos(((o - (o1 - XFADE / 2)) / XFADE) * (Math.PI / 2));
    for (let c = 0; c < out.length; c++) out[c][o] += (src[c][s] ?? 0) * g;
  }
});

for (const d of DROPOUTS) {
  const a = at(d.from);
  const b = at(d.to);
  for (let o = a - EDGE; o < b + EDGE; o++) {
    const g = o < a ? 1 - (o - (a - EDGE)) / EDGE : o >= b ? (o - b) / EDGE : 0;
    for (let c = 0; c < out.length; c++) out[c][o] *= g;
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
      `  beats ${String(s.from).padStart(3)}–${String(s.to).padEnd(3)} frames ${String(f(s.from)).padStart(4)}–${String(f(s.to)).padEnd(4)} ← src ${s.src}–${s.src + s.to - s.from}  ${s.what}`,
    );
  for (const d of DROPOUTS) console.log(`  dropout beats ${d.from}–${d.to} (frames ${f(d.from)}–${f(d.to)}) ${d.why}`);
}
