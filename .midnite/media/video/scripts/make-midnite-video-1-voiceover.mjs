#!/usr/bin/env node
/**
 * Speak "Midnite video 1 — the automated workflow"'s `say` lines with a local
 * Kokoro-82M voice (default `am_onyx`), one line per slot, locked to the cuts.
 *
 *   node scripts/make-midnite-video-1-voiceover.mjs                # build
 *   node scripts/make-midnite-video-1-voiceover.mjs --report       # build and print the placement
 *   node scripts/make-midnite-video-1-voiceover.mjs --voice am_michael
 *   node scripts/make-midnite-video-1-voiceover.mjs --cut ironAria  # the Iron Aria cut
 *
 * `--cut` names one of the episode's cuts (`cuts.ts`, default `bed`), which
 * sets each slot's start, the beat and the output file — `input/voiceover.wav`
 * for the bed, `input/voiceover-iron-aria.wav` for the Iron Aria. It writes
 * one 48 kHz mono track as long as the film, every line already sitting at its
 * slot's frame, so `Episode.tsx` mounts it as one `<Audio>` from frame 0 and
 * the cuts and the voice cannot drift apart.
 *
 * ── Where Kokoro comes from ──────────────────────────────────────────────────
 *
 * Nothing is installed for this. Midnite Studio already ships `kokoro-js` for
 * its companion voice (`packages/desktop`), and the app keeps the model in
 * `~/Library/Application Support/Midnite Studio/companion-voice/kokoro/`
 * once the companion's local voice has been used. This script resolves
 * `kokoro-js` from the studio repo this workspace lives in, points the model
 * cache at the app's, and refuses remote downloads — so it runs offline, and
 * fails with a pointer rather than fetching 90 MB if the model is not there.
 * `KOKORO_CACHE_DIR` overrides the cache. The voices ship inside `kokoro-js`.
 *
 * ── Fitting a line to its slot ───────────────────────────────────────────────
 *
 * A slot is as many beats as its cut gives it — on the bed eight beats at 124
 * BPM, 3.87 s; on the Iron Aria two or three bars. A line starts `LEAD` beats
 * after the cut (so the whoosh speaks first) and must end `TAIL` beats before
 * the next one — on the bed a 3.63 s window. Each line is rendered at natural speed, its
 * leading and trailing silence trimmed, and re-rendered faster only if it
 * overruns, by just enough to fit, capped at `MAX_SPEED`. A line still too
 * long at the cap runs into the next slot; the next line then starts `GAP`
 * after it and is fitted into what is left of its own slot, so two lines
 * never overlap. `--report` prints each line's speed and any lateness.
 *
 * `SPOKEN` respells the few on-screen tokens Kokoro would misread; the
 * on-screen `say` text is unchanged. An ellipsis in a line ("a skill... and a
 * loop") is a held beat: the halves are spoken separately with `PAUSE` of
 * silence between them, which Kokoro's own reading of "..." does not reliably give.
 *
 * It also writes where each of those parts landed — `voice-<cut>.ts` beside the
 * episode's source, `PARTS[slot]` a list of `[from, to]` composition frames —
 * so the picture can land on a word: the recap types `/swarm` as it is said.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "youtube-tutorials/midnite-video-1-automated-workflow";
const SOURCE = join(ROOT, "video-editor/src/projects", PROJECT);
const CONTENT_TS = join(SOURCE, "content.ts");

const args = process.argv.slice(2);
const report = args.includes("--report");
const voiceArg = args.indexOf("--voice");
const VOICE = voiceArg === -1 ? "am_onyx" : args[voiceArg + 1];
const cutArg = args.indexOf("--cut");
const CUT_ID = cutArg === -1 ? "bed" : args[cutArg + 1];

// The cut's clock, from the episode's own `cuts.ts` — plain data, so Node loads it with the types stripped.
const { CUTS } = await import(join(SOURCE, "cuts.ts"));
const CUT = CUTS[CUT_ID];
if (!CUT) throw new Error(`no cut "${CUT_ID}" — one of ${Object.keys(CUTS).join(", ")}`);
const OUT = join(ROOT, "projects", PROJECT, "input", CUT.audio.voiceover);
const FPS = 30;
const BEAT_S = CUT.beat / FPS;

const LEAD = 0.25; // beats after the cut before the voice starts
const TAIL = 0.25; // beats of air before the next cut
const MAX_SPEED = 1.25;
const GAP = 0.1; // seconds between a line that ran long and the next
const PAUSE = 0.38; // seconds of silence where a line has "..."
const VOICE_LUFS = -16;
const RATE = 48_000;
const KOKORO_RATE = 24_000;

const SPOKEN = [
  [/\b500K\b/g, "five hundred K"],
  [/\bPR\b/g, "P R"],
];

/** The `say` lines in timeline order, one per slot (chapters included). */
function readSlots() {
  const src = readFileSync(CONTENT_TS, "utf8");
  const timeline = src.slice(src.indexOf("timeline: ["), src.indexOf("outro: {"));
  // Each slot opens with `{ scene:`, `{ chapter:`, `{ statement:` or `{ slugs:` at the timeline's own indent.
  const slots = timeline.split(/\n    \{\s*(?=scene:|chapter:|statement:|slugs:)/).slice(1);
  return slots.map((slot) => /say: "((?:[^"\\]|\\.)*)"/.exec(slot)?.[1] ?? null);
}

