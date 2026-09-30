import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  VideoProjectFileSchema,
  failure,
  ok,
  type GitOpResult,
  type VideoProject,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '../fs-scope';

/** `confineToRoot`'s own `realpath` requires the target to exist, so a project
 *  that is not there and one that escapes the root come back the same way —
 *  the same "not there" answer `readProject` gives a project it cannot read. */
const REMOVE_ERROR = 'That project does not exist, or is outside the configured root.';

/**
 * Video projects, **discovered, not registered** (Phase 44 Theme B).
 *
 * `projects-store.ts` persists exactly one thing — the video root. Every
 * project, and every render in it, is read straight off disk on every
 * request: a folder the user creates by hand appears with no import step,
 * and a folder deleted outside the app disappears with no orphaned entry
 * left behind. A store that mirrored this instead would drift the moment
 * either happened, which is exactly the bug this design has no room for.
 *
 * Every path this module touches is jailed under the configured root via
 * `fs-scope.ts`'s existing `confineToRoot`/`joinWithin` — the same primitive
 * the read-only fs surface uses, not a second implementation. A project
 * folder reached through a symlink pointing outside the root, or a
 * `project.json` whose own `source`/`brief`/`script` field points outside
 * ITS folder via `../`, both resolve to `null` and are refused.
 */

const PROJECTS_DIR = 'projects';
const TEMPLATE_ID = '_template';
const PROJECT_FILE = 'project.json';
const OUTPUT_DIR = 'output';

/** `vN-<label>.mp4` — Theme B's own naming convention, read back rather than counted in a store. */
const OUTPUT_FILE_PATTERN = /^v(\d+)-(.+)\.mp4$/;

export type VideoOutputFile = { filename: string; iteration: number; label: string };

/**
 * Every project folder under `<root>/projects/`, in directory order.
 * `_template` is never listed — it is the seed `project-create` copies, not
 * a project of its own. A folder that cannot be read at all (permissions, a
 * dangling symlink) is silently absent, the same "not there" answer a
 * missing file gets — there is nothing else honest to say about it.
 */
export async function discoverProjects(root: string): Promise<VideoProject[]> {
  const projects: VideoProject[] = [];
  await scanProjects(root, '', 0, projects);
  return projects;
}

/** Deep enough for `<brand>/<category>/<NNN-name>` plus headroom; never a runaway walk. */
const MAX_PROJECT_DEPTH = 5;

/**
 * Phase 99 Theme D: a project **id is a path** under `projects/`, exactly as
 * midnite-videos' own `scripts/projects.mjs` defines it — any folder holding a
 * `project.json`, at whatever depth, with recursion stopping at the first
 * `project.json` (a project's `input/`/`output/` are its contents, not more
 * projects). A flat Phase 44 root is the depth-one case of the same walk.
 *
 * A folder with no `project.json` and no project beneath it is still listed,
 * `valid: false` — Phase 44's "never a silently skipped folder" — while one
 * that only groups projects (`<brand>/`, `<category>/`) is not a project.
 * Dot- and underscore-leading folders (`_template`, `_stills`) never are.
 * Returns how many entries it added, so a caller can tell a grouping folder
 * from an empty one.
 */
async function scanProjects(root: string, rel: string, depth: number, out: VideoProject[]): Promise<number> {
  let entries;
  try {
    entries = await readdir(join(root, PROJECTS_DIR, rel), { withFileTypes: true });
  } catch {
    return 0;
  }
  let added = 0;
  for (const entry of entries) {
    // A symlinked directory reports `isDirectory(): false` from `readdir`'s
    // own `lstat`-shaped Dirent — excluding it here would make a project
    // reached through a symlink silently vanish instead of being read and
    // refused for escaping the root by `readProject`'s `confineToRoot`.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name === TEMPLATE_ID || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const id = rel ? `${rel}/${entry.name}` : entry.name;
    if (depth + 1 < MAX_PROJECT_DEPTH && entry.isDirectory() && !existsSync(join(root, PROJECTS_DIR, id, PROJECT_FILE))) {
      const nested = await scanProjects(root, id, depth + 1, out);
      if (nested > 0) {
        added += nested;
        continue;
      }
    }
    out.push(await readProject(root, id));
    added += 1;
  }
  return added;
}

export async function getProject(root: string, id: string): Promise<VideoProject | null> {
  const projects = await discoverProjects(root);
  return projects.find((project) => project.id === id) ?? null;
}

