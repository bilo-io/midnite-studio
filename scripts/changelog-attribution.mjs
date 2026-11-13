#!/usr/bin/env node
// changelog-attribution: which commits touched which app? (Phase 131 Theme B)
//
// Release-prep drafts one changelog section per app. Which app a changed file belongs to is
// answered by the moon `app-<id>` / `app-all` tags every project already carries (the same
// convention affected-apps.mjs reads): the longest project directory that prefixes the file wins.
//
// Usage: node scripts/changelog-attribution.mjs --base <ref> [--head HEAD]   (prints JSON)
//
// Self-contained (node builtins, no @midnite/*), like affected-apps.mjs. The two literal lists
// below are pinned to packages/shared by changelog-attribution.test.mjs.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `CHANGELOG_APP_IDS` in packages/shared/src/release.ts. */
export const CHANGELOG_APP_IDS = [
  'studio',
  'launcher',
  'agents',
  'browser',
  'gamer',
  'health',
  'media',
  'mind',
  'money',
  'science',
  'startup',
  'vanguard',
];

/** `RETIRED_SUITE_APP_HOSTS` in packages/shared/src/suite-apps.ts. */
export const RETIRED_SUITE_APP_HOSTS = {
  coder: 'agents',
  creator: 'agents',
  vault: 'vanguard',
  cleaner: 'vanguard',
  monitor: 'vanguard',
  capture: 'mind',
};

/** `tags:` list of one moon.yml, parsed line by line: `- 'x'` / `- x` items until the next un-indented key. */
export function parseTags(yml) {
  const tags = [];
  let inTags = false;
  for (const line of yml.split('\n')) {
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    if (!inTags) continue;
    const item = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*(#.*)?$/.exec(line);
    if (item) tags.push(item[1]);
    else if (/^\S/.test(line)) inTags = false;
  }
  return tags;
}

function walk(dir, out, root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (existsSync(path.join(full, 'moon.yml'))) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      out.set(rel, parseTags(readFileSync(path.join(full, 'moon.yml'), 'utf8')).filter((t) => t.startsWith('app-')));
    }
    walk(full, out, root);
  }
}

/** Every moon.yml under `apps/*` and `packages/**`: directory (repo-relative) -> its `app-*` tags. */
export function readProjectTags(root = repoRoot) {
  const out = new Map();
  for (const top of ['apps', 'packages']) {
    if (existsSync(path.join(root, top))) walk(path.join(root, top), out, root);
  }
  return out;
}

/** Apps one file belongs to: the longest project dir prefix wins. `'*'` = every app. */
export function appsForFile(file, projects) {
  let best = null;
  for (const dir of projects.keys()) {
    if ((file === dir || file.startsWith(`${dir}/`)) && (best === null || dir.length > best.length)) best = dir;
  }
  const result = new Set();
  if (best === null) return result;
  if (best === 'apps/launcher') result.add('launcher');
  for (const tag of projects.get(best)) {
    if (tag === 'app-all') {
      result.add('*');
      continue;
    }
    const raw = tag.slice('app-'.length);
    const id = Object.hasOwn(RETIRED_SUITE_APP_HOSTS, raw) ? RETIRED_SUITE_APP_HOSTS[raw] : raw;
    if (CHANGELOG_APP_IDS.includes(id)) result.add(id);
  }
  return result;
}

/**
 * @param {{ sha: string, subject: string, files: string[] }[]} commits
 * @returns {Record<string, { sha: string, subject: string, suite: boolean }[]>}
 */
export function attribute(commits, projects) {
  const out = Object.fromEntries(CHANGELOG_APP_IDS.map((id) => [id, []]));
  for (const commit of commits) {
    const hits = new Map(); // id -> suite flag (direct hit wins over a suite-wide one)
    for (const file of commit.files) {
      for (const hit of appsForFile(file, projects)) {
        if (hit === '*') {
          for (const id of CHANGELOG_APP_IDS) if (!hits.has(id)) hits.set(id, true);
        } else hits.set(hit, false);
      }
    }
    if (hits.size === 0) continue;
    if (!hits.has('studio')) hits.set('studio', false);
    for (const [id, suite] of hits) out[id].push({ sha: commit.sha, subject: commit.subject, suite });
  }
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Commits in `base..head`, oldest first, files NUL-split. */
export function readCommits(base, head = 'HEAD') {
  const shas = git(['rev-list', '--no-merges', '--reverse', `${base}..${head}`]).split('\n').filter(Boolean);
  return shas.map((sha) => ({
    sha,
    subject: git(['show', '-s', '--format=%s', sha]).trim(),
    files: git(['show', '-z', '--name-only', '--format=', sha]).split('\0').filter(Boolean),
  }));
}

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = flag(process.argv, '--base', null);
  if (!base) {
    console.error('usage: node scripts/changelog-attribution.mjs --base <ref> [--head HEAD]');
    process.exit(1);
  }
  const commits = readCommits(base, flag(process.argv, '--head', 'HEAD'));
  console.log(JSON.stringify(attribute(commits, readProjectTags()), null, 2));
}
