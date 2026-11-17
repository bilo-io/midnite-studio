#!/usr/bin/env node
// release-prep: automates `midnite-release-prep` (Phase 151 Theme C) — the reversible half.
//   node scripts/skills/release-prep.mjs [major|minor|patch|ephemeral] [--apply] [--json] [--no-llm] [--no-fetch]
// Default is a read-only PLAN: preconditions, base tag, commits, bump level, next versions, tags, per-app changelog
// attribution and a drafted changelog. `--apply` additionally creates `release/vX.Y.Z`, bumps package.json versions,
// writes the changelogs, runs version-check and commits `chore(release): prepare vX.Y.Z`.
// It NEVER tags, pushes, or touches main — those live in release-complete.mjs behind --confirm.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sastDate } from './sast.mjs';
import { attribute, readProjectTags } from '../changelog-attribution.mjs';
import { checkLockstep } from '../version-check.mjs';
import { defaultRun, logRange } from './lib/git.mjs';
import { isNoLlm, run as ollama } from './lib/ollama.mjs';
import {
  acceptDraft, applyChangelog, branchFor, bumpPackageJson, changedPackages, draftSection, loadShared, lockstepStub, parseCommits,
  readText, readWorkspace, repoRoot, versionMap, writeText,
} from './release-lib.mjs';

const LEVELS = ['major', 'minor', 'patch', 'ephemeral'];
const DISPLAY = { launcher: 'Midnite Apps' };
const displayName = (id) => DISPLAY[id] ?? `Midnite ${id[0].toUpperCase()}${id.slice(1)}`;

/** Pure precondition state machine. `state` = {dirty, branch, hasTags}. Returns blocking failures + notes. */
export function prepPreconditions({ dirty, branch, hasTags }) {
  const failures = [];
  const notes = [];
  if (dirty) failures.push('working tree is dirty — commit or stash first');
  if (branch && branch !== 'main') notes.push(`on ${branch}, not main (fine if intentional)`);
  if (!hasTags) notes.push('no v* tag yet: first release — nothing is bumped, the tag is built from the tree');
  return { ok: failures.length === 0, failures, notes };
}

/** Decide the plan from commits + an optional explicit level. Pure given `shared`. */
export function decidePlan({ shared, current, previous, commits, files, ws, override }) {
  const parsed = commits.map((c) => c.parsed).filter(Boolean);
  const auto = previous ? shared.bumpLevelFromCommits(parsed) : 'none';
  const changed = changedPackages(files, ws);
  const uncategorised = commits.filter((c) => !c.parsed).map((c) => c.subject);
  const level = override && override !== 'ephemeral' && previous ? override : auto;
  let plan;
  if (override === 'ephemeral') plan = { firstRelease: false, level: 'none', next: { ...current }, tags: [], ephemeral: true };
  else if (override && previous) {
    const all = override === 'patch' ? Object.keys(current) : changed;
    const next = shared.planVersionBump(current, { level, changedPackages: all });
    plan = { firstRelease: false, level, next, tags: shared.planReleaseTags(previous, next) };
  } else plan = shared.planRelease({ current, previous, commits: parsed, changedPackages: changed });
  return { ...plan, auto, overridden: Boolean(override && previous && override !== auto), uncategorised, changed };
}

/** The lockstep release version: the root package's next version. */
export const releaseVersion = (plan, ws) => plan.next[ws.find((w) => !w.dir).name];

async function gatherGit({ run, cwd, fetch }) {
  const g = async (args) => (await run(args, { cwd })).trim();
  if (fetch) await g(['fetch', 'origin', '--tags', '--quiet']).catch(() => '');
  const dirty = (await g(['status', '--porcelain'])) !== '';
  const branch = await g(['rev-parse', '--abbrev-ref', 'HEAD']);
  let base = null;
  try {
    base = (await g(['describe', '--tags', '--abbrev=0', '--match', 'v*'])) || null;
  } catch {
    base = null;
  }
  return { dirty, branch, base, g };
}

async function previousVersions({ g, base, ws }) {
  const out = {};
  for (const w of ws) {
    try {
      const j = JSON.parse(await g(['show', `${base}:${w.dir ? `${w.dir}/` : ''}package.json`]));
      if (typeof j.version === 'string') out[w.name] = j.version;
    } catch {
      /* package did not exist at the base tag */
    }
  }
  return out;
}

