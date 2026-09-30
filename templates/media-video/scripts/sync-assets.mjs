#!/usr/bin/env node
/**
 * Mirror the repo's asset sources into `video-editor/public/`, which is a
 * generated cache (gitignored) — every binary has exactly one tracked home:
 *
 *   assets/<kind>/…                     →  public/<kind>/…         staticFile("logos/acme/mark.svg")
 *   projects/<id>/input/<media>         →  public/projects/<id>/…  projectFile("<id>")("x.mp4")
 *
 * A project **id is a path**, not a single segment: this repo files videos as
 * `<brand>/<category>/<NNN-name>` (e.g. `acme/marketing/000-example`), so a
 * project is "any directory under projects/ containing a project.json" and its
 * id is its path relative to projects/. That nests straight through into
 * public/projects/<id>/, so `projectFile` needs no special case for depth.
 *
 * Usage:
 *   node scripts/sync-assets.mjs                              # shared assets + every project
 *   node scripts/sync-assets.mjs acme/marketing/000-example  # …and more ids
 *   node scripts/sync-assets.mjs --prune                      # also delete stale files in public/
 *
 * Unchanged files (same size + mtime) are skipped, so re-running is cheap.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { SKIP_DIR, findProjects } from "./projects.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "video-editor", "public");

/** Files that belong in public/ — media and fonts, never docs or metadata. */
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
const wanted = new Set();

const sync = (from, toRel) => {
  const to = join(PUBLIC, toRel);
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
  console.log(`  + ${toRel}`);
};

// 1. the shared asset library, mirrored as-is
const assets = join(ROOT, "assets");
if (existsSync(assets)) {
  console.log("shared assets/");
  for (const f of walk(assets)) sync(f, relative(assets, f));
}

// 2. each project's own input/
const projectsDir = join(ROOT, "projects");
const projects = findProjects(projectsDir).filter(
  (id) => only.length === 0 || only.includes(id),
);

if (only.length && !projects.length) {
  console.error(`No such project(s): ${only.join(", ")}`);
  process.exit(1);
}

for (const id of projects) {
  const input = join(projectsDir, id, "input");
  if (!existsSync(input)) continue;
  console.log(`projects/${id}/input/`);
  for (const f of walk(input)) sync(f, join("projects", id, relative(input, f)));
}

// 3. optional cleanup of files whose source is gone
if (prune && existsSync(PUBLIC)) {
  const stale = walk(PUBLIC)
    .map((f) => relative(PUBLIC, f))
    .filter((rel) => !wanted.has(rel));
  for (const rel of stale) {
    rmSync(join(PUBLIC, rel));
    console.log(`  - ${rel}`);
  }
  if (stale.length) console.log(`pruned ${stale.length}`);
}

console.log(`${copied} copied, ${skipped} up to date → video-editor/public/`);
