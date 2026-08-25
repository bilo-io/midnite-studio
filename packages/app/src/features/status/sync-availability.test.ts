import type { BranchStatus } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { syncAffordances } from './sync-availability';

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
