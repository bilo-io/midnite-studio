import { beforeEach, describe, expect, it } from 'vitest';

import { isShotsSpecFile, seedReposPanelDefault } from '../test-support/shots-repos-default';

const KEY = 'midnite-studio.ui';

describe('seedReposPanelDefault', () => {
  beforeEach(() => localStorage.clear());

  it('seeds reposOpen on an empty profile', () => {
    seedReposPanelDefault(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).state.reposOpen).toBe(false);
  });

  it('merges into existing state without clobbering it', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 18, state: { theme: 'dark' } }));
    seedReposPanelDefault(false);
    const parsed = JSON.parse(localStorage.getItem(KEY)!);
    expect(parsed.version).toBe(18);
    expect(parsed.state).toEqual({ theme: 'dark', reposOpen: false });
  });

  it('keeps a value the spec seeded itself', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 18, state: { reposOpen: true } }));
    seedReposPanelDefault(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).state.reposOpen).toBe(true);
  });

  it('tolerates an unparseable profile', () => {
    localStorage.setItem(KEY, '{nope');
    expect(() => seedReposPanelDefault(false)).not.toThrow();
  });
});

describe('isShotsSpecFile', () => {
  it('matches only -shots specs', () => {
    expect(isShotsSpecFile('/a/e2e/foo-shots.spec.ts')).toBe(true);
    expect(isShotsSpecFile('/a/e2e/visual/status-bar.spec.ts')).toBe(false);
    expect(isShotsSpecFile('/a/e2e/repos-workbench.spec.ts')).toBe(false);
  });
});
