import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { pickInitialProject } from './last-project';

describe('pickInitialProject', () => {
  const ids = ['brand/a/001-intro', 'brand/a/002-outro'];

  it('reselects the remembered project when it still exists', () => {
    expect(pickInitialProject(ids, 'brand/a/002-outro')).toBe('brand/a/002-outro');
  });

  it('falls back to null when the remembered project was deleted', () => {
    expect(pickInitialProject(ids, 'brand/a/003-gone')).toBeNull();
  });

  it('is null with nothing remembered or no projects', () => {
    expect(pickInitialProject(ids, undefined)).toBeNull();
    expect(pickInitialProject([], 'brand/a/001-intro')).toBeNull();
  });
});

describe('mediaLastVideoProject', () => {
  beforeEach(() => useUiStore.setState({ mediaLastVideoProject: {} }));

  it('remembers per repo without leaking across repos', () => {
    const { setMediaLastVideoProject } = useUiStore.getState();
    setMediaLastVideoProject('repo-1', 'brand/a/001-intro');
    setMediaLastVideoProject('repo-2', 'brand/b/001-promo');
    const map = useUiStore.getState().mediaLastVideoProject;
    expect(pickInitialProject(['brand/a/001-intro'], map['repo-1'])).toBe('brand/a/001-intro');
    // repo-2's memory is its own: repo-1's project is not offered there.
    expect(pickInitialProject(['brand/b/001-promo'], map['repo-2'])).toBe('brand/b/001-promo');
    expect(pickInitialProject(['brand/a/001-intro'], map['repo-2'])).toBeNull();
    expect(map['repo-3']).toBeUndefined();
  });
});