export async function prep({ root = repoRoot, args = [], run = defaultRun, shared, now = new Date(), llm = ollama, noLlm = false, fetch = true, apply = false } = {}) {
  const override = args.find((a) => LEVELS.includes(a));
  const { dirty, branch, base, g } = await gatherGit({ run, cwd: root, fetch });
  const pre = prepPreconditions({ dirty, branch, hasTags: Boolean(base) });
  if (!pre.ok) return { ok: false, stage: 'preconditions', ...pre };
  shared ??= await loadShared(root);
  const ws = readWorkspace(root);
  const current = versionMap(ws);
  const records = base ? await logRange(`${base}..HEAD`, { run, cwd: root }) : [];
  const commits = parseCommits(records.filter((r) => !/^Merge /.test(r.subject)), shared);
  const files = base ? (await g(['diff', '-z', '--name-only', `${base}..HEAD`])).split('\0').filter(Boolean) : [];
  const previous = base ? await previousVersions({ g, base, ws }) : null;
  const plan = decidePlan({ shared, current, previous, commits, files, ws, override });
  const result = { ok: true, ...pre, base, branch, plan, override: override ?? null, commits: commits.length, applied: false };
  if (plan.ephemeral) return { ...result, version: current[ws[0].name], tag: `v${current[ws[0].name]}`, note: 'ephemeral: no branch, no bumps, changelog untouched' };
  if (plan.level === 'none' && !plan.firstRelease) return { ...result, ok: false, stage: 'nothing-to-release', failures: ['level none: only docs/chore/test commits since the last release'] };
  const version = releaseVersion(plan, ws);
  const date = sastDate(now);
  let draft = draftSection(commits);
  if (draft && !noLlm) {
    const r = await llm({
      task: 'draft',
      prompt: `Rewrite these conventional-commit lines as curated Keep-a-Changelog release notes. Merge related lines, drop noise, keep ONLY ### Added/Changed/Fixed/Removed headings and bullets, no preamble.\n\n${draft}`,
      fallback: () => null,
    });
    const accepted = r.source === 'ollama' ? acceptDraft(r.text) : null;
    if (accepted) draft = accepted;
  }
  const attribution = base ? attribute(await commitsWithFiles(records, g), readProjectTags(root)) : null;
  const out = { ...result, version, tags: plan.tags, draft, date, attribution: attribution ? Object.fromEntries(Object.entries(attribution).map(([k, v]) => [k, v.length])) : null };
  if (!apply) return out;
  const branchName = branchFor(version);
  await run(['switch', '-c', branchName], { cwd: root });
  for (const w of ws) {
    const next = plan.next[w.name];
    if (next && next !== w.version) writeText(w.file, bumpPackageJson(readText(w.file), next));
  }
  const rootChangelog = path.join(root, 'CHANGELOG.md');
  writeText(rootChangelog, applyChangelog(readText(rootChangelog), { version, date, draft, prevVersion: base?.slice(1) }));
  for (const id of shared.CHANGELOG_APP_IDS.filter((x) => x !== 'studio')) {
    const file = path.join(root, shared.changelogSourcePath(id));
    const text = readText(file);
    if (text === null) continue;
    const mine = (attribution?.[id] ?? []).map((a) => commits.find((c) => c.sha === a.sha)).filter(Boolean);
    const body = draftSection(mine) || lockstepStub(displayName(id));
    writeText(file, applyChangelog(text, { version, date, draft: body }));
  }
  const lock = checkLockstep(readWorkspace(root).map((w) => ({ name: w.name, version: w.version })));
  if (!lock.ok) return { ...out, ok: false, stage: 'version-check', failures: [lock.message], branch: branchName };
  await run(['add', '-A', '--', '.'], { cwd: root });
  await run(['commit', '-m', `chore(release): prepare v${version}`], { cwd: root });
  return { ...out, applied: true, branch: branchName, next: `run release-complete.mjs on ${branchName} (dry-run workflow first); nothing irreversible has happened` };
}

// changelog-attribution wants `{sha, subject, files}` per commit (oldest first), NUL-split like readCommits().
async function commitsWithFiles(records, g) {
  const out = [];
  for (const r of [...records].reverse()) {
    out.push({ sha: r.sha, subject: r.subject, files: (await g(['show', '-z', '--name-only', '--format=', r.sha])).split('\0').filter(Boolean) });
  }
  return out;
}

export function render(r) {
  if (!r.ok) return [`🔴 release-prep stopped at ${r.stage}`, ...r.failures.map((f) => `- ${f}`), ...(r.notes ?? []).map((n) => `  note: ${n}`)].join('\n');
  const lines = [`# 🚀 Release prep — v${r.version ?? '?'}${r.plan.ephemeral ? ' (ephemeral)' : ''}`, ''];
  lines.push(`- base: ${r.base ?? 'none (first release)'} · ${r.commits} commits`, `- level: ${r.plan.level}${r.plan.overridden ? ` (override; auto-detect said ${r.plan.auto})` : ''}`);
  lines.push(`- tags: ${(r.tags ?? []).join(', ') || '—'}`);
  if (r.plan.uncategorised?.length) lines.push(`- ⚠️ uncategorised: ${r.plan.uncategorised.slice(0, 5).join(' | ')}`);
  for (const n of r.notes ?? []) lines.push(`- note: ${n}`);
  if (r.draft) lines.push('', '## Changelog draft', '', r.draft);
  lines.push('', r.applied ? `✅ committed on ${r.branch} — ${r.next}` : '➡️ plan only; re-run with --apply to create the branch (still nothing irreversible)');
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const r = await prep({ args: argv.filter((a) => !a.startsWith('--')), apply: argv.includes('--apply'), noLlm: isNoLlm(argv, {}), fetch: !argv.includes('--no-fetch') });
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
