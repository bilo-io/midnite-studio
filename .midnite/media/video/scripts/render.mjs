#!/usr/bin/env node
/**
 * Render a project's composition into the next iteration under its output/.
 *
 *   node scripts/render.mjs acme/marketing/000-pilot              → output/v2.mp4
 *   node scripts/render.mjs acme/marketing/000-pilot client-notes → output/v2-client-notes.mp4
 *   node scripts/render.mjs acme/marketing/000-pilot v2 --still 120
 *                                                                    → output/_stills/v2-f120.png
 *   node scripts/render.mjs templates/acme/promo annotated --comp TemplatePromoAnnotated
 *                                            → templates/acme/promo/output/v1-annotated.mp4
 *
 * A project id is a **path** under projects/ (`<brand>/<category>/<NNN-name>`),
 * not a single segment — see scripts/sync-assets.mjs. With no id at all, and
 * exactly one project in the repo, that one is used.
 *
 * Reads the composition id from `projects/<id>/project.json`, syncs the
 * project's assets first, and appends a stub entry to output/CHANGELOG.md
 * (fill in what changed — the changelog is tracked, the mp4s are not).
 * Extra flags after the label are passed through to the Remotion CLI.
 *
 * Two flags exist for the case where one round produces several cuts to compare —
 * variants of the same edit, not successive versions of it:
 *
 *   --comp <id>      render a composition other than project.json's default
 *   --version vN     pin the version prefix instead of auto-incrementing, so a set
 *                    of variants shares one iteration number
 *
 *   node scripts/render.mjs acme/marketing/000-pilot high --comp Pilot-High --version v3
 *     → output/v3-high.mp4   (and v3-medium.mp4, v3-low.mp4 alongside it)
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findProjects } from "./projects.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR = join(ROOT, "video-editor");
const PROJECTS = join(ROOT, "projects");

const usage = () => {
  console.error(
    "usage: node scripts/render.mjs <project-id> [label] [--still <frame>] [remotion flags…]",
  );
  const all = findProjects(PROJECTS);
  if (all.length) console.error(`known projects:\n  ${all.join("\n  ")}`);
  process.exit(1);
};

const rest = process.argv.slice(2);
/*
  The id is only the first argument when it actually names a project — with one
  project in the repo the id can be left off entirely, and then the first
  argument is the label. Resolving against the real list rather than by position
  is what makes `render.mjs my-label` and `render.mjs <id> my-label` both work.

  A mistyped id has to be caught here rather than fall through to the label,
  which is what a bare "not in the list → it must be a label" test does: with
  one project in the repo `render.mjs acme/marketng/001` rendered the *other*
  project under the label `acme/marketng/001`, and since the label goes
  straight into the output filename, the slashes turned it into a directory.
  An argument shaped like a path is always meant as an id.
*/
const known = findProjects(PROJECTS);
/*
  A template is addressed by its path from the repo root — `templates/<id>` —
  and otherwise renders exactly like a project: its own project.json, its own
  output/. The prefix is what tells the two apart, so a template can never be
  mistaken for a project with the same id.
*/
const TEMPLATES = join(ROOT, "templates");
const templates = findProjects(TEMPLATES).map((t) => `templates/${t}`);
const looksLikeId = rest[0]?.includes("/");
if (rest[0] !== undefined && looksLikeId && !known.includes(rest[0]) && !templates.includes(rest[0])) {
  console.error(`No such project or template: ${rest[0]}`);
  if (templates.length) console.error(`known templates:\n  ${templates.join("\n  ")}`);
  usage();
}
const isTemplate = templates.includes(rest[0]);
const id = isTemplate || known.includes(rest[0]) ? rest.shift() : known.length === 1 ? known[0] : null;
if (!id) usage();

const projectDir = isTemplate ? join(ROOT, id) : join(PROJECTS, id);
const manifestPath = join(projectDir, "project.json");
if (!existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath} — a project needs { "composition": "<id>" }.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const label = rest[0] && !rest[0].startsWith("-") ? rest.shift() : "";
/*
  The label is interpolated straight into the output filename, so anything that
  is not a filename component has to be refused rather than quietly turned into
  a path.
*/
if (label && !/^[\w.-]+$/.test(label)) {
  console.error(`Bad label "${label}" — letters, digits, dot, dash and underscore only.`);
  process.exit(1);
}

const takeFlag = (name) => {
  const i = rest.indexOf(name);
  return i === -1 ? null : rest.splice(i, 2)[1];
};
const composition = takeFlag("--comp") ?? manifest.composition;
const pinnedVersion = takeFlag("--version");
const stillIdx = rest.indexOf("--still");
const stillFrame = stillIdx === -1 ? null : rest.splice(stillIdx, 2)[1];

if (!composition) {
  console.error(`No composition: set "composition" in ${manifestPath}, or pass --comp <id>.`);
  process.exit(1);
}

const outDir = join(projectDir, "output");
mkdirSync(outDir, { recursive: true });

const run = (cmd, args, cwd) => {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

/* A template has no input/ of its own to sync; it draws only on the shared assets. */
run("node", [join(ROOT, "scripts", "sync-assets.mjs"), ...(isTemplate ? [] : [id])], ROOT);

if (stillFrame !== null) {
  const stills = join(outDir, "_stills");
  mkdirSync(stills, { recursive: true });
  const out = join(stills, `${label || "still"}-f${stillFrame}.png`);
  run("npx", ["remotion", "still", composition, out, `--frame=${stillFrame}`, "--log=error", ...rest], EDITOR);
  console.log(`\n→ ${out}`);
  process.exit(0);
}

const next =
  1 +
  readdirSync(outDir)
    .map((f) => /^v(\d+)/.exec(f)?.[1])
    .filter(Boolean)
    .reduce((max, n) => Math.max(max, Number(n)), 0);
const version = `${pinnedVersion ?? `v${next}`}${label ? `-${label}` : ""}`;
const out = join(outDir, `${version}.mp4`);

run("npx", ["remotion", "render", composition, out, ...rest], EDITOR);

const changelog = join(outDir, "CHANGELOG.md");
if (!existsSync(changelog)) {
  appendFileSync(changelog, `# ${manifest.title ?? id} — render history\n`);
}
const date = new Date().toISOString().slice(0, 10);
appendFileSync(changelog, `\n## ${version} — ${date}\n\n- _what changed in this cut_\n`);

console.log(`\n→ ${out}\n→ noted in ${changelog} (fill in what changed)`);
