import type { ForgeRun } from '@midnite/studio-shared';
import { ForgeRunSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { checksVerdict } from './checks-verdict';

const SHA = 'a'.repeat(40);

/*
  Built through the schema rather than as an object literal, so every field the
  contract grows arrives here filled with its own default. A hand-written
  fixture would have to be edited — and would go stale — every time a run
  learned a new field it does not care about.
*/
const run = (over: Partial<ForgeRun> = {}): ForgeRun =>
  ForgeRunSchema.parse({
    id: '1',
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headBranch: 'main',
    headSha: SHA,
    createdAt: '2026-08-26T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
    ...over,
  });

describe('checksVerdict', () => {
  it('is undefined when nothing is known', () => {
    expect(checksVerdict(undefined, SHA)).toBeUndefined();
    expect(checksVerdict([], SHA)).toBeUndefined();
    expect(checksVerdict([run()], null)).toBeUndefined();
  });

  it('ignores runs against a different commit', () => {
    // The branch has moved on. A green dot sourced from the previous tip is
    // the exact failure that teaches people to distrust the dot.
    expect(checksVerdict([run({ headSha: 'b'.repeat(40) })], SHA)).toBeUndefined();
  });

  it('reports a green set', () => {
    expect(checksVerdict([run({ name: 'CI' }), run({ id: '2', name: 'Lint' })], SHA)).toEqual({
      level: 'ok',
      summary: '2 of 2 checks passed',
    });
  });

  it('lets a failure outrank a pass', () => {
    const verdict = checksVerdict(
      [run({ name: 'CI' }), run({ id: '2', name: 'Lint', conclusion: 'failure' })],
      SHA,
    );
    expect(verdict).toEqual({ level: 'fail', summary: '1 of 2 checks failed' });
  });

  it('lets an unfinished run outrank a pass but not a failure', () => {
    expect(
      checksVerdict(
        [run({ name: 'CI' }), run({ id: '2', name: 'Lint', status: 'in_progress' })],
        SHA,
      ),
    ).toEqual({ level: 'warn', summary: '1 of 2 checks still running' });

    expect(
      checksVerdict(
        [
          run({ name: 'CI', conclusion: 'failure' }),
          run({ id: '2', name: 'Lint', status: 'in_progress' }),
        ],
        SHA,
      )?.level,
    ).toBe('fail');
  });

  it('lets a re-run supersede the run it replaced', () => {
    // Same workflow, same commit, later timestamp: the older failure has been
    // fixed and reporting it would be reporting history.
    const verdict = checksVerdict(
      [
        run({ id: '1', name: 'CI', conclusion: 'failure', createdAt: '2026-08-26T10:00:00Z' }),
        run({ id: '2', name: 'CI', conclusion: 'success', createdAt: '2026-08-26T11:00:00Z' }),
      ],
      SHA,
    );
    expect(verdict).toEqual({ level: 'ok', summary: '1 of 1 check passed' });
  });

  it('says nothing at all when every run merely declined to do anything', () => {
    // Skipped and cancelled are not verdicts. `unknown` renders as no dot,
    // which is the honest reading of "CI had no opinion".
    expect(
      checksVerdict(
        [run({ conclusion: 'skipped' }), run({ id: '2', name: 'Lint', conclusion: 'cancelled' })],
        SHA,
      ),
    ).toBeUndefined();
  });
});
