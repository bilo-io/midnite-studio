import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adoptRenamedPersistKey } from './persist-rename';

/**
 * The rename adoption runs before a store hydrates, so its failure mode is
 * silent — a user's layout simply comes back at defaults. These cover the two
 * ways that happens by accident: a second call clobbering fresh state, and a
 * throwing `localStorage` taking the module down with it.
 */
describe('adoptRenamedPersistKey', () => {
  beforeEach(() => localStorage.clear());

  it('copies the pre-rename value onto the new key', () => {
    localStorage.setItem('midnite-git.ui', '{"state":{"sidebarWidth":288}}');

    adoptRenamedPersistKey('midnite-git.ui', 'midnite-studio.ui');

    expect(localStorage.getItem('midnite-studio.ui')).toBe('{"state":{"sidebarWidth":288}}');
    // Left in place on purpose: an older build launched afterwards still finds it.
    expect(localStorage.getItem('midnite-git.ui')).not.toBeNull();
  });

  it('never overwrites state the renamed store has already written', () => {
    localStorage.setItem('midnite-git.ui', '{"state":{"sidebarWidth":288}}');
    localStorage.setItem('midnite-studio.ui', '{"state":{"sidebarWidth":420}}');

    adoptRenamedPersistKey('midnite-git.ui', 'midnite-studio.ui');

    expect(localStorage.getItem('midnite-studio.ui')).toBe('{"state":{"sidebarWidth":420}}');
  });

  it('is a no-op on a clean install', () => {
    adoptRenamedPersistKey('midnite-git.ui', 'midnite-studio.ui');
    expect(localStorage.getItem('midnite-studio.ui')).toBeNull();
  });

  it('survives storage that throws (private mode, blocked site data)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    expect(() => adoptRenamedPersistKey('midnite-git.ui', 'midnite-studio.ui')).not.toThrow();

    getItem.mockRestore();
  });
});
