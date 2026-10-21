#!/usr/bin/env node
/**
 * Bake a music track's bass envelope into a TypeScript module, one value per
 * composition frame.
 *
 *   node scripts/make-track-envelope.mjs           # write it
 *   node scripts/make-track-envelope.mjs --check   # fail if it is stale
 *
 * ── Why this is a build step and not a component ────────────────────────────
 *
 * A logo that swells on the bass has to know how loud the bass is on the frame
 * it is drawing. Nothing in a Remotion component can find that out: the audio
 * is a `staticFile` URL handed to `<Audio>`, the render has no decoder in the
 * frame loop, and even if it did, reading it there would make the picture a
 * function of something other than the frame number — which is the one property
 * every animation in this repo is built on. Scrubbing backwards in Studio would
 * stop being reversible and a re-render of a single frame would stop matching.
 *
 * So the envelope is measured once, here, and shipped as an array. `ENERGY[f]`
 * is then as ordinary an input as `f` itself.
 *
 * ── What is measured ────────────────────────────────────────────────────────
 *
 * Three things per frame, because they drive three different pictures and no
 * one curve can do all of them:
 *
 *   THUMP  where the cone is. A short RMS of the track under `CUTOFF`, rising
 *          instantly and falling on a fixed release — which is what a driver
 *          does and, more to the point, what the raw RMS does not. This track's
 *          low end is almost entirely transient: sampled once a second the
 *          measured envelope is zero between kicks, so a logo scaled by it
 *          would flick for one frame and sit still for fifteen. The release is
 *          the difference between a jitter and a thump.
 *   PUNCH  how much more low end there is than a moment ago — the positive half
 *          of the difference against a short trailing average, sharpened. Near
 *          zero for most of a bar and close to one on the frames a drum lands,
 *          so it is the *strike* rather than the displacement: the buzz on the
 *          cone, not the swell of it.
 *   BANDS  `BAND_HZ.length` octave-wide bands across the audible range, each
 *          normalised **against itself**. This is the spectrum a radial
 *          waveform ring is drawn from, and the per-band normalisation is what
 *          makes it one: a mix is ~30dB louder at 110Hz than at 7kHz, so bands
 *          scaled against a common maximum give a ring where the bass spokes
 *          are long and the rest are a flat stub. Scaled against themselves,
 *          every spoke has a full range to move in and the ring reads as the
 *          music's *shape* rather than as its loudness.
 *
 * ── Two decisions worth not re-litigating ───────────────────────────────────
 *
 * **The low-pass is applied twice.** One 2-pole section at 140Hz is 12dB/octave,
 * which still passes a useful amount of a snare at 400Hz — and a snare in the
 * envelope is a logo that flinches on the backbeat as hard as on the kick.
 * Cascading two sections is 24dB/octave, where the snare is 20dB down.
 *
 * **Normalisation is against a high percentile, not the maximum.** A single
 * transient sample sets the maximum and would scale the entire track against
 * one frame of one drum hit; the 99th percentile is the loudest the track
 * *sustains*, so a mix that spends its last thirty seconds twice as loud as its
 * first does not flatten the first thirty to nothing. Values above it clamp,
 * which is exactly what a loudspeaker does.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** What to measure, and where the module it produces lives. */
const JOBS = [
  {
    track: "assets/audio/curated/music/The_Iron_Aria.mp3",
    out: "video-editor/src/projects/midnite/marketing/001-golive-promo/energy.ts",
    fps: 30,
    /** How many frames to bake. The film's `DURATION`. */
    frames: 2640,
    name: "The_Iron_Aria",
  },
];

/** Decode rate. Nyquist is 4kHz, which is ten times anything this looks at. */
const RATE = 8000;
/** Corner of each low-pass section, in Hz. Kick and sub, not snare. */
const CUTOFF = 140;
/** RMS window, in frames. Three is 100ms — a kick's body, not its click. */
const WINDOW = 3;
/** Frames the trailing average PUNCH is measured against. */
const TRAIL = 9;
/**
 * Centre frequencies of the spectrum bands, in Hz — the A harmonic series, one
 * octave apart, which is as close to how a listener divides a mix as eight
 * numbers get. Each is filtered one octave wide, so together they tile the
 * range without gaps.
 *
 * The decode rate has to clear twice the top one with room for the filter's
 * skirt; 22050 does, at three times the cost of the 8kHz pass the low-frequency
 * work uses, which is why the two are decoded separately.
 */
