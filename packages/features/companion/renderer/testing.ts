import { create } from 'zustand';

import { createDefaultCompanionHost } from './default-host';
import type { CompanionHost } from './host';

/**
 * Test support for the companion's own suite (Phase 123 Theme F) — never imported by product code.
 *
 * The moved tests drove Studio's real stores. They now drive a default host whose reaches are small
 * stand-in stores: the file editor's pending navigation, the issue modal's target, and the pop-out
 * game flag — exactly the three the navigation tests set and read. `test-setup.ts` installs a fresh
 * host before every test.
 */

export const useFileEditorStore = create<{ pendingNav: unknown; target: unknown; content: string; savedContent: string }>(() => ({
  pendingNav: null,
  target: null,
  content: '',
  savedContent: '',
}));

export const useIssueModalStore = create<{ target: { repoId: string; number: number } | null }>(() => ({ target: null }));

export const useGamePopped = create<{ popped: boolean }>(() => ({ popped: false }));

export const openedBrowserUrls: string[] = [];

export function createTestCompanionHost(overrides: Partial<CompanionHost> = {}): CompanionHost {
  return {
    ...createDefaultCompanionHost(),
    gamePopped: () => useGamePopped.getState().popped,
    openBrowserUrl: (url) => void openedBrowserUrls.push(url),
    hasUnsavedFileNav: () => useFileEditorStore.getState().pendingNav !== null,
    openIssue: (target) => useIssueModalStore.setState({ target }),
    ...overrides,
  };
}
