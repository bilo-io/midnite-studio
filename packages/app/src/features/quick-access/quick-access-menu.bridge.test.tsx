import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { NotesModal } from '../notes/notes-modal';
import { useUiStore } from '../../store/ui-store';
import { QuickAccessMenu } from './quick-access-menu';

/**
 * Migrated from `e2e/quick-access-menu.spec.ts` (Phase 82 Theme C, wave 5) —
 * the menu's own mnemonic dispatch: `N` activates the live Notes row and
 * closes the menu behind it, and a disabled row's mnemonic (`I`) shows its
 * hint and leaves the menu open rather than closing on a no-op. 2 of the
 * original 5 tests moved here; 3 stay in Playwright, below.
 *
 * `QuickAccessMenu` has no internal `React.lazy` boundary of its own, so no
 * chunk warm-up is needed.
 *
 * **3 of the original 5 stay in Playwright**, all about *reachability* of the
 * component rather than its own behaviour once open — the same "feature gate"
 * distinction `optimizer.spec.ts`'s own remaining tests draw: "the FAB opens
 * the menu with the five rows, in order" needs the real FAB button in
 * `app.tsx`; "the Meta+L chord opens the same component" needs the real
 * global keybinding dispatcher (`use-keybindings.ts`) rather than this
 * menu's own internal `onKeyDown`; and "L opens the Loops panel" needs
 * `FabPanel` — a large, separately-owned surface (`components/fab-panel.tsx`)
 * this file has no reason to drag in just to prove one mnemonic calls
 * `setFabPanelOpen(true)`, which the "I" test below already proves the
 * dispatch mechanism for. None of the three are about anything inside
 * `QuickAccessMenu` itself.
 *
 * The harness below mirrors `app.tsx`'s own gating exactly —
 * `{quickAccessOpen ? <QuickAccessMenu onClose={...} /> : null}` — reading
 * and clearing the real `quickAccessOpen` flag on `ui-store`, so "the menu
 * closed behind it" is the same unmount `app.tsx` itself performs, not a
 * stand-in for it. `NotesModal` is mounted alongside because it is what the
 * `N` row's `onSelect` actually opens, and it is self-contained (its own
 * `useRepos()` fixture read, no further app shell needed).
 */

function Harness() {
  const quickAccessOpen = useUiStore((s) => s.quickAccessOpen);
  return (
    <>
      {quickAccessOpen ? (
        <QuickAccessMenu onClose={() => useUiStore.getState().setQuickAccessOpen(false)} />
      ) : null}
      <NotesModal />
    </>
  );
}

const menu = () => screen.getByTestId('quick-access-menu');

const open = () => {
  renderView(<Harness />, {
    fixtures,
    uiState: { quickAccessOpen: true, selectedRepoId: 'repo-1' },
  });
};

beforeEach(() => {
  // `quickAccessOpen` and `notesOpen` live on `ui-store`'s module singleton —
  // reset both so one test's `N` activation cannot leave the next test's
  // menu pre-empted by an already-open Notes modal.
  useUiStore.setState({ quickAccessOpen: false, notesOpen: false });
});

afterEach(cleanup);

describe('QuickAccessMenu, assembled through the real bridge', () => {
  it('N activates Notes and closes the menu behind it', () => {
    open();
    expect(menu()).toBeTruthy();

    fireEvent.keyDown(menu(), { key: 'n' });

    expect(screen.getByTestId('notes-modal')).toBeTruthy();
    // The menu closed behind it — activating a live row is a "do this and get
    // out of the way" gesture, not a "do this and let me pick another" one.
    expect(screen.queryByTestId('quick-access-menu')).toBeNull();
  });

  it('I changes nothing and leaves the menu open', () => {
    open();

    fireEvent.keyDown(menu(), { key: 'i' });

    // Still up, still showing the same five rows — a disabled row's mnemonic
    // is a no-op with a hint, never a dead end that quietly closes the menu.
    expect(menu()).toBeTruthy();
    expect(within(menu()).getByText('Coming soon')).toBeTruthy();
    expect(screen.queryByTestId('notes-modal')).toBeNull();
  });
});
