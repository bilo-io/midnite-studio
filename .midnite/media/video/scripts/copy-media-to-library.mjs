#!/usr/bin/env node
/**
 * Copy the repo's own media into a folder Media ▸ Library can scan, laid out
 * the way the library classifies it (`packages/features/media-library/main/classify.ts`):
 *
 *   Shows/<project>/Season 1/<project> - S01Enn - <version>.mp4   one show per video project, one episode per version
 *   Music/Midnite Media/<album>/NN - <title>.mp3                  music beds, curated score, night drive, sfx, voice-overs
 *   Photos/<album>/<name>.png                                     generated images, map captures, model references, logos
 *
 * Each video gets a sidecar thumbnail (`<stem>.jpg`) and each show a `tvshow.nfo`
 * and a `poster.jpg` (the latest version). Copies are APFS clones (`cp -c`), so
 * they take no extra space on the same volume. Anything already there is
 * skipped, so a re-run after a new render adds only the new version.
 *
 * Usage (from .midnite/media/video):
 *   node scripts/copy-media-to-library.mjs [library] [--dry]
 *   library defaults to ~/Movies/Midnite Sample Library; add it once in Media ▸ Library ▸ Add folder.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LIB = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(homedir(), "Movies", "Midnite Sample Library");
const dry = process.argv.includes("--dry");
const M = join(REPO, ".midnite/media");
const V = join(M, "video");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mk = (d) => dry || mkdirSync(d, { recursive: true });
const clone = (from, to) => {
  if (existsSync(to)) return;
  mk(dirname(to));
  if (dry) return console.log("cp", from, "→", to.slice(LIB.length));
  execFileSync("cp", ["-c", from, to]);
};
const ls = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((n) => re.test(n)).sort(natural) : []);
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const write = (file, text) => dry || existsSync(file) || writeFileSync(file, text);
const still = (video, out, at = 0.4) => {
  if (dry || existsSync(out)) return;
  const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).toString());
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String((d || 1) * at), "-i", video, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", out]);
};
const KNOWN_ARTISTS = /^(soulprodmusic|ebunny|joelfazhari|paulyudin|alex_kizenkov|alexzavesa|audiopapkin|audiorezout|bryansantosbreton|diamond_tunes|dragon-studio|fronbondi_skegs|gregorquendel|idoberg|ivan_luzan|kamhunt|lordsonny|moodmode|primalhousemusic|rescopicsound|soundreality|submority|trading_nation|viralaudio)-/;
const pretty = (stem) => {
  let artist = null;
  let s = stem.replace(/-\d{5,}$/, "");
  const m = KNOWN_ARTISTS.exec(s);
  if (m) { artist = m[1]; s = s.slice(m[0].length); }
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return artist ? `${s} (${artist})` : s;
};

// ── Videos: one show per project, one episode per version ────────────────
const SHOWS = [
  ["Midnite Apps Promo", join(V, "projects/midnite-apps/output"), "Versions of the Midnite Apps promo: the whole suite, launcher to dubstep drop."],
  ["Midnite Apps Recordings", join(V, "projects/midnite-apps/input/clips"), "The real-app recordings the Midnite Apps promo is cut from."],
  ["Midnite Video 1 — Automated Workflow", join(V, "projects/youtube-tutorials/midnite-video-1-automated-workflow/output"), "Every version of midnite video 1, the automated-workflow rap."],
  ["Midnite Pilot", join(V, "projects/midnite/marketing/000-pilot/output"), "The first midnite marketing pilot, version by version."],
  ["Midnite Go-live Promo", join(V, "projects/midnite/marketing/001-golive-promo/output"), "The go-live promo, from first cut to v10."],
  ["Go-live Promo Template", join(V, "templates/midnite/golive-promo/output"), "The reusable go-live promo template's renders."],
  ["Midnite App Recordings", join(V, "assets/video/app"), "Screen recordings of Midnite Studio, light and dark."],
  ["Stock Footage", join(V, "assets/video/stock"), "Stock coding footage used under the promos."],
  ["Midnite Website", join(REPO, "packages/website/public/video"), "The videos on the midnite website."],
];
const VIDEO = /\.(mp4|mov|webm|mkv)$/i;
let n = 0;
for (const [show, dir, plot] of SHOWS) {
  const files = ls(dir, VIDEO);
  if (!files.length) continue;
  const root = join(LIB, "Shows", show);
  const season = join(root, "Season 1");
  mk(season);
  write(join(root, "tvshow.nfo"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<tvshow>\n  <title>${esc(show)}</title>\n  <plot>${esc(plot)}</plot>\n</tvshow>\n`);
  files.forEach((f, i) => {
    const stem = `${show} - S01E${String(i + 1).padStart(2, "0")} - ${basename(f, extname(f))}`;
    const to = join(season, stem + extname(f).toLowerCase());
    clone(join(dir, f), to);
    still(to, join(season, `${stem}.jpg`));
    n++;
  });
  // The show's poster: the latest version, or the first file for a folder of recordings.
  if (!dry) still(join(season, readdirSync(season).filter((x) => VIDEO.test(x)).sort(natural).at(dir.includes("/output") ? -1 : 0)), join(root, "poster.jpg"));
  console.log("show", show, files.length);
}

// ── Music: Midnite Media / <album> / NN - Title ──────────────────────────
const ALBUMS = [
  ["Music Beds", [join(V, "assets/audio/music")]],
  ["Curated Score", [join(V, "assets/audio/curated/music")]],
  ["Night Drive", [join(M, "audio/night-drive")]],
  ["Sound Effects", [join(V, "assets/audio/sfx")]],
];
const AUDIO = /\.(mp3|wav|m4a|flac|ogg)$/i;
for (const [album, dirs] of ALBUMS) {
  const files = dirs.flatMap((d) => ls(d, AUDIO).map((f) => join(d, f)));
  files.forEach((f, i) => {
    const t = pretty(basename(f, extname(f))).replace(/\//g, "-");
    clone(f, join(LIB, "Music", "Midnite Media", album, `${String(i + 1).padStart(2, "0")} - ${t}${extname(f).toLowerCase()}`));
  });
  console.log("album", album, files.length);
}
// The voice-overs and arranged beds behind each video project.
const STEMS = [
  ["Midnite Apps Promo", join(V, "projects/midnite-apps/input")],
  ["Midnite Video 1", join(V, "projects/youtube-tutorials/midnite-video-1-automated-workflow/input")],
  ["Midnite Pilot", join(V, "projects/midnite/marketing/000-pilot/input")],
];
let k = 0;
const stemFiles = STEMS.flatMap(([p, d]) => ls(d, AUDIO).map((f) => [p, join(d, f)]));
for (const [p, f] of stemFiles) {
  k++;
  clone(f, join(LIB, "Music", "Midnite Media", "Voice-overs & Beds", `${String(k).padStart(2, "0")} - ${p} — ${pretty(basename(f, extname(f)))}${extname(f)}`));
}
console.log("album Voice-overs & Beds", k);

// ── Photos ───────────────────────────────────────────────────────────────
const P = join(LIB, "Photos");
const gen = ls(join(M, "image/generated"), /\.(png|jpe?g|webp)$/i);
gen.forEach((f) => clone(join(M, "image/generated", f), join(P, "Generated Images", f)));
const caps = join(M, "map/maps/captures");
const capDirs = existsSync(caps) ? readdirSync(caps).filter((d) => statSync(join(caps, d)).isDirectory()).sort() : [];
let c = 0;
for (const d of capDirs) {
  const sat = join(caps, d, "satellite.png");
  if (!existsSync(sat)) continue;
  const place = d.replace(/-\d{8}-\d{6}$/, "").replace(/-/g, " ").replace(/\b([a-z])/g, (x) => x.toUpperCase());
  clone(sat, join(P, "Map Captures", `${place} ${d.slice(-15, -7)}.png`));
  c++;
}
const refs = execFileSync("find", [join(M, "model"), "-name", "*.ref.jpg"]).toString().trim().split("\n").filter(Boolean).sort();
refs.forEach((f) => clone(f, join(P, "Model References", basename(f).replace(/\.ref\.jpg$/, ".jpg"))));
ls(join(V, "assets/logos/midnite"), /\.png$/i).forEach((f) => clone(join(V, "assets/logos/midnite", f), join(P, "Logos", f)));
console.log("photos", gen.length, c, refs.length);
console.log("videos", n);