/**
 * One project, by folder name — never throws, and never returns anything
 * other than a `VideoProject`: a folder that fails at any step (escapes the
 * root, has no `project.json`, fails to parse, fails schema validation,
 * names an `id` that does not match its own folder, or names a
 * `source`/`brief`/`script` that escapes its own folder) comes back
 * `valid: false` with the folder name as its only identity and a reason a
 * human can read — never a crash and never a silently skipped folder.
 */
async function readProject(root: string, folderName: string): Promise<VideoProject> {
  // `folderName` is the project id — a `/`-separated path under `projects/`.
  const relJsonPath = join(PROJECTS_DIR, folderName, PROJECT_FILE);

  // The pure, no-filesystem-access half first: a `../`-style escape is a
  // fact about the STRING, true whether or not anything exists yet, and
  // must not be reported as "missing or unreadable" — those are different
  // problems with different fixes.
  if (joinWithin(root, relJsonPath) === null) {
    return { valid: false, id: folderName, error: 'This project folder is outside the configured root.' };
  }

  let raw: string;
  try {
    raw = await readFile(join(root, relJsonPath), 'utf8');
  } catch {
    return { valid: false, id: folderName, error: 'project.json is missing or unreadable.' };
  }

  // Now that something really is there, rule out a symlink smuggling it
  // outside the root — `joinWithin` alone cannot see through one.
  if ((await confineToRoot(root, relJsonPath)) === null) {
    return { valid: false, id: folderName, error: 'This project folder is outside the configured root.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, id: folderName, error: 'project.json is not valid JSON.' };
  }

  const result = VideoProjectFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      valid: false,
      id: folderName,
      error: result.error.issues[0]?.message ?? 'project.json does not match the expected shape.',
    };
  }

  if (result.data.id !== folderName) {
    return {
      valid: false,
      id: folderName,
      error: `project.json's id ("${result.data.id}") does not match its folder name.`,
    };
  }

  for (const [field, rel] of [
    ['source', result.data.source],
    ['brief', result.data.brief],
    ['script', result.data.script],
  ] as const) {
    /*
      `joinWithin`, not `confineToRoot` — these three name files a fresh
      project may not have written yet (a brief not drafted, a source clip
      not dropped in), and `confineToRoot`'s `realpath` throws on anything
      that doesn't exist, which would mark an ordinary in-progress project
      invalid for a reason that has nothing to do with containment. The
      `../` escape the doc's own containment rule cares about is a pure
      string-resolution fact `joinWithin` already catches with no filesystem
      access at all.
    */
    const confined = joinWithin(root, join(PROJECTS_DIR, folderName, rel));
    if (confined === null) {
      return { valid: false, id: folderName, error: `"${field}" ("${rel}") resolves outside the configured root.` };
    }
  }

  return { valid: true, ...result.data };
}

/**
 * Copies `<root>/projects/_template/` — the mechanism `ekko-videos` already
 * documents ("copy this to start the next one") — then patches the new
 * copy's `id`/`title` so the folder name and the file agree from the start,
 * the same invariant `readProject` checks on every read.
 */
