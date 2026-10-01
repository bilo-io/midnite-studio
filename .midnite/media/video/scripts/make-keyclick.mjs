#!/usr/bin/env node
/**
 * Synthesise the keyboard one-shots the typewriter titles are scored to.
 *
 *   node scripts/make-keyclick.mjs            # write assets/audio/sfx/keyclick-{1..4}.wav
 *   node scripts/make-keyclick.mjs --check    # fail if any is missing or stale
 *
 * ── Why synthesised rather than sourced ─────────────────────────────────────
 *
 * `assets/audio/sfx/` is stock cinematic one-shots — risers, impacts, whooshes,
 * all of them seconds long and none of them a keystroke. A typing sound is the
 * opposite kind of sample: 80 milliseconds, played two hundred times in a cut,
 * and the *variation* between the copies is the whole effect. Four takes of one
 * stock click played round-robin still read as four takes of one stock click;
 * four synthesised ones can be four genuinely different strikes off the same
 * model, which is what a keyboard actually is.
 *
 * It is also the only way to keep the brief's word. "Subtle" is a mix decision
 * that has to survive two hundred repeats without becoming the thing you hear,
 * and a stock click mastered for a UI demo arrives at whatever level the vendor
 * chose. These are written at a fixed peak (`PEAK`) so the composition's
 * `volume` is the only place the level is decided.
 *
 * ── The model ───────────────────────────────────────────────────────────────
 *
 * A key press is two events a few milliseconds apart, and both are needed or it
 * does not read as a keyboard:
 *
 *   1. **the click** — the switch's leaf snapping, which is a burst of noise
 *      band-limited up around 2–5kHz with an almost instant decay (~8ms). Alone
 *      it is a stick on a hi-hat.
 *   2. **the thock** — the keycap bottoming out on the plate a moment later,
 *      which is a damped resonance an octave or two above middle C with a
 *      longer tail (~45ms). Alone it is a woodblock.
 *
 * The delay between them (`bottomOut`) is what makes it a *press* rather than a
 * tick: it is the travel of the key. Two milliseconds reads as a mouse click,
 * eight as a slow deliberate keyboard. The four variants below move it, the
 * resonance's pitch, and the noise's brightness together, so what changes
 * between two keystrokes is what would change between two keys on a real board
 * — where on the plate it was struck — rather than just its volume.
 *
 * Deterministic: the noise comes from a seeded LCG, so re-running this writes
 * byte-identical files and `--check` is meaningful in CI. A `Math.random()`
 * burst would make every run "stale".
 *
 * WAV, not MP3, for the same reason `make-pilot-soundtrack.mjs` writes WAV: an
 * MP3 round-trip adds encoder delay at the head, and the head is the entire
 * point of a sound that is supposed to land on the frame a character appears.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "audio", "sfx");

const RATE = 44100;
/** Longest tail of any variant, rounded up to a whole millisecond. */
const LENGTH = Math.round(RATE * 0.11);
/** Peak sample of every file, so the mix level lives in the composition. */
const PEAK = 0.72;

/**
 * The four strikes.
 *
 * `click` is the leaf snap: `hz` is the centre of its band and `decay` its time
 * constant in seconds. `thock` is the bottom-out: `hz` its resonance, `decay`
 * its tail, `delay` how long the key takes to travel. `tilt` biases the noise
 * brighter (>1) or duller (<1) — the difference between a key struck near its
 * edge and one struck flat.
 */
const VARIANTS = [
  { click: { hz: 3400, decay: 0.0075 }, thock: { hz: 196, decay: 0.045, delay: 0.0045 }, tilt: 1.0 },
  { click: { hz: 4100, decay: 0.0062 }, thock: { hz: 232, decay: 0.038, delay: 0.0038 }, tilt: 1.18 },
  { click: { hz: 2900, decay: 0.0088 }, thock: { hz: 174, decay: 0.052, delay: 0.0055 }, tilt: 0.86 },
  { click: { hz: 3700, decay: 0.007 }, thock: { hz: 208, decay: 0.042, delay: 0.0041 }, tilt: 1.07 },
];

/**
 * A seeded linear congruential generator — Numerical Recipes' constants.
 *
 * Seeded per variant rather than once for the file set, so editing variant 3
 * does not rewrite variants 1, 2 and 4 with different noise and make every one
 * of them show up as changed.
 */
const lcg = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/**
 * One strike, as float samples.
 *
 * The click is white noise through a one-pole highpass (`n - prev`, tilted) and
 * an exponential decay; the thock is a decaying sine with a little of its own
 * second harmonic, which is what stops it sounding like a test tone. Both are
 * summed and the result is normalised to `PEAK` — the two layers' relative
 * levels are set here, in the sum, and the absolute level is set once, after.
 */
const strike = ({ click, thock, tilt }, seed) => {
  const rand = lcg(seed);
  const out = new Float64Array(LENGTH);

  /*
    A one-pole highpass wants its cutoff as a coefficient, and the coefficient
    for a click centred at `hz` is how much of the previous sample it keeps.
    `tilt` moves that up or down a little — brighter keys keep less.
  */
  const alpha = Math.min(0.98, (click.hz / (click.hz + RATE / (2 * Math.PI))) * tilt);
  let prev = 0;
  for (let i = 0; i < LENGTH; i++) {
    const t = i / RATE;
    const white = rand() * 2 - 1;
    const hp = white - prev * (1 - alpha);
    prev = white;
    out[i] += hp * Math.exp(-t / click.decay) * 0.62;
  }

  const delay = Math.round(thock.delay * RATE);
  for (let i = delay; i < LENGTH; i++) {
    const t = (i - delay) / RATE;
    const env = Math.exp(-t / thock.decay);
    out[i] +=
      env *
      (Math.sin(2 * Math.PI * thock.hz * t) * 0.5 + Math.sin(4 * Math.PI * thock.hz * t) * 0.14);
  }

  /*
    A 1.5ms fade at each end. The head one costs nothing audible and stops the
    first sample being a step; the tail one is what keeps two hundred of these
    from each ending in a tick of their own.
  */
  const fade = Math.round(RATE * 0.0015);
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[LENGTH - 1 - i] *= i / fade;
  }

  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  const gain = PEAK / max;
  for (let i = 0; i < LENGTH; i++) out[i] *= gain;
  return out;
};

/** Mono 16-bit PCM WAV. */
const wav = (samples) => {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

const check = process.argv.includes("--check");
mkdirSync(OUT, { recursive: true });

const problems = [];
let written = 0;

VARIANTS.forEach((variant, i) => {
  const name = `keyclick-${i + 1}.wav`;
  const target = join(OUT, name);
  const want = wav(strike(variant, 0x5eed + i * 7919));
  let have = null;
  try {
    have = readFileSync(target);
  } catch {
    /* missing — reported below */
  }
  if (have && have.equals(want)) return;
  if (check) {
    problems.push(`${name} ${have === null ? "missing" : "stale"}`);
  } else {
    writeFileSync(target, want);
    console.log(`  + audio/sfx/${name}  ${(want.length / 1024).toFixed(1)}kB`);
    written++;
  }
});

if (check) {
  if (problems.length) {
    console.error(`keyclicks out of date:\n  ${problems.join("\n  ")}`);
    console.error("run: node scripts/make-keyclick.mjs");
    process.exit(1);
  }
  console.log("keyclicks up to date");
} else {
  console.log(`${written} written`);
}
