import { describe, expect, it, vi } from 'vitest';

import { classify, group, harvest, isBot, llmRefine, MAX_REPOS, noveltyEvidence, parseArgs, parseModelJson, parseScope, prefixOf, prepare, renderMarkdown } from './retro.mjs';
import { retroWindow } from './sast.mjs';

const pr = (n, title, extra = {}) => ({ number: n, title, url: `https://x/${n}`, mergedAt: `2026-11-0${n}T10:00:00Z`, author: { login: 'bilo-io' }, labels: [], additions: 5, deletions: 1, body: '', files: [], ...extra });

describe('scope, bots, prefixes', () => {
  it('parses scopes and requires one', () => {
    expect(parseScope('acme, acme/api')).toEqual({ owners: ['acme'], repos: ['acme/api'] });
    expect(() => parseScope('')).toThrow(/scope required/);
    expect(() => parseScope('a b/c/d')).toThrow(/bad scope/);
  });
  it('spots bot authors', () => {
    expect(isBot({ login: 'dependabot[bot]' })).toBe(true);
    expect(isBot({ login: 'app/renovate' })).toBe(true);
    expect(isBot({ login: 'bilo-io' })).toBe(false);
  });
  it('tags conventional prefixes', () => {
    expect(prefixOf('feat(billing)!: x')).toEqual({ type: 'feat', scope: 'billing', breaking: true });
    expect(prefixOf('whatever')).toEqual({ type: null, scope: null, breaking: false });
  });
  it('classifies by prefix and label', () => {
    expect(classify(pr(1, 'fix: a'))).toBe('fixes');
    expect(classify(pr(1, 'chore(deps): a'))).toBe('maintenance');
    expect(classify(pr(1, 'feat: a'))).toBe('features');
    expect(classify(pr(1, 'x', { labels: [{ name: 'bug' }] }))).toBe('fixes');
  });
});

describe('novelty needs evidence', () => {
  it('finds measured, exploratory and new-package evidence, else null', () => {
    expect(noveltyEvidence(pr(1, 'perf: x', { body: 'Cuts it from 400 ms -> 15 ms' }))).toMatch(/measured/);
    expect(noveltyEvidence(pr(1, 'feat: x', { body: 'a spike' }))).toBe('explicitly exploratory');
    expect(noveltyEvidence(pr(1, 'feat: y', { files: [{ path: 'packages/new/package.json' }] }))).toMatch(/new package/);
    expect(noveltyEvidence(pr(1, 'feat: big but ordinary', { body: 'adds a page' }))).toBeNull();
  });
});

describe('prepare + group', () => {
  it('counts bots, filters authors and tags', () => {
    const { prs, bots } = prepare([pr(1, 'feat(a): x'), pr(2, 'bump', { author: { login: 'dependabot[bot]' } }), pr(3, 'fix: y', { author: { login: 'other' } })], 'o/r', { authors: ['bilo-io'] });
    expect(bots).toBe(1);
    expect(prs.map((p) => p.number)).toEqual([1]);
    expect(prs[0]).toMatchObject({ scope: 'a', category: 'features', repo: 'o/r' });
  });
  it('groups by phase then scope, >= 2 only', () => {
    const { prs } = prepare([pr(1, 'feat(a): x (phase 9)'), pr(2, 'fix(a): y (phase 9)'), pr(3, 'feat(b): z'), pr(4, 'feat(b): w'), pr(5, 'chore: solo')], 'o/r');
    const { groups, standalone } = group(prs);
    expect(groups.map((g) => g.name)).toEqual(['Phase 9', 'b']);
    expect(standalone.map((p) => p.number)).toEqual([5]);
  });
});

