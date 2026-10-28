#!/usr/bin/env node
// affected-apps: which apps does a change touch? (Phase 113 Theme C)
//
// Every app in the suite is a composition of packages — the runtime, the
// frame, its features, shared — so "which apps need a rebuild" is "which
// packages did this change affect, and which apps compose them". moon already
// answers the first half (`moon query projects --affected --downstream deep`:
// the projects whose files changed, plus everything that depends on them); the
// second half lives in each project's moon.yml as `app-<id>` tags:
//
//   app-<id>   this project is composed into app <id> (a placement-map app id,
//              or `studio` for the Studio superset)
//   app-all    every app composes it (shared, runtime, frame)
//
// A project with no `app-*` tag (git-engine, knowledge, db-engine, the
// website, the launcher) names no app itself; it reaches an app only through a
// downstream dependent that does — which `--downstream deep` already includes.
//
// Usage:
//   node scripts/affected-apps.mjs [--base origin/main] [--head HEAD] [--json]
//   moon query projects --affected --downstream deep --json | node scripts/affected-apps.mjs --stdin
//
// moon changed the touched-files query between majors: CI pins 1.x through
// `pnpm exec moon` (`query touched-files --json`), the local toolchain is 2.x
// (`query changed-files`). The script asks moon for its version and builds the
// matching pipeline, so it is right under both.
//
// Self-contained — no @midnite/* imports — so it runs before any build, like
// version-check.mjs and gate-projects-check.mjs. The app list is a literal
// below; affected-apps.test.mjs pins it to shared's PLACEMENT_APP_IDS.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The placement map's apps (`PLACEMENT_APP_IDS` in shared/src/domain/placement.ts), in launcher order. */
export const PLACEMENT_APPS = [
  'cleaner',
  'monitor',
  'vault',
  'capture',
  'browser',
  'mind',
  'agents',
  'coder',
  'money',
  'creator',
  'media',
  'gamer',
  'vanguard',
];

/** Studio, the internal superset that composes every feature (Decision 5). */
export const STUDIO = 'studio';

/** Every app id an `app-*` tag may name, in output order. */
export const ALL_APPS = [...PLACEMENT_APPS, STUDIO];

const APP_TAG = 'app-';
const ALL_TAG = 'app-all';

/**
 * Map affected projects to the apps that compose them. Pure.
 *
 * @param {{ id: string, tags?: string[] | null }[]} projects
 * @returns {{ apps: string[], unknownTags: { project: string, tag: string }[] }}
 *   `apps` in ALL_APPS order; `unknownTags` lists any `app-<x>` whose `<x>` is not an app (a typo).
 */
export function appsForProjects(projects) {
  const hit = new Set();
  const unknownTags = [];
  for (const project of projects) {
    for (const tag of project.tags ?? []) {
      if (!tag.startsWith(APP_TAG)) continue;
      if (tag === ALL_TAG) {
        for (const app of ALL_APPS) hit.add(app);
        continue;
      }
      const app = tag.slice(APP_TAG.length);
      if (ALL_APPS.includes(app)) hit.add(app);
      else unknownTags.push({ project: project.id, tag });
    }
  }
  return { apps: ALL_APPS.filter((app) => hit.has(app)), unknownTags };
}

/**
 * Read `{ projects: [{ id, config: { tags } }] }` (moon 1 and 2 share this
 * shape for `query projects --json`) into `{ id, tags }`.
 *
 * @param {string} json
 */
export function parseMoonProjects(json) {
  const parsed = JSON.parse(json);
  return (parsed.projects ?? []).map((p) => ({ id: p.id, tags: p.config?.tags ?? p.tags ?? [] }));
}

/** `moon 1.41.7` -> 1. */
export function moonMajor(versionOutput) {
  const match = /(\d+)\.\d+\.\d+/.exec(versionOutput);
  if (!match) throw new Error(`could not read a moon version from: ${versionOutput.trim()}`);
  return Number(match[1]);
}

/** The changed-files query for a moon major, `[...args]` after `moon`. */
export function changedFilesArgs(major, base, head) {
  const query = major >= 2 ? ['query', 'changed-files'] : ['query', 'touched-files', '--json'];
  return [...query, '--base', base, '--head', head];
}

function moon(args, input) {
  return execFileSync('pnpm', ['exec', 'moon', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

async function main(argv) {
  let projectsJson;
  if (argv.includes('--stdin')) {
    projectsJson = await readStdin();
  } else {
    const base = flag(argv, '--base', 'origin/main');
    const head = flag(argv, '--head', 'HEAD');
    const major = moonMajor(moon(['--version']));
    const changed = moon(changedFilesArgs(major, base, head));
    projectsJson = moon(['query', 'projects', '--affected', '--downstream', 'deep', '--json'], changed);
  }

  const projects = parseMoonProjects(projectsJson);
  const { apps, unknownTags } = appsForProjects(projects);
  for (const { project, tag } of unknownTags) {
    console.error(`affected-apps: ${project} is tagged '${tag}', which names no app (expected one of: ${ALL_APPS.join(', ')}, or app-all).`);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ apps, projects: projects.map((p) => p.id) }, null, 2));
  } else {
    for (const app of apps) console.log(app);
  }
  if (unknownTags.length > 0) process.exitCode = 1;
}

// Run only when invoked directly, so tests can import the pure helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`affected-apps errored: ${err.message}`);
    process.exit(1);
  });
}
