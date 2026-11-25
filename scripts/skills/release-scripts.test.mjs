// Node-only: the release scripts' state machines with mocked git/gh runners and a throwaway fixture repo.
// Nothing here tags, pushes or publishes: every runner call is recorded and asserted.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import * as releaseSrc from '../../packages/shared/src/release';
import * as versionSrc from '../../packages/shared/src/version';
import {
  checkCatalog, checkLatestMac, checkReleaseAssets, checkVersionJson, complete, confirmed, evaluatePreconditions, execute, planSteps, render as renderComplete, verifyPublished,
} from './release-complete.mjs';
import { acceptDraft, applyChangelog, branchFor, bumpPackageJson, changedPackages, draftSection, lockstepStub, parseCommits } from './release-lib.mjs';
import { decidePlan, prep, prepPreconditions } from './release-prep.mjs';

const shared = { ...versionSrc, ...releaseSrc };
const ws = [
  { name: 'root', dir: '', version: '0.1.0' },
  { name: '@midnite/studio-shared', dir: 'packages/shared', version: '0.1.0' },
  { name: '@midnite/app-launcher', dir: 'apps/launcher', version: '0.1.0' },
];
const rec = (subject, body = '') => ({ sha: subject.slice(0, 6).padEnd(6, 'x'), subject, body });

