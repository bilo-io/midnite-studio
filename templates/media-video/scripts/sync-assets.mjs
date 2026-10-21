#!/usr/bin/env node
/**
 * Mirror the repo's asset sources into the editor app, which treats them as a
 * generated cache (gitignored) — every binary has exactly one tracked home.
 * Where the mirror lands depends on the engine in `video.config.json`
 * (absent = Remotion):
 *
 *   Remotion — one mirror, video-editor/public/
 *     assets/<kind>/…                →  public/<kind>/…             staticFile("logos/acme/mark.svg")
 *     projects/<id>/input/<media>    →  public/projects/<id>/…      projectFile("<id>")("x.mp4")
 *
 *   HyperFrames — one mirror per project, hyperframes-editor/projects/<id>/assets/
 *     assets/<kind>/…                →  <project>/assets/<kind>/…   <img src="assets/logos/acme/mark.svg">
 *     projects/<id>/input/<media>    →  <project>/assets/input/…    <video src="assets/input/x.mp4">
 *
 * A project **id is a path**, not a single segment: this repo files videos as
 * `<brand>/<category>/<NNN-name>` (e.g. `acme/marketing/000-example`), so a
 * project is "any directory under projects/ containing a project.json" and its
 * id is its path relative to projects/. That nests straight through into the
 * mirror, so `projectFile` needs no special case for depth.
 *
 * Usage:
 *   node scripts/sync-assets.mjs                              # shared assets + every project
 *   node scripts/sync-assets.mjs acme/marketing/000-example  # …and more ids
 *   node scripts/sync-assets.mjs --prune                      # also delete stale files in the mirror
 *
 * Unchanged files (same size + mtime) are skipped, so re-running is cheap.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { APP_DIR, readEngine } from "./engine.mjs";
import { SKIP_DIR, findProjects } from "./projects.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = readEngine(ROOT);
const APP = join(ROOT, APP_DIR[ENGINE]);

/** Files that belong in a mirror — media and fonts, never docs or metadata. */
const MEDIA = /\.(mp4|mov|webm|m4v|mp3|wav|m4a|aac|png|jpg|jpeg|webp|avif|gif|svg|woff2?|ttf|otf|json|vtt|srt)$/i;

const args = process.argv.slice(2);
const prune = args.includes("--prune");
const only = args.filter((a) => !a.startsWith("--")).map((a) => a.replaceAll("/", sep));

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".")) return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIR.test(e.name) ? [] : walk(p);
    return MEDIA.test(e.name) ? [p] : [];
  });

let copied = 0;
let skipped = 0;

/** One mirror: files copied into `dir`, tracked so `--prune` knows what is stale. */
const makeMirror = (dir) => {
  const wanted = new Set();
  const sync = (from, toRel) => {
    const to = join(dir, toRel);
    wanted.add(toRel);
    const src = statSync(from);
    if (existsSync(to)) {
      const dst = statSync(to);
      if (dst.size === src.size && Math.abs(dst.mtimeMs - src.mtimeMs) < 1000) {
        skipped++;
        return;
      }
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { preserveTimestamps: true });
    copied++;
    console.log(`  + ${relative(APP, to)}`);
  };
  const pruneStale = () => {
    if (!prune || !existsSync(dir)) return;
    const stale = walk(dir)
      .map((f) => relative(dir, f))
      .filter((rel) => !wanted.has(rel));
    for (const rel of stale) {
      rmSync(join(dir, rel));
      console.log(`  - ${rel}`);
    }
    if (stale.length) console.log(`pruned ${stale.length}`);
  };
  return { sync, pruneStale };
};

const assets = join(ROOT, "assets");
const projectsDir = join(ROOT, "projects");
const projects = findProjects(projectsDir).filter((id) => only.length === 0 || only.includes(id));

if (only.length && !projects.length) {
  console.error(`No such project(s): ${only.join(", ")}`);
  process.exit(1);
}

const syncShared = (mirror) => {
  if (!existsSync(assets)) return;
  console.log("shared assets/");
  for (const f of walk(assets)) mirror.sync(f, relative(assets, f));
};

const syncInput = (mirror, id, prefix) => {
  const input = join(projectsDir, id, "input");
  if (!existsSync(input)) return;
  console.log(`projects/${id}/input/`);
  for (const f of walk(input)) mirror.sync(f, join(prefix, relative(input, f)));
};

if (ENGINE === "hyperframes") {
  // A HyperFrames project is a folder, so each one gets its own mirror — and
  // only projects that already have a composition folder (index.html).
  let mirrored = 0;
  for (const id of projects) {
    const projectApp = join(APP, "projects", id);
    if (!existsSync(join(projectApp, "index.html"))) continue;
    const mirror = makeMirror(join(projectApp, "assets"));
    syncShared(mirror);
    syncInput(mirror, id, "input");
    mirror.pruneStale();
    mirrored++;
  }
  console.log(`${copied} copied, ${skipped} up to date → ${APP_DIR[ENGINE]}/projects/*/assets/ (${mirrored} project(s))`);
} else {
  const mirror = makeMirror(join(APP, "public"));
  syncShared(mirror);
  for (const id of projects) syncInput(mirror, id, join("projects", id));
  mirror.pruneStale();
  console.log(`${copied} copied, ${skipped} up to date → video-editor/public/`);
}
