import { describe, expect, it } from 'vitest';

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