describe('release-lib pure helpers', () => {
  it('maps changed files to packages by longest prefix, unmatched to root', () => {
    expect(changedPackages(['packages/shared/src/a.ts', 'README.md', 'apps/launcher/x'], ws).sort()).toEqual(['@midnite/app-launcher', '@midnite/studio-shared', 'root']);
  });
  it('bumps only the version field and keeps formatting', () => {
    const t = '{\n  "name": "x",\n  "version": "0.1.0",\n  "dependencies": {"version": "9"}\n}\n';
    expect(bumpPackageJson(t, '0.2.0')).toBe('{\n  "name": "x",\n  "version": "0.2.0",\n  "dependencies": {"version": "9"}\n}\n');
    expect(() => bumpPackageJson('{}', '1.0.0')).toThrow(/no "version"/);
    expect(branchFor('0.2.0')).toBe('release/v0.2.0');
  });
  it('drafts by Keep-a-Changelog section and omits non-user-facing types', () => {
    const commits = parseCommits([rec('feat(ui): add x'), rec('fix: bug'), rec('refactor(core): tidy'), rec('revert: y'), rec('docs: z'), rec('feat!: big')], shared);
    const d = draftSection(commits);
    expect(d).toMatch(/### ⚠ Breaking[\s\S]*BREAKING.*big/);
    expect(d).toContain('### Added\n- **ui**: add x');
    expect(d).toContain('### Fixed\n- bug');
    expect(d).toContain('### Changed\n- **core**: tidy');
    expect(d).toContain('### Removed');
    expect(d).not.toContain('docs');
  });
  it('only accepts model drafts that are Keep-a-Changelog shaped', () => {
    expect(acceptDraft('### Added\n- a')).toBe('### Added\n- a');
    expect(acceptDraft('```markdown\n### Fixed\n- b\n```')).toBe('### Fixed\n- b');
    expect(acceptDraft('Here are your notes:\n### Added\n- a')).toBeNull();
    expect(acceptDraft('## [1.0.0]\n### Added\n- a')).toBeNull();
    expect(acceptDraft('### Weird\n- a')).toBeNull();
    expect(acceptDraft('')).toBeNull();
  });
  const md = '# Changelog\n\n## [Unreleased]\n\n### Added\n- curated line\n\n## [0.1.0] - 2026-01-01\n\n- old\n\n[Unreleased]: https://github.com/o/r/compare/v0.1.0...HEAD\n[0.1.0]: https://github.com/o/r/releases/tag/v0.1.0\n';
  it('moves Unreleased into a dated section, re-seeds the stub and refreshes link refs', () => {
    const out = applyChangelog(md, { version: '0.2.0', date: '2026-11-17', draft: 'IGNORED', repoUrl: 'https://github.com/o/r' });
    expect(out).toMatch(/## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-17\n\n### Added\n- curated line/);
    expect(out).toContain('[Unreleased]: https://github.com/o/r/compare/v0.2.0...HEAD');
    expect(out).toContain('[0.2.0]: https://github.com/o/r/releases/tag/v0.2.0');
    expect(out).toContain('## [0.1.0] - 2026-01-01');
    expect(shared.extractChangelogSection(out, '0.2.0')).toContain('curated line');
  });
  it('falls back to the draft when Unreleased is empty, and throws with no heading', () => {
    const empty = md.replace('### Added\n- curated line\n', '');
    expect(applyChangelog(empty, { version: '0.2.0', date: 'd', draft: lockstepStub('Midnite Apps') })).toContain('Released in lockstep with the suite; no changes specific to Midnite Apps.');
    expect(() => applyChangelog('# x', { version: '1', date: 'd', draft: '' })).toThrow(/Unreleased/);
  });
});

describe('release-prep state machine', () => {
  it('blocks on a dirty tree, notes first release / non-main', () => {
    expect(prepPreconditions({ dirty: true, branch: 'main', hasTags: true }).ok).toBe(false);
    const r = prepPreconditions({ dirty: false, branch: 'feat', hasTags: false });
    expect(r.ok).toBe(true);
    expect(r.notes).toHaveLength(2);
  });
  const common = { shared, current: { root: '0.1.0', a: '0.1.0' }, previous: { root: '0.1.0', a: '0.1.0' }, files: ['x'], ws };
  const c = (...subs) => parseCommits(subs.map((s) => rec(s)), shared);
  it('feat => lockstep minor, fix-only => patch, docs-only => none', () => {
    expect(decidePlan({ ...common, commits: c('feat: x', 'fix: y') })).toMatchObject({ level: 'minor', next: { root: '0.2.0', a: '0.2.0' } });
    expect(decidePlan({ ...common, commits: c('fix: y'), files: ['packages/shared/a.ts'] }).level).toBe('patch');
    expect(decidePlan({ ...common, commits: c('docs: y') }).level).toBe('none');
  });
  it('a breaking change is major', () => {
    expect(decidePlan({ ...common, commits: c('feat!: x') }).next.root).toBe('1.0.0');
  });
  it('an explicit level wins and says what auto-detect would have picked; patch bumps every package', () => {
    const p = decidePlan({ ...common, commits: c('feat: x'), override: 'patch' });
    expect(p).toMatchObject({ level: 'patch', auto: 'minor', overridden: true, next: { root: '0.1.1', a: '0.1.1' } });
  });
  it('a first release bumps nothing and tags the tree version', () => {
    const p = decidePlan({ ...common, previous: null, commits: c('feat: x') });
    expect(p).toMatchObject({ firstRelease: true, level: 'none', tags: ['v0.1.0'] });
  });
  it('reports uncategorised subjects', () => {
    expect(decidePlan({ ...common, commits: c('whatever happened', 'fix: y') }).uncategorised).toEqual(['whatever happened']);
  });
  it('ephemeral changes nothing', () => {
    expect(decidePlan({ ...common, commits: c('feat: x'), override: 'ephemeral' })).toMatchObject({ ephemeral: true, tags: [] });
  });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'rel-'));
  const pkg = (dir, name, version = '0.1.0') => {
    mkdirSync(path.join(root, dir), { recursive: true });
    writeFileSync(path.join(root, dir, 'package.json'), `{\n  "name": "${name}",\n  "version": "${version}"\n}\n`);
  };
  pkg('', 'root');
  pkg('packages/shared', '@midnite/studio-shared');
  pkg('packages/desktop', '@midnite/studio-desktop');
  pkg('apps/launcher', '@midnite/app-launcher');
  writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n\n- first\n\n[Unreleased]: https://github.com/bilo-io/midnite-studio/compare/v0.1.0...HEAD\n');
  mkdirSync(path.join(root, 'apps/launcher'), { recursive: true });
  writeFileSync(path.join(root, 'apps/launcher/CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
  return root;
}
const LOG = (...subjects) => subjects.map((s, i) => `${String(i).padStart(40, 'a')}\x00A\x00a@b\x002026-11-01T00:00:00Z\x00${s}\x00\x00\x01`).join('');

describe('release-prep --apply (mock git)', () => {
  it('creates the branch, bumps, writes changelogs, commits — and never tags or pushes', async () => {
    const root = fixture();
    const calls = [];
    const run = async (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-parse') return 'main\n';
      if (args[0] === 'describe') return 'v0.1.0\n';
      if (args[0] === 'log') return LOG('feat(ui): shiny', 'fix: bug');
      if (args[0] === 'diff') return 'packages/shared/a.ts\x00';
      if (args[0] === 'show' && /package\.json$/.test(args[1])) return '{"version":"0.1.0"}';
      if (args[0] === 'show') return 'packages/shared/a.ts\x00';
      return '';
    };
    const r = await prep({ root, shared, run, apply: true, noLlm: true, fetch: false, now: new Date('2026-11-17T10:00:00Z') });
    expect(r).toMatchObject({ ok: true, applied: true, version: '0.2.0', branch: 'release/v0.2.0' });
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('0.2.0');
    expect(JSON.parse(readFileSync(path.join(root, 'apps/launcher/package.json'), 'utf8')).version).toBe('0.2.0');
    const cl = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(cl).toContain('## [0.2.0] - 2026-11-17');
    expect(cl).toContain('### Added\n- **ui**: shiny');
    expect(readFileSync(path.join(root, 'apps/launcher/CHANGELOG.md'), 'utf8')).toContain('## [0.2.0] - 2026-11-17');
    expect(calls).toContain('switch -c release/v0.2.0');
    expect(calls).toContain('commit -m chore(release): prepare v0.2.0');
    expect(calls.some((c) => /^(tag|push|merge)\b/.test(c))).toBe(false);
  });
  it('plan mode (no --apply) writes nothing and creates no branch', async () => {
    const root = fixture();
    const calls = [];
    const run = async (args) => {
      calls.push(args[0]);
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-parse') return 'main';
      if (args[0] === 'describe') return 'v0.1.0';
      if (args[0] === 'log') return LOG('feat: x');
      if (args[0] === 'show' && /package\.json$/.test(args[1])) return '{"version":"0.1.0"}';
      return '';
    };
    const r = await prep({ root, shared, run, noLlm: true, fetch: false });
    expect(r).toMatchObject({ ok: true, applied: false, version: '0.2.0' });
    expect(calls).not.toContain('switch');
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('0.1.0');
  });
  it('stops at a dirty tree and when there is nothing to release', async () => {
    const root = fixture();
    const dirty = await prep({ root, shared, run: async (a) => (a[0] === 'status' ? ' M x' : 'main'), fetch: false });
    expect(dirty).toMatchObject({ ok: false, stage: 'preconditions' });
    const none = await prep({ root, shared, noLlm: true, fetch: false, run: async (a) => (a[0] === 'status' ? '' : a[0] === 'rev-parse' ? 'main' : a[0] === 'describe' ? 'v0.1.0' : a[0] === 'log' ? LOG('docs: x') : a[0] === 'show' ? '{"version":"0.1.0"}' : '') });
    expect(none).toMatchObject({ ok: false, stage: 'nothing-to-release' });
  });
  it('uses a model draft only when valid, falling back deterministically otherwise', async () => {
    const root = fixture();
    const run = async (a) => (a[0] === 'status' ? '' : a[0] === 'rev-parse' ? 'main' : a[0] === 'describe' ? 'v0.1.0' : a[0] === 'log' ? LOG('feat: x') : a[0] === 'show' ? '{"version":"0.1.0"}' : '');
    const good = await prep({ root, shared, run, fetch: false, llm: async () => ({ source: 'ollama', text: '### Added\n- curated by model' }) });
    expect(good.draft).toBe('### Added\n- curated by model');
    const bad = await prep({ root, shared, run, fetch: false, llm: async () => ({ source: 'ollama', text: 'sure! here you go' }) });
    expect(bad.draft).toContain('### Added\n- x');
  });
});

const goodState = { mode: 'standard', branch: 'release/v0.2.0', version: '0.2.0', dirty: false, lockstep: true, changelogSection: '### Added', changelogDated: true, secret: true, dryRun: true, sectionWarnings: [], gate: true, tagExists: false };

describe('release-complete state machine', () => {
  it('passes when every precondition holds', () => {
    expect(evaluatePreconditions(goodState).ok).toBe(true);
  });
  it.each([
    ['branch', { branch: 'main' }],
    ['clean-tree', { dirty: true }],
    ['lockstep', { lockstep: false }],
    ['tag-free', { tagExists: true }],
    ['changelog', { changelogDated: false }],
    ['changelog', { changelogSection: null }],
    ['secret', { secret: false }],
    ['dry-run', { dryRun: false }],
    ['gate', { gate: false }],
  ])('blocks on %s', (id, patch) => {
    const r = evaluatePreconditions({ ...goodState, ...patch });
    expect(r.ok).toBe(false);
    expect(r.blocked.map((b) => b.id)).toContain(id);
  });
  it('app-section warnings warn but never block', () => {
    const r = evaluatePreconditions({ ...goodState, sectionWarnings: ['::warning::x'] });
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.id === 'app-sections')).toMatchObject({ ok: false, severity: 'warn' });
  });
  it('ephemeral skips the changelog checks and needs no release branch', () => {
    const r = evaluatePreconditions({ ...goodState, mode: 'ephemeral', branch: 'main', changelogSection: null, changelogDated: false });
    expect(r.ok).toBe(true);
    expect(r.checks.some((c) => c.id === 'changelog')).toBe(false);
  });
  it('orders tags scoped-first, plain last, and pushes the plain tag alone', () => {
    const steps = planSteps({ mode: 'standard', version: '0.1.6', tags: ['v0.1.6', 'pkg-a@0.1.6', 'pkg-b@0.1.6'] });
    expect(steps.map((s) => s.id)).toEqual(['tag:pkg-a@0.1.6', 'tag:pkg-b@0.1.6', 'tag:v0.1.6', 'push:pkg-a@0.1.6', 'push:pkg-b@0.1.6', 'push:v0.1.6']);
    expect(steps.at(-1).args).toEqual(['push', 'origin', 'v0.1.6']);
    expect(planSteps({ mode: 'ephemeral', version: '0.1.0', tags: ['v0.1.0'] })[0].args[4]).toMatch(/ephemeral/);
  });
  it('only an exact --confirm vX.Y.Z executes', () => {
    expect(confirmed(['--confirm', 'v0.2.0'], '0.2.0')).toBe(true);
    expect(confirmed(['--confirm', 'v0.2.1'], '0.2.0')).toBe(false);
    expect(confirmed(['--confirm'], '0.2.0')).toBe(false);
    expect(confirmed([], '0.2.0')).toBe(false);
  });
  it('stops at the first failing step and reports what landed', async () => {
    const run = vi.fn(async (args) => {
      if (args[0] === 'push') throw Object.assign(new Error('x'), { stderr: 'rejected' });
    });
    const steps = planSteps({ mode: 'standard', version: '0.2.0', tags: ['v0.2.0'] });
    const r = await execute(steps, { run, cwd: '.' });
    expect(r).toMatchObject({ ok: false, landed: ['tag:v0.2.0'], failed: 'push:v0.2.0', remaining: [], error: 'rejected' });
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('complete() with mocked git + gh (never really tags)', () => {
  const setup = (over = {}) => {
    const root = fixture();
    for (const [f, v] of [['package.json', '0.2.0'], ['packages/shared/package.json', '0.2.0'], ['packages/desktop/package.json', '0.2.0'], ['apps/launcher/package.json', '0.2.0']]) {
      const p = path.join(root, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace('0.1.0', v));
    }
    writeFileSync(path.join(root, 'CHANGELOG.md'), '# C\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-17\n\n### Added\n- x\n');
    writeFileSync(path.join(root, 'apps/launcher/CHANGELOG.md'), '# C\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-17\n\n### Changed\n- y\n');
    const calls = [];
    const run = async (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'release/v0.2.0';
      if (args[0] === 'rev-parse') return 'HEAD1';
      if (args[0] === 'status') return '';
      if (args[0] === 'tag') return '';
      if (args[0] === 'describe') return 'v0.1.0';
      if (args[0] === 'show') return '{"version":"0.1.0"}';
      return '';
    };
    const ghApi = {
      ghJson: async (a) => (a[0] === 'secret' ? { ok: true, data: [{ name: 'RELEASES_REPO_TOKEN' }] } : { ok: true, data: [{ headSha: 'HEAD1', conclusion: 'success' }] }),
      ...over,
    };
    return { root, calls, run, ghApi };
  };
  it('without --confirm it plans and runs no tag or push', async () => {
    const { root, calls, run, ghApi } = setup();
    const r = await complete({ root, argv: ['--gate-confirmed'], run, ghApi, shared });
    expect(r).toMatchObject({ ok: true, executed: false, tags: ['v0.2.0'] });
    expect(calls.some((c) => /^(tag -a|push)/.test(c))).toBe(false);
    expect(renderComplete(r)).toContain('nothing changed');
  });
  it('with --confirm and every check green it tags then pushes (mock runner)', async () => {
    const { root, calls, run, ghApi } = setup();
    const r = await complete({ root, argv: ['--gate-confirmed', '--confirm', 'v0.2.0'], run, ghApi, shared });
    expect(r).toMatchObject({ ok: true, executed: true });
    expect(calls.filter((c) => /^(tag -a|push)/.test(c))).toEqual(['tag -a v0.2.0 -m v0.2.0', 'push origin v0.2.0']);
  });
  it('a failing precondition blocks even with a correct --confirm', async () => {
    const { root, calls, run } = setup();
    const ghApi = { ghJson: async (a) => (a[0] === 'secret' ? { ok: true, data: [] } : { ok: true, data: [] }) };
    const r = await complete({ root, argv: ['--gate-confirmed', '--confirm', 'v0.2.0'], run, ghApi, shared });
    expect(r).toMatchObject({ ok: false, executed: false });
    expect(r.blocked.map((b) => b.id)).toEqual(expect.arrayContaining(['secret', 'dry-run']));
    expect(calls.some((c) => /^(tag -a|push)/.test(c))).toBe(false);
  });
  it('refuses off a release branch', async () => {
    const { root, run, ghApi } = setup();
    const r = await complete({ root, argv: [], run: async (a, o) => (a[0] === 'rev-parse' && a[1] === '--abbrev-ref' ? 'main' : run(a, o)), ghApi, shared });
    expect(r.ok).toBe(false);
    expect(r.blocked[0].message).toMatch(/release-prep/);
  });
});

describe('post-publish verification', () => {
  it('checks assets, version.json, latest-mac.yml and catalog.json', () => {
    const good = ['a.dmg', 'a.zip', 'a.dmg.blockmap', 'SHA256SUMS'].map((name) => ({ name }));
    expect(checkReleaseAssets(good, '1.0.0').ok).toBe(true);
    expect(checkReleaseAssets([...good, { name: 'builder-debug.yml' }], '1').message).toMatch(/builder-debug/);
    expect(checkReleaseAssets([], '1').ok).toBe(false);
    expect(checkVersionJson('{"version":"1.0.0","sha256":"x"}', '1.0.0').ok).toBe(true);
    expect(checkVersionJson('{"version":"0.9.0"}', '1.0.0').ok).toBe(false);
    expect(checkVersionJson('nope', '1').ok).toBe(false);
    expect(checkLatestMac('version: 1.0.0\npath: a.zip', '1.0.0').ok).toBe(true);
    expect(checkLatestMac("version: '0.9.0'", '1.0.0').ok).toBe(false);
    expect(checkCatalog('{"runtimeVersion":"1.0.0","apps":[{"id":"a","version":"1.0.0"}]}', '1.0.0').ok).toBe(true);
    expect(checkCatalog('{"runtimeVersion":"1.0.0","apps":[{"id":"a","version":"0.9.0"}]}', '1.0.0').message).toMatch(/a/);
  });
  it('reports unavailable targets without throwing', async () => {
    const ghApi = { ghJson: async () => ({ ok: false, kind: 'not-found', message: '' }) };
    const r = await verifyPublished('1.0.0', { ghApi, fetchRaw: async () => null });
    expect(r.ok).toBe(false);
    expect(r.checks).toHaveLength(4);
  });
  it('passes when everything is in place', async () => {
    const ghApi = { ghJson: async () => ({ ok: true, data: { assets: ['a.dmg', 'a.zip', 'a.blockmap', 'SHA256SUMS'].map((name) => ({ name })) } }) };
    const files = { 'midnite-studio/version.json': '{"version":"1.0.0"}', 'midnite-studio/feed/latest-mac.yml': 'version: 1.0.0', 'catalog.json': '{"runtimeVersion":"1.0.0","apps":[]}' };
    expect((await verifyPublished('1.0.0', { ghApi, fetchRaw: async (p) => files[p] })).ok).toBe(true);
  });
});