const BAND_HZ = [55, 110, 220, 440, 880, 1760, 3520, 7040];
const BAND_RATE = 22050;
/** Bands release faster than the cone: a ring that smears is not a waveform. */
const BAND_RELEASE = 0.74;

/**
 * How much of the previous frame's THUMP survives into this one.
 *
 * 0.86 a frame is a halving every 4.6 frames and −40dB in 1.0s, which puts the
 * tail of a kick just short of the next one at this track's 141 BPM. Higher and
 * successive beats merge into one held swell; lower and it is the raw envelope
 * again, which is the thing this exists to fix.
 */
const RELEASE = 0.86;

const check = process.argv.includes("--check");

/** Decode a file to mono PCM through an ffmpeg filter chain, as a Float64Array. */
const decode = (file, rate, filters) => {
  const tmp = mkdtempSync(join(tmpdir(), "envelope-"));
  const wav = join(tmp, "a.wav");
  try {
    const dec = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        resolve(ROOT, file),
        "-ac",
        "1",
        "-ar",
        String(rate),
        "-af",
        filters,
        "-c:a",
        "pcm_s16le",
        wav,
      ],
      { encoding: "utf8" },
    );
    if (dec.status !== 0) {
      console.error(dec.stderr?.trim() || "ffmpeg failed");
      process.exit(1);
    }
    const buf = readFileSync(wav);
    /*
      Walk the RIFF chunks rather than assuming a 44-byte header: ffmpeg writes
      a LIST/INFO chunk before `data`, so the fixed-offset shortcut reads
      encoder metadata as audio and the first tenth of a second comes out wrong.
    */
    let off = 12;
    while (buf.toString("ascii", off, off + 4) !== "data") off += 8 + buf.readUInt32LE(off + 4);
    const start = off + 8;
    const count = buf.readUInt32LE(off + 4) / 2;
    const pcm = new Float64Array(count);
    for (let i = 0; i < count; i++) pcm[i] = buf.readInt16LE(start + i * 2) / 32768;
    return pcm;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

/** The value `p` of the way up a sorted copy of `values`. */
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 1;
};

const round = (v, places) => Number(v.toFixed(places));

/** Print an array as wrapped, indented TypeScript. */
const format = (values, places) => {
  const out = [];
  let line = " ";
  for (const v of values) {
    const text = ` ${round(v, places)},`;
    if (line.length + text.length > 98) {
      out.push(line);
      line = " ";
    }
    line += text;
  }
  out.push(line);
  return out.join("\n");
};

/** RMS of `pcm` over a `WINDOW`-frame box centred on each of `frames` frames. */
const envelope = (pcm, rate, fps, frames) => {
  const per = rate / fps;
  const raw = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const from = Math.max(0, Math.round((f - (WINDOW - 1) / 2) * per));
    const to = Math.min(pcm.length, Math.round((f + (WINDOW + 1) / 2) * per));
    let sum = 0;
    for (let i = from; i < to; i++) sum += pcm[i] * pcm[i];
    raw[f] = to > from ? Math.sqrt(sum / (to - from)) : 0;
  }
  return raw;
};

/** Instant attack, fixed release — what a driver does, and what an RMS does not. */
const shape = (values, release) => {
  const out = [];
  for (let f = 0; f < values.length; f++)
    out.push(Math.max(values[f], f === 0 ? 0 : out[f - 1] * release));
  return out;
};

