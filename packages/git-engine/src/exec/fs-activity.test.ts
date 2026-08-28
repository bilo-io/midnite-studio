import { describe, expect, it } from 'vitest';

import { FsActivity, withFsActivity } from './fs-activity';

describe('FsActivity', () => {
  it('reports active only on the 0→1 transition, and idle only on 1→0', () => {
    const activity = new FsActivity();
    const events: Array<[string, boolean]> = [];
    activity.onActivity((repoId, active) => events.push([repoId, active]));

    activity.begin('r1');
    activity.begin('r1'); // a second concurrent write for the same repo
    activity.end('r1'); // the first of the two finishes — still active
    activity.end('r1'); // now genuinely idle

    expect(events).toEqual([
      ['r1', true],
      ['r1', false],
    ]);
    expect(activity.isActive('r1')).toBe(false);
  });

  it('keeps each repo independent', () => {
    const activity = new FsActivity();
    activity.begin('r1');

    expect(activity.isActive('r1')).toBe(true);
    expect(activity.isActive('r2')).toBe(false);
  });

  it('never goes negative on an unmatched end', () => {
    const activity = new FsActivity();
    activity.end('r1');
    expect(activity.isActive('r1')).toBe(false);
  });

  it('unsubscribes cleanly', () => {
    const activity = new FsActivity();
    const events: boolean[] = [];
    const stop = activity.onActivity((_repoId, active) => events.push(active));
    stop();

    activity.begin('r1');
    activity.end('r1');
    expect(events).toEqual([]);
  });
});

describe('withFsActivity', () => {
  it('marks active for the whole task and idle again once it settles', async () => {
    const events: boolean[] = [];
    // Exercise the real module-level singleton, since that is what
    // `fs-write-handlers.ts` and `RepoWatcher` actually share.
    const { fsActivity } = await import('./fs-activity');
    const stop = fsActivity.onActivity((repoId, active) => {
      if (repoId === 'repo-under-test') events.push(active);
    });

    await withFsActivity('repo-under-test', async () => {
      expect(fsActivity.isActive('repo-under-test')).toBe(true);
    });

    expect(fsActivity.isActive('repo-under-test')).toBe(false);
    expect(events).toEqual([true, false]);
    stop();
  });

  it('still reports idle when the task throws', async () => {
    const { fsActivity } = await import('./fs-activity');
    await expect(
      withFsActivity('repo-throws', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(fsActivity.isActive('repo-throws')).toBe(false);
  });
});