async function loadKokoro() {
  const fromStudio = createRequire(join(ROOT, "../../../packages/desktop/package.json"));
  let entry;
  try {
    entry = fromStudio.resolve("kokoro-js");
  } catch {
    throw new Error("kokoro-js not found — run `pnpm install` in the Midnite Studio repo this workspace lives in.");
  }
  // Both through `require`, so kokoro-js and this script share one transformers instance and its `env`.
  const { env } = createRequire(entry)("@huggingface/transformers");
  env.cacheDir =
    process.env.KOKORO_CACHE_DIR ?? join(homedir(), "Library/Application Support/Midnite Studio/companion-voice/kokoro");
  env.allowRemoteModels = false;
  if (!existsSync(join(env.cacheDir, "onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx"))) {
    throw new Error(`No Kokoro model under ${env.cacheDir} — enable the companion's local voice once, or set KOKORO_CACHE_DIR.`);
  }
  const { KokoroTTS } = fromStudio("kokoro-js");
  return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8" });
}

/** Drops leading/trailing samples below −50 dBFS, keeping 20 ms of each edge. */
function trim(samples) {
  const floor = 10 ** (-50 / 20);
  const pad = Math.round(0.02 * KOKORO_RATE);
  let a = 0;
  let b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < floor) a++;
  while (b > a && Math.abs(samples[b]) < floor) b--;
  return samples.subarray(Math.max(0, a - pad), Math.min(samples.length, b + pad + 1));
}

const tts = await loadKokoro();
const says = readSlots();
if (says.length !== CUT.slots.length) throw new Error(`${says.length} slots in content.ts, ${CUT.slots.length} in cut ${CUT_ID}`);
const totalBeats = CUT.end;
const mix = new Float32Array(Math.ceil(totalBeats * BEAT_S * KOKORO_RATE));
const rows = [];
/** Per slot, each spoken part as `[from, to]` composition frames. */
const parts = says.map(() => []);

/** One line at `speed`, trimmed; "..." splits it into parts with `PAUSE` between. Returns the parts' sample spans too. */
async function speak(text, speed) {
  const parts = [];
  for (const part of text.split(/\s*\.\.\.\s*/).filter(Boolean)) {
    parts.push(trim((await tts.generate(part, { voice: VOICE, speed })).audio));
  }
  const gap = Math.round(PAUSE * KOKORO_RATE);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0) + gap * (parts.length - 1));
  const spans = [];
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    spans.push([at, at + p.length]);
    at += p.length + gap;
  }
  return { audio: out, spans };
}