const build = ({ track, fps, frames, name }) => {
  const pcm = decode(track, RATE, `lowpass=f=${CUTOFF}:poles=2,lowpass=f=${CUTOFF}:poles=2`);
  const raw = envelope(pcm, RATE, fps, frames);

  const scale = percentile(raw, 0.99);
  const bass = Array.from(raw, (v) => Math.min(1, v / scale));

  /*
    One decode per band. Slower than one FFT pass over a single decode and far
    less code, and this runs once per track rather than once per render — the
    whole point of the file is that nothing does this at frame time.
  */
  const bands = BAND_HZ.map((hz) => {
    const band = envelope(
      decode(track, BAND_RATE, `bandpass=f=${hz}:width_type=o:w=1`),
      BAND_RATE,
      fps,
      frames,
    );
    const top = percentile(band, 0.99);
    return shape(
      Array.from(band, (v) => Math.min(1, v / top)),
      BAND_RELEASE,
    );
  });

  /* The cone: instant attack, fixed release. Never below what is sounding now. */
  const thump = shape(bass, RELEASE);

  /*
    PUNCH: how far above its own recent past the bass is. The trailing average
    deliberately excludes the current frame — comparing a frame against a window
    that contains it drags the reference up exactly when the transient arrives
    and flattens the very peaks this is for.
  */
  const punch = bass.map((v, f) => {
    let sum = 0;
    let n = 0;
    for (let i = Math.max(0, f - TRAIL); i < f; i++) {
      sum += bass[i];
      n++;
    }
    const rise = n ? v - sum / n : 0;
    /* ×2.6 puts a kick near 1 while a swell stays low; clamped either side. */
    return Math.max(0, Math.min(1, rise * 2.6));
  });

  return `/**
 * ${name}'s bass envelope, one value per frame at ${fps}fps — generated, do not edit.
 *
 * Written by \`scripts/make-track-envelope.mjs\`, which is where the measurement
 * and the reasoning behind it live. Re-run it after changing the track, the
 * duration or the filter; \`--check\` fails if this file has drifted from what
 * the audio says.
 *
 * ${frames} frames, low-passed twice at ${CUTOFF}Hz, RMS over ${WINDOW} frames,
 * normalised against the 99th percentile so a clip is what a loudspeaker does
 * rather than what a spreadsheet does.
 */

/** Frames per second these are indexed by — the composition's own. */
export const ENERGY_FPS = ${fps};

/** Where the cone is: bass with an instant attack and a ${RELEASE} release. 0…1. */
export const THUMP: readonly number[] = [
${format(thump, 3)}
];

/** The strike rather than the displacement — how much *more* bass than a moment ago. */
export const PUNCH: readonly number[] = [
${format(punch, 2)}
];

/** \`THUMP\` at a frame, clamped at both ends rather than \`undefined\` past them. */
export const thumpAt = (frame: number): number =>
  THUMP[Math.max(0, Math.min(THUMP.length - 1, Math.round(frame)))];

/** \`PUNCH\` at a frame, clamped the same way. */
export const punchAt = (frame: number): number =>
  PUNCH[Math.max(0, Math.min(PUNCH.length - 1, Math.round(frame)))];

/** Centre frequency of each band in \`BANDS\`, in Hz. */
export const BAND_HZ: readonly number[] = [${BAND_HZ.join(", ")}];

/**
 * The spectrum, \`BANDS[band][frame]\` — each band normalised against itself.
 *
 * See the generator's header for why that matters: scaled against a common
 * maximum, a ring drawn from these is long bass spokes and a flat stub.
 */
export const BANDS: readonly (readonly number[])[] = [
${bands.map((b) => `  [
${format(b, 2)}
  ],`).join("\n")}
];

/** Every band's value on one frame, clamped at both ends. */
export const bandsAt = (frame: number): readonly number[] => {
  const f = Math.max(0, Math.min(BANDS[0].length - 1, Math.round(frame)));
  return BANDS.map((band) => band[f]);
};
`;
};

let stale = 0;
for (const job of JOBS) {
  const target = join(ROOT, job.out);
  const want = build(job);
  let have = null;
  try {
    have = readFileSync(target, "utf8");
  } catch {
    /* missing — reported below */
  }
  if (have === want) continue;
  if (check) {
    console.error(`${job.out} ${have === null ? "missing" : "stale"}`);
    stale++;
  } else {
    writeFileSync(target, want);
    console.log(`  + ${job.out}`);
  }
}

if (check) {
  if (stale) {
    console.error("run: node scripts/make-track-envelope.mjs");
    process.exit(1);
  }
  console.log("track envelopes up to date");
}
