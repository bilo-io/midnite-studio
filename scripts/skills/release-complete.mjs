#!/usr/bin/env node
// release-complete: automates `midnite-release-complete` (Phase 151 Theme C) — the IRREVERSIBLE half, guarded.
//   node scripts/skills/release-complete.mjs [ephemeral] [--json]                 check + plan only (default, changes nothing)
//   node scripts/skills/release-complete.mjs [ephemeral] --confirm vX.Y.Z         run the tag/push steps
//   node scripts/skills/release-complete.mjs --verify vX.Y.Z                      post-publish checks (read-only)
// Guards: nothing runs without `--confirm <the exact tag>`; every blocking precondition must pass; the plain vX.Y.Z tag
// is created last and pushed ALONE; a failed step stops the run and reports exactly what landed (never retries).
// Merging the release PR stays a human step (printed, not run) — this script tags and pushes only.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sectionWarnings } from '../changelog-sections-check.mjs';
import { checkLockstep } from '../version-check.mjs';
import { defaultRun } from './lib/git.mjs';
import * as gh from './lib/gh.mjs';
import { APPS_REPO, STUDIO_REPO, isVersion, loadShared, readWorkspace, repoRoot, versionMap } from './release-lib.mjs';

/**
 * Pure precondition state machine. Each check is `{id, ok, severity:'block'|'warn', message}`.
 * state: {mode, branch, version, dirty, lockstep, changelogSection, changelogDated, secret, dryRun, sectionWarnings[], gate,
 *         tagExists}
 */
export function evaluatePreconditions(state) {
  const eph = state.mode === 'ephemeral';
  const checks = [];
  const add = (id, ok, message, severity = 'block') => checks.push({ id, ok, severity, message });
  if (eph) add('branch', Boolean(state.version), `ephemeral release from ${state.branch}`);
  else add('branch', /^release\/v\d+\.\d+\.\d+$/.test(state.branch ?? '') && state.branch === `release/v${state.version}`, `on release/v${state.version ?? 'X.Y.Z'} (got ${state.branch})`);
  add('clean-tree', state.dirty === false, 'working tree clean');
  add('lockstep', state.lockstep === true, 'versions in lockstep and match the branch');
  add('tag-free', state.tagExists === false, `tag v${state.version} does not exist yet`);
  if (!eph) {
    add('changelog', Boolean(state.changelogSection) && state.changelogDated === true, `CHANGELOG has a dated, non-empty ## [${state.version}] section`);
    add('app-sections', (state.sectionWarnings ?? []).length === 0, `${(state.sectionWarnings ?? []).length} app changelog(s) missing a section`, 'warn');
  }
  add('secret', state.secret === true, 'RELEASES_REPO_TOKEN present (gh secret list)');
  add('dry-run', state.dryRun === true, 'release.yml dry run green on this commit');
  add('gate', state.gate === true, '`moon ci` green (pass --gate-confirmed)');
  const blocked = checks.filter((c) => !c.ok && c.severity === 'block');
  return { ok: blocked.length === 0, checks, blocked };
}

/** Ordered tag/push steps. The plain `vX.Y.Z` is created last and pushed on its own (>3 tags in one push fire no event). */
export function planSteps({ mode, version, tags }) {
  const plain = `v${version}`;
  const scoped = tags.filter((t) => t !== plain);
  const all = tags.includes(plain) ? [...scoped, plain] : tags.length ? tags : [plain];
  const steps = [];
  for (const t of all) steps.push({ id: `tag:${t}`, irreversible: true, args: ['tag', '-a', t, '-m', mode === 'ephemeral' && t === plain ? `${t} (ephemeral test release)` : t] });
  for (const t of scoped) steps.push({ id: `push:${t}`, irreversible: true, args: ['push', 'origin', t] });
  if (all.includes(plain)) steps.push({ id: `push:${plain}`, irreversible: true, args: ['push', 'origin', plain] });
  return steps;
}

/** `--confirm` must equal the plain tag exactly; anything else keeps the run a dry plan. */
export const confirmed = (argv, version) => {
  const i = argv.indexOf('--confirm');
  return i >= 0 && argv[i + 1] === `v${version}`;
};

/** Run steps in order; stop at the first failure and report what landed. `run` is the git runner. */
export async function execute(steps, { run, cwd }) {
  const landed = [];
  for (const s of steps) {
    try {
      await run(s.args, { cwd });
      landed.push(s.id);
    } catch (e) {
      return { ok: false, landed, failed: s.id, remaining: steps.slice(landed.length + 1).map((x) => x.id), error: String(e.stderr || e.message).trim() };
    }
  }
  return { ok: true, landed };
}