let prevEnd = 0; // seconds — where the previous line stopped
for (const [index, say] of says.entries()) {
  if (!say) continue;
  const text = SPOKEN.reduce((t, [from, to]) => t.replace(from, to), say.replace(/\\"/g, '"'));
  const slotStart = CUT.slots[index] * BEAT_S;
  const slotEnd = (CUT.slots[index + 1] ?? CUT.outro) * BEAT_S;
  const start = Math.max(slotStart + LEAD * BEAT_S, prevEnd + GAP);
  const room = slotEnd - TAIL * BEAT_S - start;
  let speed = 1;
  let spoken = await speak(text, speed);
  const natural = spoken.audio.length / KOKORO_RATE;
  // Duration is not linear in Kokoro's speed, so close in over a few passes.
  for (let pass = 0; pass < 4 && spoken.audio.length / KOKORO_RATE > room && speed < MAX_SPEED; pass++) {
    speed = Math.min(MAX_SPEED, speed * (spoken.audio.length / KOKORO_RATE / room) * 1.01);
    spoken = await speak(text, speed);
  }
  const line = spoken.audio;
  const at = Math.round(start * KOKORO_RATE);
  parts[index] = spoken.spans.map(([a, b]) => [a, b].map((n) => Math.round(((at + n) / KOKORO_RATE) * FPS)));
  mix.set(line.subarray(0, mix.length - at), at);
  const secs = line.length / KOKORO_RATE;
  prevEnd = start + secs;
  rows.push({ slot: index + 1, frame: Math.round(start * FPS), natural, speed, secs, late: start - slotStart - LEAD * BEAT_S, spills: secs > room + 1e-3, say });
}

// Peak-normalise to −1 dBFS for the hand-off, then resample to the film's
// 48 kHz and level it to `VOICE_LUFS` with ffmpeg's loudnorm (which also
// limits to −1.5 dBTP). Raw Kokoro speech integrates near −22 LUFS, which left
// v3's mix 4 dB under v2's music-only one.
let peak = 0;
for (const s of mix) peak = Math.max(peak, Math.abs(s));
const gain = peak > 0 ? 10 ** (-1 / 20) / peak : 1;
const tmp = join(tmpdir(), `voiceover-${process.pid}.f32`);
writeFileSync(tmp, Buffer.from(mix.map((s) => s * gain).buffer));
mkdirSync(dirname(OUT), { recursive: true });
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "f32le", "-ar", String(KOKORO_RATE), "-ac", "1", "-i", tmp,
  "-af", `loudnorm=I=${VOICE_LUFS}:TP=-1.5:LRA=7`,
  "-ar", String(RATE), "-c:a", "pcm_s16le", OUT,
]);
rmSync(tmp);

const TIMING = join(SOURCE, `voice-${CUT_ID.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.ts`);
writeFileSync(
  TIMING,
  `// Generated by scripts/make-midnite-video-1-voiceover.mjs --cut ${CUT_ID} — do not edit.\n` +
    `/** Per slot, each spoken part ("..." splits a line) as [from, to] composition frames. */\n` +
    `export const PARTS: readonly (readonly (readonly [number, number])[])[] = ${JSON.stringify(parts)};\n`,
);

const spills = rows.filter((r) => r.spills);
console.log(`wrote ${OUT.slice(ROOT.length + 1)} — cut ${CUT_ID}, ${rows.length} lines, voice ${VOICE}, ${spills.length} spilling`);
if (report) {
  console.log(`window = slot − ${(LEAD + TAIL).toFixed(2)} beats, speed cap ${MAX_SPEED}`);
  for (const r of rows) {
    console.log(
      `${String(r.slot).padStart(2)}  f${String(r.frame).padStart(4)}  ${r.natural.toFixed(2)}s → ${r.secs.toFixed(2)}s @${r.speed.toFixed(2)}${r.late > 0.01 ? `  +${r.late.toFixed(2)}s late` : ""}${r.spills ? "  SPILLS" : ""}  ${r.say}`,
    );
  }
}