describe('harvest (mock gh)', () => {
  const win = retroWindow('1m', new Date('2026-11-17T10:00:00Z'));
  it('lists active non-fork repos, harvests PRs and releases, notes failures', async () => {
    const ghJson = vi.fn(async (args) => {
      if (args[0] === 'repo') return { ok: true, data: [{ nameWithOwner: 'o/a', pushedAt: '2026-11-10', isFork: false }, { nameWithOwner: 'o/old', pushedAt: '2026-01-01', isFork: false }, { nameWithOwner: 'o/fork', pushedAt: '2026-11-10', isFork: true }] };
      if (args[0] === 'pr') return { ok: true, data: [pr(1, 'feat: x'), pr(2, 'bump', { author: { login: 'renovate[bot]' } })] };
      return { ok: true, data: [{ tagName: 'v1', publishedAt: '2026-11-12' }, { tagName: 'v0', publishedAt: '2025-01-01' }] };
    });
    const notes = [];
    const h = await harvest({ owners: ['o'], repos: [] }, win, { ghApi: { ghJson }, notes });
    expect(h.repos).toEqual(['o/a']);
    expect(h.prs).toHaveLength(1);
    expect(h.bots[0]).toMatch(/1 dependency/);
    expect(h.releases.map((r) => r.tagName)).toEqual(['v1']);
    expect(ghJson.mock.calls.every(([a]) => ['repo', 'pr', 'release', 'search'].includes(a[0]) && !a.includes('--add'))).toBe(true);
  });
  it('keeps the busiest MAX_REPOS when more are active', async () => {
    const many = Array.from({ length: MAX_REPOS + 3 }, (_, i) => ({ nameWithOwner: `o/r${i}`, pushedAt: '2026-11-10', isFork: false }));
    const ghJson = async (args) => {
      if (args[0] === 'repo') return { ok: true, data: many };
      if (args[0] === 'search') return { ok: true, data: [{ repository: { nameWithOwner: 'o/r27' } }] };
      return { ok: true, data: [] };
    };
    const notes = [];
    const h = await harvest({ owners: ['o'], repos: [] }, win, { ghApi: { ghJson }, notes });
    expect(h.repos).toHaveLength(MAX_REPOS);
    expect(h.repos[0]).toBe('o/r27');
    expect(notes[0]).toMatch(/3 least-active/);
  });
  it('reports an auth failure as a note instead of throwing', async () => {
    const notes = [];
    const h = await harvest({ owners: ['o'], repos: ['o/x'] }, win, { ghApi: { ghJson: async () => ({ ok: false, kind: 'auth', message: '' }) }, notes });
    expect(h.prs).toEqual([]);
    expect(notes[0]).toMatch(/auth/);
  });
});

describe('llmRefine', () => {
  const { prs } = prepare([pr(1, 'feat: a'), pr(2, 'feat: b')], 'o/r');
  it('parses fenced JSON', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('nope')).toBeNull();
  });
  it('falls back with no daemon', async () => {
    const fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await llmRefine(prs, [], { fetch, noLlm: false })).toMatchObject({ source: 'fallback', reason: 'unreachable' });
  });
  it('is skipped under --no-llm without touching fetch', async () => {
    const fetch = vi.fn();
    expect(await llmRefine(prs, [], { noLlm: true, fetch })).toMatchObject({ source: 'fallback' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('applies model novelty only where heuristics found none', async () => {
    const reply = JSON.stringify({ novel: [{ i: 0, evidence: 'first WASM use' }], themes: [] });
    const fetch = vi.fn(async (url) => (String(url).endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'qwen3.5:9b' }] }) } : { ok: true, json: async () => ({ response: reply }) }));
    const p = prepare([pr(1, 'feat: a')], 'o/r').prs;
    const r = await llmRefine(p, [], { fetch, noLlm: false });
    expect(r.source).toBe('ollama');
    expect(p[0].novelty).toBe('first WASM use');
  });
});

describe('render', () => {
  it('lists only focused categories and links PRs', () => {
    const { prs } = prepare([pr(1, 'feat(a): x'), pr(2, 'feat(a): y'), pr(3, 'fix: z')], 'o/r');
    const { groups, standalone } = group(prs);
    const md = renderMarkdown({ scopeLabel: 'o/r', win: { start: 's', end: 'e' }, focus: ['features'], prs, groups, standalone, bots: ['o/r: 4 dependency/automation PRs (not listed)'], releases: [], repos: ['o/r'] });
    expect(md).toContain('# 🔭 Retro — o/r · s → e');
    expect(md).toContain('[o/r#1](https://x/1)');
    expect(md).not.toContain('Fixes & reliability');
    expect(md).toContain('4 dependency bumps');
  });
  it('parses CLI args', () => {
    expect(parseArgs(['o/r', '3m', '--focus', 'features,fixes', '--author', 'a', '--no-llm'])).toMatchObject({ scope: 'o/r', span: '3m', focus: ['features', 'fixes'], authors: ['a'], noLlm: true });
  });
});
