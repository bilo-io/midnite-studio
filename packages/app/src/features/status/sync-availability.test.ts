import type { BranchStatus } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { syncAffordances, syncPlan } from './sync-availability';

const branch = (partial: Partial<BranchStatus> = {}): BranchStatus => ({
  head: 'main',
  oid: 'deadbeef',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  unborn: false,
  detached: false,
  ...partial,
});

describe('syncAffordances', () => {
  it('keeps fetch live even when there is nothing to pull or push', () => {
    // Fetch is what makes the ahead/behind counts true; disabling it because
    // they read 0 would make the panel unable to ever correct itself.
    const sync = syncAffordances(branch());
    expect(sync.fetch).toEqual({ label: 'Fetch', enabled: true });
    expect(sync.pull.enabled).toBe(false);
    expect(sync.push.enabled).toBe(false);
  });

  it('counts the commits in the labels once there are some', () => {
    const sync = syncAffordances(branch({ ahead: 2, behind: 3 }));
    expect(sync.pull).toEqual({ label: 'Pull 3', enabled: true });
    expect(sync.push).toEqual({ label: 'Push 2', enabled: true });
  });

  it('offers to publish a branch with no upstream, and refuses to pull into it', () => {
    const sync = syncAffordances(branch({ upstream: null, ahead: 0 }));
    expect(sync.push).toEqual({ label: 'Publish branch', enabled: true });
    expect(sync.pull.enabled).toBe(false);
    expect(sync.pull.reason).toMatch(/no upstream/);
  });

  it('disables both directions on a detached HEAD', () => {
    const sync = syncAffordances(branch({ head: null, detached: true, upstream: null }));
    expect(sync.pull.enabled).toBe(false);
    expect(sync.push.enabled).toBe(false);
    expect(sync.push.reason).toMatch(/detached/);
  });

  it('disables both directions in a repository with no commits', () => {
    // `unborn` outranks the missing upstream: "no commits yet" is the reason
    // that tells the user what to do next.
    const sync = syncAffordances(branch({ oid: null, upstream: null, unborn: true }));
    expect(sync.push.reason).toMatch(/no commits/);
    expect(sync.pull.reason).toMatch(/no commits/);
  });

  it('always gives a disabled affordance a reason', () => {
    for (const state of [
      branch(),
      branch({ upstream: null }),
      branch({ detached: true, head: null }),
      branch({ unborn: true, oid: null, upstream: null }),
    ]) {
      for (const affordance of Object.values(syncAffordances(state))) {
        expect(affordance.enabled || affordance.reason !== undefined).toBe(true);
      }
    }
  });
});

describe('syncPlan', () => {
  it('always fetches first, then pulls before it pushes', () => {
    // The order is the whole reason the two arrow buttons went away: pushing
    // while behind is a rejection, and the fetch is what makes `behind` true.
    expect(syncPlan(branch({ ahead: 2, behind: 3 })).steps).toEqual(['fetch', 'pull', 'push']);
  });

  it('says what a click will do, with the counts in it', () => {
    expect(syncPlan(branch({ ahead: 2, behind: 3 }))).toMatchObject({
      label: 'Sync',
      detail: 'Fetch, then pull 3 and push 2.',
    });
    expect(syncPlan(branch({ behind: 3 })).detail).toBe('Fetch, then pull 3.');
    expect(syncPlan(branch({ ahead: 2 })).detail).toBe('Fetch, then push 2.');
  });

  it('degrades to a bare fetch when the counts are level', () => {
    const plan = syncPlan(branch());
    expect(plan.steps).toEqual(['fetch']);
    expect(plan.label).toBe('Fetch');
  });

  it('publishes a branch that has no upstream, and says so', () => {
    // The only path left that creates a remote branch, now that the Push
    // button is gone — so it may not hide behind the word "Sync".
    const plan = syncPlan(branch({ upstream: null, head: 'feature/x' }));
    expect(plan.steps).toEqual(['fetch', 'push']);
    expect(plan.label).toBe('Publish branch');
    expect(plan.detail).toContain('feature/x');
  });

  it('offers nothing but a fetch on a detached HEAD or an unborn branch', () => {
    for (const state of [
      branch({ detached: true, upstream: null, head: null }),
      branch({ unborn: true, upstream: null, oid: null }),
    ]) {
      const plan = syncPlan(state);
      expect(plan.steps).toEqual(['fetch']);
      // Not "Publish branch": there is no branch to publish in either state.
      expect(plan.label).toBe('Fetch');
    }
  });
});