// ---- post-publish verification (read-only evaluators; the fetchers are injected) ----
export function checkReleaseAssets(assets, version) {
  const names = (assets ?? []).map((a) => a.name);
  const problems = [];
  if (!names.some((n) => /\.dmg$/.test(n))) problems.push('no dmg');
  if (!names.some((n) => /\.zip$/.test(n))) problems.push('no zip');
  if (!names.some((n) => /\.blockmap$/.test(n))) problems.push('no blockmap');
  if (names.includes('builder-debug.yml')) problems.push('builder-debug.yml attached');
  if (!names.includes('SHA256SUMS')) problems.push('no SHA256SUMS');
  return { id: 'release-assets', ok: problems.length === 0, message: problems.join('; ') || `assets for ${version} complete` };
}
export function checkVersionJson(text, version) {
  try {
    const j = JSON.parse(text);
    const ok = j.version === version;
    return { id: 'version.json', ok, message: ok ? `version ${version}${j.sha256 ? ' + sha256' : ' (no sha256 yet)'}` : `reads ${j.version}, expected ${version}` };
  } catch {
    return { id: 'version.json', ok: false, message: 'unreadable' };
  }
}
export function checkLatestMac(text, version) {
  const m = /^version:\s*['"]?([^\s'"]+)/m.exec(text ?? '');
  const ok = m?.[1] === version;
  return { id: 'latest-mac.yml', ok, message: ok ? `version ${version}` : `reads ${m?.[1] ?? 'nothing'}, expected ${version}` };
}
export function checkCatalog(text, version) {
  try {
    const j = JSON.parse(text);
    const apps = j.apps ?? [];
    const bad = apps.filter((a) => a.version !== version).map((a) => a.id ?? a.name);
    const ok = j.runtimeVersion === version && bad.length === 0;
    return { id: 'catalog.json', ok, message: ok ? `runtimeVersion + ${apps.length} apps at ${version}` : `runtimeVersion ${j.runtimeVersion}; off-version apps: ${bad.join(', ') || 'none'}` };
  } catch {
    return { id: 'catalog.json', ok: false, message: 'unreadable' };
  }
}

/** Fetch + check the three propagation targets. `ghApi.ghJson` / `fetchRaw(path)` injectable; never throws. */
export async function verifyPublished(version, { ghApi = gh, fetchRaw } = {}) {
  const raw = fetchRaw ?? (async (p) => {
    // ghJson would JSON.parse latest-mac.yml and fail, so the raw media type goes through the plain runner.
    try {
      return await gh.defaultRun(['api', `repos/${APPS_REPO}/contents/${p}`, '-H', 'Accept: application/vnd.github.raw']);
    } catch {
      return null;
    }
  });
  const out = [];
  const rel = await ghApi.ghJson(['release', 'view', `midnite-studio/v${version}`, '--repo', APPS_REPO, '--json', 'assets,url']);
  out.push(rel.ok ? checkReleaseAssets(rel.data.assets, version) : { id: 'release-assets', ok: false, message: `release not found (${rel.kind})` });
  for (const [file, fn, id] of [['midnite-studio/version.json', checkVersionJson, 'version.json'], ['midnite-studio/feed/latest-mac.yml', checkLatestMac, 'latest-mac.yml'], ['catalog.json', checkCatalog, 'catalog.json']]) {
    const text = await raw(file);
    out.push(text == null ? { id, ok: false, message: `${file} unavailable` } : fn(text, version));
  }
  return { ok: out.every((c) => c.ok), checks: out };
}

// ---- state gathering (IO) ----
export async function gatherState({ root, argv, run, ghApi = gh, shared }) {
  const g = async (args) => (await run(args, { cwd: root })).trim();
  const mode = argv.includes('ephemeral') ? 'ephemeral' : 'standard';
  const branch = await g(['rev-parse', '--abbrev-ref', 'HEAD']);
  const ws = readWorkspace(root);
  const rootVersion = ws.find((w) => !w.dir)?.version ?? null;
  const version = mode === 'ephemeral' ? rootVersion : shared.versionFromReleaseBranch(branch);
  const dirty = (await g(['status', '--porcelain'])) !== '';
  const lock = checkLockstep(ws.map((w) => ({ name: w.name, version: w.version })));
  const exact = version ? ws.filter((w) => w.dir.startsWith('apps/') || w.dir === 'packages/desktop').every((w) => w.version === version) : false;
  let changelogSection = null;
  let changelogDated = false;
  if (mode !== 'ephemeral' && version) {
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    changelogSection = shared.extractChangelogSection(md, version);
    changelogDated = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}`, 'm').test(md);
  }
  const secrets = await ghApi.ghJson(['secret', 'list', '--repo', STUDIO_REPO, '--json', 'name']);
  const head = await g(['rev-parse', 'HEAD']);
  const runs = await ghApi.ghJson(['run', 'list', '--workflow', 'release.yml', '--branch', branch, '--event', 'workflow_dispatch', '--json', 'conclusion,headSha', '--limit', '10']);
  const tags = await g(['tag', '--list', `v${version}`]);
  return {
    mode, branch, version, dirty, lockstep: lock.ok && (mode === 'ephemeral' || exact), changelogSection, changelogDated,
    secret: secrets.ok && secrets.data.some((s) => s.name === 'RELEASES_REPO_TOKEN'),
    dryRun: runs.ok && runs.data.some((r) => r.headSha === head && r.conclusion === 'success'),
    sectionWarnings: mode === 'ephemeral' || !version ? [] : await sectionWarnings(version, { root, shared }),
    gate: argv.includes('--gate-confirmed'),
    tagExists: tags !== '',
    versions: versionMap(ws),
  };
}

export async function complete({ root = repoRoot, argv = [], run = defaultRun, ghApi = gh, shared } = {}) {
  shared ??= await loadShared(root);
  const state = await gatherState({ root, argv, run, ghApi, shared });
  if (!state.version || !isVersion(state.version)) return { ok: false, stage: 'preconditions', state, checks: [], blocked: [{ id: 'branch', message: 'not a release branch: run release-prep first' }] };
  const pre = evaluatePreconditions(state);
  // The tag plan: first release => the tree's own version; ephemeral => plain tag; else planReleaseTags(previous,current) via prev tag.
  const tags = state.mode === 'ephemeral' ? [`v${state.version}`] : await planTags({ root, run, shared, state });
  const steps = planSteps({ mode: state.mode, version: state.version, tags });
  const base = { ok: pre.ok, stage: pre.ok ? 'plan' : 'preconditions', state, ...pre, tags, steps };
  if (!pre.ok || !confirmed(argv, state.version)) return { ...base, executed: false };
  const res = await execute(steps, { run, cwd: root });
  return { ...base, executed: true, result: res, ok: res.ok, next: res.ok ? `tags pushed; merge the release PR by hand, then: release-complete.mjs --verify v${state.version}` : 'a step failed: finish by hand from "landed", do not retry blindly' };
}

async function planTags({ root, run, shared, state }) {
  const ws = readWorkspace(root);
  let last = null;
  try {
    last = (await run(['describe', '--tags', '--abbrev=0', '--match', 'v*'], { cwd: root })).trim() || null;
  } catch {
    last = null;
  }
  let previous = null;
  if (last) {
    previous = {};
    for (const w of ws) {
      try {
        const j = JSON.parse(await run(['show', `${last}:${w.dir ? `${w.dir}/` : ''}package.json`], { cwd: root }));
        if (typeof j.version === 'string') previous[w.name] = j.version;
      } catch {
        /* new since the last tag */
      }
    }
  }
  return shared.planRelease({ current: state.versions, previous, commits: [], changedPackages: [] }).tags;
}

export function render(r) {
  if (r.checks === undefined) return JSON.stringify(r, null, 2);
  const lines = [`# 🚀 Release complete — ${r.state.version ? `v${r.state.version}` : '?'} (${r.state.mode})`, ''];
  for (const c of r.checks) lines.push(`- ${c.ok ? '✅' : c.severity === 'warn' ? '⚠️' : '🔴'} ${c.id}: ${c.message}`);
  if (r.steps) lines.push('', 'Plan:', ...r.steps.map((s) => `- ${s.id}: git ${s.args.join(' ')}`));
  if (r.executed) lines.push('', r.result.ok ? `🚀 landed: ${r.result.landed.join(', ')}` : `🔴 stopped at ${r.result.failed}; landed: ${r.result.landed.join(', ') || 'nothing'}; not run: ${r.result.remaining.join(', ') || '—'}\n${r.result.error}`);
  else lines.push('', r.ok ? `⏸️ nothing changed. To proceed: --confirm v${r.state.version}` : '⛔ blocked: fix the 🔴 items; nothing changed');
  if (r.next) lines.push(`➡️ ${r.next}`);
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const v = argv.indexOf('--verify');
  if (v >= 0) {
    const version = String(argv[v + 1] ?? '').replace(/^v/, '');
    if (!isVersion(version)) throw new Error('--verify needs vX.Y.Z');
    const r = await verifyPublished(version);
    console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : r.checks.map((c) => `${c.ok ? '✅' : '🔴'} ${c.id}: ${c.message}`).join('\n'));
    return r.ok ? 0 : 1;
  }
  const r = await complete({ argv });
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
