import { describe, expect, it } from 'vitest';

import { filtersByDefault } from './use-dirty-filter';

describe('filtersByDefault', () => {
  it('hides clean checkouts in the Changes view', () => {
    expect(filtersByDefault('changes')).toBe(true);
  });

  it('leaves every other view showing the whole tree', () => {
    // The Graph view is about history, and the Files view about files on
    // disk; neither has any reason to care whether a checkout is dirty, and a
    // tree that quietly dropped repos there would look like they had closed.
    for (const view of ['graph', 'files', 'settings'] as const) {
      expect(filtersByDefault(view)).toBe(false);
    }
  });
});
