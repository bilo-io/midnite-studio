#!/usr/bin/env node
/**
 * Where is the sound, actually?
 *
 *   tools/audio-envelope.mjs assets/audio/sfx/x.mp3
 *   tools/audio-envelope.mjs assets/audio/sfx/x.mp3 --fps 30 --window 0.05
 *   tools/audio-envelope.mjs assets/audio/sfx/x.mp3 --onsets
 *
 * Prints an RMS loudness bar per window, labelled with both the timestamp and
 * the frame number, so a cut or an entrance can be placed on a real onset in
 * the music rather than on a guess. `--onsets` prints just the frames where
 * loudness jumps, which is the short answer most of the time.
 *
 * Two things this is for, and both were needed the first time:
 *
 *  - A music bed's usable length is not its file length. A "logo" sting often
 *    carries seconds of trailing silence, so composing to `durationInSeconds`
 *    leaves the video running on nothing.
 *  - A stock whoosh is padded: the file starts with silence and the hit lands
 *    somewhere inside it. `<Audio trimBefore>` has to skip to the onset, or the
 *    swoosh fires late by however much padding the vendor left in.
 *
 * ffmpeg comes from Remotion's bundled copy (`npx remotion ffmpeg`) because
 * decoding to PCM is all this needs and the bundled build can do it. That is
 * **not** because there is no system ffmpeg: there is one, at
 * `/opt/homebrew/bin/ffmpeg`. Check with `which ffmpeg` rather than trusting a
 * note — this one said the opposite for two builds and cost sessions the time.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR = join(ROOT, "video-editor");
const SAMPLE_RATE = 8000; // plenty for an envelope, and keeps the decode instant

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("-"));
if (!src) {
  console.error("usage: tools/audio-envelope.mjs <audio-file> [--fps 30] [--window 0.1] [--onsets]");
  process.exit(1);
}
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const fps = flag("--fps", 30);
const windowSec = flag("--window", 0.1);
const onsetsOnly = args.includes("--onsets");

const tmp = mkdtempSync(join(tmpdir(), "envelope-"));
const wav = join(tmp, "a.wav");
try {
  const dec = spawnSync(
    "npx",
    ["remotion", "ffmpeg", "-y", "-i", resolve(src), "-ac", "1", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le", wav],
    { cwd: EDITOR, encoding: "utf8" },
  );
  if (dec.status !== 0) {
    console.error(dec.stderr?.trim() || "ffmpeg failed");
    process.exit(1);
  }

  const buf = readFileSync(wav);
  /*
    Walk the RIFF chunks rather than assuming a 44-byte header: ffmpeg writes a
    LIST/INFO chunk before `data`, so the fixed-offset shortcut reads encoder
    metadata as audio and every bar comes out wrong.
  */
  let off = 12;
  while (buf.toString("ascii", off, off + 4) !== "data") off += 8 + buf.readUInt32LE(off + 4);
  const start = off + 8;
  const samples = buf.readUInt32LE(off + 4) / 2;

  const win = Math.round(SAMPLE_RATE * windowSec);
  const rms = [];
  for (let i = 0; i < samples; i += win) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < Math.min(i + win, samples); j++) {
      const v = buf.readInt16LE(start + j * 2) / 32768;
      sum += v * v;
      n++;
    }
    rms.push(Math.sqrt(sum / n));
  }

  const peak = Math.max(...rms);
  const at = (i) => ({ sec: i * windowSec, frame: Math.round(i * windowSec * fps) });

  if (onsetsOnly) {
    /*
      An onset is a window that is both loud in absolute terms and much louder
      than the one before it. The ratio alone fires on every rise out of near
      silence, which in a reverb tail is most of them.
    */
    console.log(`onsets in ${src} (fps ${fps}):`);
    for (let i = 1; i < rms.length; i++) {
      if (rms[i] > peak * 0.35 && rms[i] > rms[i - 1] * 1.6) {
        const { sec, frame } = at(i);
        console.log(`  ${sec.toFixed(2).padStart(6)}s  frame ${String(frame).padStart(4)}`);
      }
    }
    const last = rms.findLastIndex((v) => v > peak * 0.02);
    const { sec, frame } = at(last + 1);
    console.log(`  ── audible content ends ${sec.toFixed(2)}s (frame ${frame})`);
  } else {
    rms.forEach((v, i) => {
      const { sec, frame } = at(i);
      console.log(
        `${sec.toFixed(2).padStart(6)}s f${String(frame).padStart(4)} ${"#".repeat(Math.round((v / peak) * 50))}`,
      );
    });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
