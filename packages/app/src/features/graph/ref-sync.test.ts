import { describe, expect, it } from 'vitest';

import type { Ref } from '@midnite/studio-shared';

import { badgeActions, defaultRemote, splitUpstream, syncActions } from './ref-sync';

const branch = (over: Partial<Ref> = {}): Ref => ({
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const upstream = (over: Partial<NonNullable<Ref['upstream']>> = {}) => ({
  name: 'origin/main',
  ahead: 0,
  behind: 0,
  gone: false,
  ...over,
});

const REMOTES = ['origin'];

const byKind = (ref: Ref, current: string | null, remotes = REMOTES) =>
  Object.fromEntries(syncActions(ref, current, remotes).map((a) => [a.kind, a]));

describe('splitUpstream', () => {
  it('splits at the first slash for an ordinary remote', () => {
    expect(splitUpstream('origin/main', REMOTES)).toEqual({ remote: 'origin', branch: 'main' });
  });

  it('keeps the slashes that belong to the BRANCH', () => {
    // `origin/feature/x` is one remote and a two-segment branch, not two remotes.
    expect(splitUpstream('origin/feature/x', REMOTES)).toEqual({
      remote: 'origin',
      branch: 'feature/x',
    });
  });

  it('matches the longest configured remote, not the first slash', () => {
    // The case a `split('/')[0]` gets silently wrong: git allows a slash in a
    // remote name, and then the first segment is only half of it.
    expect(splitUpstream('gh/fork/main', ['origin', 'gh/fork'])).toEqual({
      remote: 'gh/fork',
      branch: 'main',
    });
  });

  it('prefers the longer of two remotes that both prefix the name', () => {
    expect(splitUpstream('up/stream/main', ['up', 'up/stream'])).toEqual({
      remote: 'up/stream',
      branch: 'main',
    });
  });

  it('names the remote git recorded when none is configured any more', () => {
    // A tracking ref outliving its remote: reporting `origin` here would be a
    // confident lie about which remote the branch was following.
    expect(splitUpstream('deleted/main', REMOTES)).toEqual({
      remote: 'deleted',
      branch: 'main',
    });
  });

  it('survives a name with no slash at all', () => {
    expect(splitUpstream('weird', [])).toEqual({ remote: 'weird', branch: '' });
  });
});

describe('defaultRemote', () => {
  it('prefers origin wherever it appears in the list', () => {
    expect(defaultRemote(['upstream', 'origin'])).toBe('origin');
  });

  it('falls back to the first remote when there is no origin', () => {
    expect(defaultRemote(['upstream', 'fork'])).toBe('upstream');
  });

  it('is null with no remotes', () => {
    expect(defaultRemote([])).toBeNull();
  });
});

describe('syncActions', () => {
  it('offers nothing for a tag or a remote-tracking branch', () => {
    // Neither tracks anything a push or pull could act on, and "push
    // origin/main" is either a no-op or a force-push — out of scope for the MVP.
    expect(syncActions(branch({ kind: 'tag', name: 'v1.0.0' }), 'main', REMOTES)).toEqual([]);
    expect(syncActions(branch({ kind: 'remoteBranch', name: 'origin/main' }), 'main', REMOTES))
      .toEqual([]);
    expect(syncActions(branch({ kind: 'head' }), 'main', REMOTES)).toEqual([]);
  });

  describe('a branch with no upstream', () => {
    it('is offered publish, with -u', () => {
      const [action, ...rest] = syncActions(branch({ name: 'feature/x' }), 'main', REMOTES);
      expect(rest).toHaveLength(0);
      expect(action).toMatchObject({
        kind: 'publish',
        disabled: false,
        setUpstream: true,
        remote: 'origin',
        branch: 'feature/x',
      });
      expect(action?.label).toBe('Publish feature/x to origin (sets upstream)');
    });

    it('can publish a branch it is not standing on', () => {
      // `git push -u origin feature/x` names the branch in the refspec, so
      // there is nothing to check out first.
      expect(syncActions(branch({ name: 'feature/x' }), 'main', REMOTES)[0]?.disabled).toBe(false);
    });

    it('is disabled, with a reason, when the repo has no remote', () => {
      const [action] = syncActions(branch(), 'main', []);
      expect(action?.disabled).toBe(true);
      expect(action?.disabledReason).toMatch(/no remote/i);
    });
  });

  describe('a branch whose upstream is gone', () => {
    it('is offered publish rather than a push against a ref that no longer exists', () => {
      const ref = branch({ upstream: upstream({ gone: true, ahead: 4 }) });
      const kinds = syncActions(ref, 'main', REMOTES).map((a) => a.kind);
      expect(kinds).toEqual(['publish']);
    });
  });

  describe('ahead / behind / diverged', () => {
    it('enables push and names the count when ahead', () => {
      const { push, pull } = byKind(branch({ upstream: upstream({ ahead: 3 }) }), 'main');
      expect(push).toMatchObject({ disabled: false, count: 3 });
      expect(push?.label).toBe('Push 3 commits to origin/main');
      expect(pull?.disabled).toBe(true);
      expect(pull?.disabledReason).toMatch(/nothing to pull/i);
    });

    it('enables pull only on the branch you are standing on', () => {
      const ref = branch({ name: 'feature/x', upstream: upstream({ name: 'origin/feature/x', behind: 2 }) });

      const onIt = byKind(ref, 'feature/x');
      expect(onIt.pull).toMatchObject({ disabled: false, count: 2 });
      expect(onIt.pull?.label).toBe('Pull 2 commits from origin/feature/x');

      const elsewhere = byKind(ref, 'main');
      expect(elsewhere.pull?.disabled).toBe(true);
      expect(elsewhere.pull?.disabledReason).toMatch(/check out feature\/x first/i);
    });

    it('pushes a branch it is NOT standing on — the refspec names it', () => {
      const ref = branch({ name: 'feature/x', upstream: upstream({ name: 'origin/feature/x', ahead: 1 }) });
      const { push } = byKind(ref, 'main');
      expect(push).toMatchObject({ disabled: false, branch: 'feature/x', remote: 'origin' });
      expect(push?.label).toBe('Push 1 commit to origin/feature/x');
    });

    it('offers both live when diverged', () => {
      const ref = branch({ upstream: upstream({ ahead: 2, behind: 5 }) });
      const { push, pull } = byKind(ref, 'main');
      expect(push?.disabled).toBe(false);
      expect(pull?.disabled).toBe(false);
    });

    it('says "commit", singular, for one', () => {
      const { push } = byKind(branch({ upstream: upstream({ ahead: 1 }) }), 'main');
      expect(push?.label).toContain('1 commit to');
      expect(push?.label).not.toContain('1 commits');
    });

    it('pulls the REMOTE name of the branch, not the local one', () => {
      // A local `main` tracking `origin/trunk`: `git pull origin main` would
      // ask for a branch the remote does not have.
      const ref = branch({ upstream: upstream({ name: 'origin/trunk', behind: 1 }) });
      const { pull } = byKind(ref, 'main');
      expect(pull).toMatchObject({ disabled: false, remote: 'origin', branch: 'trunk' });
    });

    it('omits the branch when pushing a renamed-tracking branch it is standing on', () => {
      // `git push origin main` would create `origin/main` beside the
      // `origin/trunk` it was meant to update, because the request carries one
      // branch and not a `local:remote` pair. Naming nothing lets git resolve
      // the destination from the branch's own upstream config.
      const ref = branch({ upstream: upstream({ name: 'origin/trunk', ahead: 2 }) });
      const { push } = byKind(ref, 'main');
      expect(push?.disabled).toBe(false);
      expect(push?.branch).toBeUndefined();
    });

    it('refuses to push a renamed-tracking branch from somewhere else', () => {
      // Off the branch, git has no upstream config to consult and we have no
      // refspec to give it — so this is the one push that needs a checkout.
      const ref = branch({ upstream: upstream({ name: 'origin/trunk', ahead: 2 }) });
      const { push } = byKind(ref, 'other');
      expect(push?.disabled).toBe(true);
      expect(push?.disabledReason).toMatch(/different name/i);
    });

    it('always offers fetch, and scopes it to the upstream remote', () => {
      const ref = branch({ upstream: upstream({ name: 'fork/main' }) });
      const { fetch } = byKind(ref, 'main', ['origin', 'fork']);
      expect(fetch).toMatchObject({ kind: 'fetch', disabled: false, remote: 'fork' });
      expect(fetch?.branch).toBeUndefined();
    });

    it('never marks an in-sync branch as having work to do', () => {
      const actions = syncActions(branch({ upstream: upstream() }), 'main', REMOTES);
      expect(actions.filter((a) => a.count > 0)).toHaveLength(0);
    });
  });
});

describe('badgeActions', () => {
  it('keeps only the verbs with a count — the ones the chip just raised', () => {
    const ref = branch({ upstream: upstream({ ahead: 2, behind: 5 }) });
    const kinds = badgeActions(syncActions(ref, 'main', REMOTES)).map((a) => a.kind);
    expect(kinds).toEqual(['pull', 'push']);
  });

  it('is empty for an in-sync branch, so nothing expands on hover', () => {
    expect(badgeActions(syncActions(branch({ upstream: upstream() }), 'main', REMOTES))).toEqual([]);
  });

  it('drops publish and fetch, which have no count to expand for', () => {
    expect(badgeActions(syncActions(branch(), 'main', REMOTES))).toEqual([]);
  });

  it('keeps a disabled-but-counted verb, so the reason is reachable', () => {
    // A branch behind but not checked out: the chip says ↓2, so hiding the
    // control would leave the count unexplained. It expands, and says why.
    const ref = branch({ name: 'feature/x', upstream: upstream({ behind: 2 }) });
    const [action, ...rest] = badgeActions(syncActions(ref, 'main', REMOTES));
    expect(rest).toHaveLength(0);
    expect(action).toMatchObject({ kind: 'pull', disabled: true });
  });
});
