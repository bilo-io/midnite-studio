#!/usr/bin/env node
/**
 * Lengthen the go-live promo's song, `The_Iron_Aria`, for "Midnite video 1 —
 * the automated workflow"'s Iron Aria cut.
 *
 *   node scripts/make-midnite-video-1-iron-aria.mjs            # build
 *   node scripts/make-midnite-video-1-iron-aria.mjs --report   # build and print the map
 *
 * Writes `projects/youtube-tutorials/midnite-video-1-automated-workflow/input/iron-aria.wav`,
 * the music `cuts.ts`'s `ironAria` cut mounts. WAV for the same reason as the
 * bed (`make-midnite-video-1-soundtrack.mjs`): every number here is a sample
 * offset on the picture's grid, and an MP3 round-trip would move it.
 *
 * ── The clock ────────────────────────────────────────────────────────────────
 *
 * The promo measured the track at 140.95 BPM, a bar of four beats every
 * 51.0808 frames, with its first hit — bar 0 — 15.443 s in
 * (`projects/midnite/marketing/001-golive-promo/beats.ts`). The film's bar 0
 * is the track's bar −9, 0.12 s in, so the episode's grid starts on sample 0
 * and its bar `b` is frame `b × 51.0808`.
 *
 * ── Why a splice ─────────────────────────────────────────────────────────────
 *
 * The track is 98.9 s; the episode's 26 slots and outro need 127.7. So the
 * second half plays twice: the track runs from its bar −9 to bar 40 — the
 * intro, the drop at 18, the breakdown at 31, the last boom at 38 and the
 * first bar of its wind-down — and then jumps back to the drop at bar 18 and
 * plays on to bar 44. The join lands where the track itself goes nearly
 * silent before its drop (bar 17.3), so the jump reads as the arrangement's
 * own pause rather than an edit. Both segments start on bar lines, so the
 * groove is unbroken across it. Nothing is synthesised and nothing is mixed in.
 *
 * The source is mastered hot as well; it is decoded as float and the whole
 * cut scaled to peak at `PEAK`, and `cuts.ts` sets the levels by measurement.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets/audio/curated/music/The_Iron_Aria.mp3");
const OUT = join(ROOT, "projects/youtube-tutorials/midnite-video-1-automated-workflow/input/iron-aria.wav");

const RATE = 44100;
const FPS = 30;
/** Frames per bar, and the source's bar 0 in seconds — the promo's measurements. */
const BAR_FRAMES = 51.0808;
const SRC_BAR0 = 15.443;
const BAR = (BAR_FRAMES / FPS) * RATE;
/** Bar `b` as a sample offset in the output. */
const at = (b) => Math.round(b * BAR);
/** Bar `b` as a sample offset in the source. */
const atSrc = (b) => Math.round(SRC_BAR0 * RATE) + at(b);

/** `[from, to)` film bars play the source from its bar `src`. Must match `cuts.ts`. */
const MAP = [
  { from: 0, to: 49, src: -9, what: "intro, first hit (bar 9), drop (27), breakdown, last boom (47)" },
  { from: 49, to: 75, src: 18, what: "the drop again (49), breakdown (62), last boom (69, the outro), wind-down" },
];
export const LENGTH_BARS = 75;

/** The cut's peak after scaling, leaving headroom for the mix. */
const PEAK = 0.95;
/** Equal-power crossfade at the splice. */
const XFADE = 2 * Math.round(0.006 * RATE);
/** Fade over the last bar so the music ends with the picture. */
const TAIL_FADE_BARS = 1.5;

/* ── WAV in and out ───────────────────────────────────────────────────────── */

const decode = () => {
  const tmp = mkdtempSync(join(tmpdir(), "iron-aria-"));
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
const n = at(LENGTH_BARS);
const out = src.map(() => new Float32Array(n));

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

const fade0 = at(LENGTH_BARS - TAIL_FADE_BARS);
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
  console.log(`iron-aria.wav · ${(n / RATE).toFixed(2)}s · ${LENGTH_BARS} bars of ${BAR_FRAMES} frames`);
  console.log(`  peak ${peak.toFixed(3)} → ${PEAK} (×${scale.toFixed(4)})`);
  for (const s of MAP)
    console.log(
      `  bars ${String(s.from).padStart(2)}–${String(s.to).padEnd(2)} frames ${String(f(s.from)).padStart(4)}–${String(f(s.to)).padEnd(4)} ← src bar ${s.src}–${s.src + s.to - s.from}  ${s.what}`,
    );
}
