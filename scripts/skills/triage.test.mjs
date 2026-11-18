// Triage: marks, priority sort, table, footer. Fixture JSON only; no gh, no Ollama.
import { describe, expect, it } from 'vitest';

import { classifyPr, counts, isBot, legend, recommend, renderIssueTable, renderTriage, sortPrs, trunc } from './triage.mjs';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const green = [{ conclusion: 'SUCCESS', status: 'COMPLETED' }];
const red = [{ conclusion: 'FAILURE', status: 'COMPLETED', name: 'x' }];
const pr = (n, o = {}) => ({ number: n, title: `title ${n}`, url: `https://github.com/o/r/pull/${n}`, author: { login: 'bilo-io' }, isDraft: false, createdAt: day(1), mergeable: 'MERGEABLE', reviewDecision: '', statusCheckRollup: green, additions: 10, deletions: 2, ...o });

const PRS = [
  pr(1, { isDraft: true }),
  pr(2, { reviewDecision: 'REVIEW_REQUIRED', createdAt: day(4) }),
  pr(3, { statusCheckRollup: red, reviewDecision: 'REVIEW_REQUIRED' }),
  pr(4, { reviewDecision: 'APPROVED' }),
  pr(5, { reviewDecision: 'CHANGES_REQUESTED', mergeable: 'CONFLICTING' }),
  pr(6, { author: { login: 'dependabot[bot]', is_bot: true }, statusCheckRollup: [], createdAt: day(9), mergeable: 'UNKNOWN' }),
];

describe('marks', () => {
  it('classifies checks, review, merge, kind and age', () => {
    expect(classifyPr(PRS[3], NOW)).toMatchObject({ checks: '✅', review: '👍', merge: '🟢', kind: '👤', age: '🕐 1d', rank: 0 });
    expect(classifyPr(PRS[2], NOW)).toMatchObject({ checks: '❌', rank: 1 });
    expect(classifyPr(PRS[4], NOW)).toMatchObject({ review: '🔴', merge: '⚔️', rank: 2 });
    expect(classifyPr(PRS[5], NOW)).toMatchObject({ checks: '⚪', merge: '❔', kind: '🤖', bot: true, age: '🕗 9d' });
    expect(classifyPr(PRS[0], NOW)).toMatchObject({ kind: '📝', rank: 4 });
    expect(classifyPr(pr(7, { statusCheckRollup: [{ status: 'IN_PROGRESS' }] }), NOW).checks).toBe('🟡');
  });
  it('bot detection', () => {
    expect(isBot({ login: 'renovate' })).toBe(true);
    expect(isBot({ login: 'x[bot]' })).toBe(true);
    expect(isBot({ login: 'bilo-io' })).toBe(false);
  });
});

describe('sort', () => {
  it('ready to land → failing → changes requested → awaiting review → drafts', () => {
    expect(sortPrs(PRS, NOW).map((c) => c.pr.number)).toEqual([4, 3, 5, 6, 2, 1]);
  });
});

describe('render', () => {
  it('table + footer, no LLM', async () => {
    const out = await renderTriage({ prs: PRS, now: NOW, noLlm: true });
    const lines = out.split('\n');
    expect(lines[0]).toBe('| PR | Title | Kind | Checks | Review | Merge | Age | Δ |');
    expect(lines[1]).toBe('| --- | --- | :-: | :-: | :-: | :-: | :-: | --- |');
    expect(lines[2]).toBe('| [#4](https://github.com/o/r/pull/4) | title 4 | 👤 | ✅ | 👍 | 🟢 | 🕐 1d | +10/−2 |');
    expect(out).toContain('6 open · 1 ready to land · 1 failing · 3 awaiting review · 1 bot');
    expect(lines.at(-1)).toBe('Land #4 first: checks are green and it is approved.');
    expect(lines.at(-2)).toContain('🕐 <2d · 🕒 2–7d · 🕗 >7d');
  });
  it('uses Ollama for the recommendation when up, truncated to one sentence', async () => {
    const fetch = async (u) => (String(u).endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'qwen3.5:9b' }] }) } : { ok: true, json: async () => ({ response: 'Merge #4 now. Then look at #3.' }) });
    const out = await renderTriage({ prs: PRS, now: NOW, fetch });
    expect(out.split('\n').at(-1)).toBe('Merge #4 now.');
  });
  it('empty sections and issues table', async () => {
    expect(await renderTriage({ prs: [], now: NOW, noLlm: true })).toBe('No open PRs.');
    const issues = [{ number: 8, title: 'x'.repeat(60), url: 'https://github.com/o/r/issues/8', createdAt: day(10), labels: [{ name: 'bug' }], assignees: [{ login: 'bilo-io' }] }];
    expect(renderIssueTable(issues, NOW)).toContain('| [#8](https://github.com/o/r/issues/8) | ' + 'x'.repeat(47) + '… | bug | @bilo-io | 🕗 10d |');
    const all = await renderTriage({ prs: [], issues, scope: 'all', now: NOW, noLlm: true });
    expect(all).toContain('### Issues');
    expect(await renderTriage({ scope: 'issues', now: NOW })).toBe('No open issues.');
  });
  it('helpers', () => {
    expect(trunc('a'.repeat(60))).toHaveLength(48);
    expect(recommend([])).toMatch(/Nothing open/);
    const rows = sortPrs(PRS, NOW);
    expect(counts(rows)).toContain('6 open');
    expect(legend(rows)).toContain('✅ green');
  });
});
