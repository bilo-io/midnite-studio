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
 * Extra flags after the label are passed through to the engine's CLI.
 *
 * **Engine dispatch.** `video.config.json` names the engine (absent = Remotion):
 *
 *   remotion     `npx remotion render <composition> <out>`   in video-editor/
 *   hyperframes  `npx hyperframes render projects/<id> -o <out>`   in hyperframes-editor/
 *
 * Both write the same `output/vN[-label].<ext>` and the same CHANGELOG stub, so
 * everything downstream (the Studio explorer, transcode, compare) is engine-blind.
 * HyperFrames takes `--format=mp4|webm|mov|gif` (the extension follows it), `--crf=N`,
 * and `--comp <file>` (a composition file inside the project, default index.html);
 * its `--still <seconds>` writes a snapshot PNG under output/_stills/.
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

import { APP_DIR, readEngine } from "./engine.mjs";
import { findProjects } from "./projects.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = readEngine(ROOT);
const EDITOR = join(ROOT, APP_DIR[ENGINE]);
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
/* Templates are a Remotion-workspace concept; HyperFrames projects are folders under hyperframes-editor/projects/. */
const templates = ENGINE === "remotion" ? findProjects(TEMPLATES).map((t) => `templates/${t}`) : [];
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
const compFlag = takeFlag("--comp");
const composition = compFlag ?? manifest.composition;
const pinnedVersion = takeFlag("--version");
const stillIdx = rest.indexOf("--still");
const stillFrame = stillIdx === -1 ? null : rest.splice(stillIdx, 2)[1];

if (ENGINE === "remotion" && !composition) {
  console.error(`No composition: set "composition" in ${manifestPath}, or pass --comp <id>.`);
  process.exit(1);
}

const outDir = join(projectDir, "output");
mkdirSync(outDir, { recursive: true });

const run = (cmd, args, cwd) => {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  // HyperFrames reports anonymous usage unless told not to; Midnite Studio never opts a user in.
  const env = ENGINE === "hyperframes" ? { ...process.env, DO_NOT_TRACK: "1" } : process.env;
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

/* A template has no input/ of its own to sync; it draws only on the shared assets. */
run("node", [join(ROOT, "scripts", "sync-assets.mjs"), ...(isTemplate ? [] : [id])], ROOT);

/* HyperFrames: a project is a folder — `projects/<id>/index.html` under the editor app. */
const hfProject = ENGINE === "hyperframes" ? join("projects", id) : null;
if (hfProject && !existsSync(join(EDITOR, hfProject, "index.html"))) {
  console.error(
    `No HyperFrames composition at ${APP_DIR.hyperframes}/${hfProject.replaceAll("\\", "/")}/index.html — ` +
      "create it (see /video-execute-editorial-script) or start Studio once from Midnite Studio, which writes a stub.",
  );
  process.exit(1);
}

if (stillFrame !== null && hfProject) {
  const stills = join(outDir, "_stills");
  mkdirSync(stills, { recursive: true });
  run("npx", ["hyperframes", "snapshot", hfProject, "--at", stillFrame, "--no-end", "-o", stills, ...rest], EDITOR);
  console.log(`\n→ ${stills}`);
  process.exit(0);
}

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
/* HyperFrames picks the container from --format; the extension has to agree with it. */
const formatArg = rest.find((a) => a.startsWith("--format="))?.slice("--format=".length) ?? "mp4";
if (hfProject && !["mp4", "webm", "mov", "gif"].includes(formatArg)) {
  console.error(`Unsupported --format=${formatArg} — mp4, webm, mov or gif.`);
  process.exit(1);
}
const out = join(outDir, `${version}.${hfProject ? formatArg : "mp4"}`);

if (hfProject) {
  const comp = compFlag ? ["-c", compFlag] : [];
  run("npx", ["hyperframes", "render", hfProject, "-o", out, ...comp, ...rest], EDITOR);
} else {
  run("npx", ["remotion", "render", composition, out, ...rest], EDITOR);
}

const changelog = join(outDir, "CHANGELOG.md");
if (!existsSync(changelog)) {
  appendFileSync(changelog, `# ${manifest.title ?? id} — render history\n`);
}
const date = new Date().toISOString().slice(0, 10);
appendFileSync(changelog, `\n## ${version} — ${date}\n\n- _what changed in this cut_\n`);

console.log(`\n→ ${out}\n→ noted in ${changelog} (fill in what changed)`);
