import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { usePaletteStore } from '../../store/palette-store';
import { PaletteToggle } from './palette-toggle';
import { StatusBar } from './status-bar';

/**
 * Migrated from `e2e/shortcut-rail.spec.ts` (Phase 82 Theme C, wave 1) — the
 * structural half of that spec: separator pruning, zone placement and render
 * order, none of which needs real CSS or real layout.
 *
 * **Six of the original twelve tests stay in Playwright** — this spec is a
 * genuine geometry/CSS straggler, not a clean wave-1 candidate, and the
 * codebase already says so in its own words. `status-toggle.tsx` and
 * `status-toggle.test.tsx` state the reason directly: whether a toggle's
 * `.status-label` is actually hidden or shown is resolved by a
 * `[data-density]`-scoped rule in `styles.css`, and "jsdom applies no
 * stylesheet, so the attribute [`data-named`] is what a unit test can
 * honestly assert — the rendered result is covered in
 * `shortcut-rail.spec.ts`, which runs real CSS." The three name-reveal tests
 * (chord-always/name-on-open, name-on-toggle, name-on-hover) and the two
 * density tests (compact hides every name, the overflow popover) all turn on
 * that same real-CSS/real-layout resolution — `useOverflow`'s density comes
 * from measured `scrollWidth`/`clientWidth`, which jsdom does not compute —
 * so they stay put. "The palette and Go-to-File live only on the rail" also
 * stays: its second half asserts an ABSENCE in the title bar, a different
 * component this file does not mount, so the check is inherently
 * cross-component.
 */

const UI_STATE = { selectedRepoId: 'repo-1' };

afterEach(() => {
  cleanup();
  usePaletteStore.getState().close();
});

describe('StatusBar, assembled through the real bridge', () => {
  /**
   * The lit state is real, not decorative — it follows `palette-store`'s
   * `isOpen`/`mode`. The e2e original also drove the CLOSE half through
   * Escape; that generic dismiss mechanism is `use-dismiss.ts`'s own contract
   * (`use-dismiss.test.ts`), so this asserts the same claim through the store
   * action Escape ultimately calls, rather than re-proving Escape itself.
   */
  it('the palette toggle lights while the palette is open', async () => {
    renderView(<PaletteToggle />);
    const palette = screen.getByTestId('palette-toggle');
    expect(palette.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(palette);
    expect(palette.getAttribute('aria-pressed')).toBe('true');

    // A raw store call, unlike `fireEvent`, is not wrapped in `act()` —
    // `waitFor` supplies that instead of asserting immediately.
    usePaletteStore.getState().close();
    await waitFor(() => expect(palette.getAttribute('aria-pressed')).toBe('false'));
  });

  it('an empty health group prunes both of the zone’s separators', async () => {
    const fx: MockFixtures = {
      ...fixtures,
      diagnostics: { trust: { state: 'no-command', command: null, trustedAt: null }, candidates: [] },
    };
    renderView(<StatusBar />, { fixtures: fx, uiState: UI_STATE });

    await waitFor(() => expect(screen.queryByTestId('diagnostics-enable')).toBeNull());
    expect(screen.queryByTestId('diagnostics-segment')).toBeNull();

    const left = screen.getByTestId('status-bar-left');
    const separators = left.querySelectorAll('[data-status-sep]');
    expect(separators).toHaveLength(2);
    expect([...separators].every((sep) => (sep as HTMLElement).hidden)).toBe(true);
  });

  it('a populated health group earns exactly one separator', async () => {
    const fx: MockFixtures = {
      ...fixtures,
      diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
    };
    renderView(<StatusBar />, { fixtures: fx, uiState: UI_STATE });

    await screen.findByTestId('diagnostics-segment');
    const left = screen.getByTestId('status-bar-left');
    const visible = [...left.querySelectorAll('[data-status-sep]')].filter(
      (sep) => !(sep as HTMLElement).hidden,
    );
    expect(visible).toHaveLength(1);
  });

  /** Diagnostics is a fact about the checkout, and Theme D moved it accordingly. */
  it('diagnostics sits in the left zone, not the right', async () => {
    const fx: MockFixtures = {
      ...fixtures,
      diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
    };
    renderView(<StatusBar />, { fixtures: fx, uiState: UI_STATE });

    await screen.findByTestId('diagnostics-segment');
    expect(
      screen.getByTestId('status-bar-left').querySelectorAll('[data-testid="diagnostics-segment"]'),
    ).toHaveLength(1);
    expect(
      screen.getByTestId('status-bar-right').querySelectorAll('[data-testid="diagnostics-segment"]'),
    ).toHaveLength(0);
  });

  /** Render order and collapse order agree — the priority inversion Theme B fixed. */
  it('the rail renders repos, terminal, explorer, browser, activity, palette, files in that order', () => {
    renderView(<StatusBar />, { fixtures, uiState: UI_STATE });

    const ids = Array.from(screen.getByTestId('status-bar-left').children)
      .map((child) => child.getAttribute('data-testid'))
      .filter((id): id is string => id !== null);
    expect(ids.slice(0, 7)).toEqual([
      'repos-toggle',
      'terminal-toggle',
      'explorer-toggle',
      'browser-toggle',
      'activity-toggle',
      'palette-toggle',
      'files-toggle',
    ]);
  });

  /**
   * The `MutationObserver` path — the sole reason the observer exists, and
   * previously untested because both separator tests above set their
   * fixture before the first render. Granting diagnostics trust makes the
   * `health` group render for the first time *after* mount; nothing
   * re-renders `StatusBar` itself, so only the observer can notice that the
   * separator it pruned now has something on both sides of it. jsdom
   * implements `MutationObserver` natively, so this needs no stub.
   */
  it('a segment appearing after mount restores its pruned separator', async () => {
    const fx: MockFixtures = {
      ...fixtures,
      diagnostics: {
        trust: {
          state: 'untrusted',
          command: { parser: 'eslint', ecosystem: 'javascript', command: 'eslint', args: ['.'] },
          trustedAt: null,
        },
        candidates: [
          {
            parser: 'eslint',
            ecosystem: 'javascript',
            detectorId: 'eslint-local',
            label: 'ESLint',
            command: 'eslint',
            args: ['.'],
            evidence: [],
          },
        ],
      },
    };
    renderView(<StatusBar />, { fixtures: fx, uiState: UI_STATE });

    await screen.findByTestId('diagnostics-enable');
    const left = screen.getByTestId('status-bar-left');
    await waitFor(() => {
      const visible = [...left.querySelectorAll('[data-status-sep]')].filter(
        (sep) => !(sep as HTMLElement).hidden,
      );
      expect(visible).toHaveLength(1);
    });
  });
});