export async function createProject(root: string, id: string, title: string): Promise<GitOpResult<VideoProject>> {
  const targetDir = joinWithin(root, join(PROJECTS_DIR, id));
  if (targetDir === null || id === TEMPLATE_ID) {
    return failure('That project id is not valid.');
  }
  if (existsSync(targetDir)) {
    return failure('A project with that id already exists.');
  }

  const templateDir = joinWithin(root, join(PROJECTS_DIR, TEMPLATE_ID));
  if (templateDir === null || !existsSync(templateDir)) {
    return failure(`No template found at ${join(PROJECTS_DIR, TEMPLATE_ID)}.`);
  }

  await cp(templateDir, targetDir, { recursive: true });

  const projectJsonPath = join(targetDir, PROJECT_FILE);
  const templateFile = VideoProjectFileSchema.parse(JSON.parse(await readFile(projectJsonPath, 'utf8')));
  const updated = { ...templateFile, id, title };
  await writeFile(projectJsonPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

  return ok({ valid: true, ...updated });
}

/** Never the template — that folder is the seed `project-create` copies, not a project. */
export async function removeProject(root: string, id: string): Promise<GitOpResult> {
  if (id === TEMPLATE_ID) return failure(REMOVE_ERROR);
  const dir = await confineToRoot(root, join(PROJECTS_DIR, id));
  if (dir === null) return failure(REMOVE_ERROR);
  await rm(dir, { recursive: true, force: true });
  return ok();
}

/** Caps a runaway read — briefs and scripts are hand-written markdown, never megabytes. */
const READ_FILE_SIZE_CAP = 2_000_000;

/**
 * One text file's content, read-only, for `BRIEF.md`/`EDITORIAL_SCRIPT.md`
 * (Theme F). `relPath` is relative to the project's own folder — the same
 * shape `readProject` already validates `source`/`brief`/`script` against —
 * and this re-checks containment itself rather than trusting a prior read.
 */
export async function readProjectFile(root: string, projectId: string, relPath: string): Promise<string | null> {
  const confined = await confineToRoot(root, join(PROJECTS_DIR, projectId, relPath));
  if (confined === null) return null;
  try {
    const info = await stat(confined);
    if (!info.isFile() || info.size > READ_FILE_SIZE_CAP) return null;
    return await readFile(confined, 'utf8');
  } catch {
    return null;
  }
}

export type VideoFileEntry = { name: string; isDir: boolean; size: number; mtimeMs: number };

/**
 * A shallow, read-only listing of one of the three video-scoped directories
 * (Theme D/G): `assets/` is root-wide (shared across every project);
 * `input/` and `output/` are one project's own — never a recursive tree,
 * matching the shallow depth `ekko-videos` projects actually have.
 */
export type VideoFileArea = 'assets' | 'input' | 'output' | 'notes';

/** Caps the recursive Assets walk (Phase 99 Theme D) — a tree, not an indexer. */
const MAX_AREA_ENTRIES = 5000;
const MAX_AREA_DEPTH = 6;

export async function listAreaFiles(
  root: string,
  area: VideoFileArea,
  projectId: string,
  { recursive = false }: { recursive?: boolean } = {},
): Promise<VideoFileEntry[]> {
  const relDir = area === 'assets' ? 'assets' : join(PROJECTS_DIR, projectId, area);
  const dir = await confineToRoot(root, relDir);
  if (dir === null) return [];

  const entries: VideoFileEntry[] = [];
  const walk = async (sub: string, depth: number): Promise<void> => {
    let names: string[];
    try {
      names = await readdir(sub ? join(dir, sub) : dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (entries.length >= MAX_AREA_ENTRIES) return;
      if (recursive && name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${name}` : name;
      let info;
      try {
        info = await stat(join(dir, rel));
      } catch {
        continue;
      }
      entries.push({ name: rel, isDir: info.isDirectory(), size: info.size, mtimeMs: info.mtimeMs });
      if (recursive && info.isDirectory() && depth + 1 < MAX_AREA_DEPTH) await walk(rel, depth + 1);
    }
  };
  await walk('', 0);
  return entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
}

/**
 * Resolves one already-listed file's absolute path, re-confined against the
 * root (Theme E) — for a hand-off to Electron's `shell` module
 * (reveal-in-Finder / play-in-default-app), which needs a real filesystem
 * path, not a directory listing. Shares `listAreaFiles`'s own confinement
 * exactly rather than trusting the `name` a prior listing already returned.
 */
export async function resolveAreaFilePath(
  root: string,
  area: VideoFileArea,
  projectId: string,
  name: string,
): Promise<string | null> {
  const relDir = area === 'assets' ? 'assets' : join(PROJECTS_DIR, projectId, area);
  const dir = await confineToRoot(root, relDir);
  if (dir === null) return null;
  return confineToRoot(dir, name);
}

/**
 * Renders already on disk, read back from `<project>/output/` by filename —
 * never counted in a store that can disagree with what is actually there.
 * A file that does not match `vN-<label>.mp4` is silently not a render this
 * app recognises, sorted oldest iteration first.
 */
export async function listOutputFiles(root: string, projectId: string): Promise<VideoOutputFile[]> {
  const outputDir = await confineToRoot(root, join(PROJECTS_DIR, projectId, OUTPUT_DIR));
  if (outputDir === null) return [];

  let entries: string[];
  try {
    entries = await readdir(outputDir);
  } catch {
    return [];
  }

  const files: VideoOutputFile[] = [];
  for (const name of entries) {
    const match = OUTPUT_FILE_PATTERN.exec(name);
    if (!match) continue;
    files.push({ filename: name, iteration: Number(match[1]), label: match[2]! });
  }
  return files.sort((a, b) => a.iteration - b.iteration);
}
