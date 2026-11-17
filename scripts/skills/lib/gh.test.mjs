import { describe, expect, it } from 'vitest';

import { classifyError, ghJson, issueList, prChecks, prList, prView, runList } from './gh.mjs';

const fail = (stderr) => async () => {
  throw Object.assign(new Error('exit 1'), { stderr });
};

describe('ghJson envelope', () => {
  it('wraps parsed JSON', async () => expect(await ghJson(['x'], { run: async () => '[{"a":1}]' })).toEqual({ ok: true, data: [{ a: 1 }] }));
  it('treats empty output as null', async () => expect((await ghJson(['x'], { run: async () => '\n' })).data).toBeNull());
  it('never throws: auth, rate-limit, not-found, other', async () => {
    expect(await ghJson(['x'], { run: fail('To get started with GitHub CLI, please run: gh auth login') })).toMatchObject({ ok: false, kind: 'auth' });
    expect((await ghJson(['x'], { run: fail('API rate limit exceeded') })).kind).toBe('rate-limit');
    expect((await ghJson(['x'], { run: fail('Could not resolve to a PullRequest') })).kind).toBe('not-found');
    expect((await ghJson(['x'], { run: fail('boom') })).kind).toBe('error');
  });
  it('reports malformed JSON as an error envelope', async () => expect((await ghJson(['x'], { run: async () => 'nope' })).ok).toBe(false));
  it('classifyError prefers rate-limit over auth wording', () => expect(classifyError('rate limit; check auth')).toBe('rate-limit'));
});

describe('wrappers build args', () => {
  const capture = () => {
    const calls = [];
    return { calls, run: async (a) => (calls.push(a), '[]') };
  };
  it('pr/issue/run/checks', async () => {
    const { calls, run } = capture();
    await prView(5, { run, repo: 'o/r' });
    await prList({ run, state: 'merged', limit: 3 });
    await prChecks(5, { run });
    await issueList({ run });
    await runList({ run, branch: 'main' });
    expect(calls[0].slice(0, 3)).toEqual(['pr', 'view', '5']);
    expect(calls[0]).toContain('--repo');
    expect(calls[1]).toEqual(expect.arrayContaining(['--state', 'merged', '--limit', '3']));
    expect(calls[2].slice(0, 2)).toEqual(['pr', 'checks']);
    expect(calls[3].slice(0, 2)).toEqual(['issue', 'list']);
    expect(calls[4]).toEqual(expect.arrayContaining(['--branch', 'main']));
  });
});
