import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { SettingsView } from '../settings/settings-view';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { CompanionPanelSlot } from './companion-panel';
// Imported for its module-scope side effect: registers the REAL
// submit/greet/interrupt/repeat ports (`setCompanionPorts` at import time —
// see the file's own doc comment on why that is deliberate, not an effect).
// `companion-panel.test.tsx` calls `resetCompanionPorts()` in its own
// `beforeEach` to swap these back out for fakes; this file never does, so
// `greetCompanion()` below is the real pipeline against the real mock bridge.
import './register-flow-ports';
import { QuickAccessMenu } from '../quick-access/quick-access-menu';

/**
 * Migrated from `e2e/companion-panel.spec.ts` (Phase 82 Theme C, wave 4).
 *
 * That file has grown to 20 tests since this wave was scoped at ~11 — Phase
 * 81 Theme C added 9 command-routing tests ("direct"/"confirm"/"never") after
 * the estimate was written. Those 9, plus the real-layout resize/overlap
 * test, are untouched here: **11 tests** are this wave's actual scope, the
 * same count the phase doc named.
 *
 * Of those 11, **6 are already covered — more granularly — by
 * `companion-panel.test.tsx`** (typing/Escape, both mic states, markdown
 * rendering, per-turn timestamps, the header's clear-confirm gate), which
 * mounts `CompanionPanel` directly against synthetic `companion-ports.ts`
 * fakes. Porting them again here would be the weaker stand-in the phase doc
 * warns against, not a stronger one — that file is deleted from nowhere and
 * this one does not re-litigate it.
 *
 * **4 tests below are the genuinely new coverage**: mounting through the
 * *real* bridge and the *real* registered ports (not the fakes), which is
 * what `companion-panel.test.tsx` deliberately does not do. `useUiStore` is
 * a module singleton — `companionEnabled`/`companionPanelOpen` leak across
 * tests otherwise — so `beforeEach` resets it alongside `useCompanionStore`.
 *
 * **1 test stays in Playwright as a new finding**: "the docked panel sits
 * between the view and the Loops panel" needs `app.tsx`'s own resize-tween
 * machinery (`companionTween`/`fabPanelTween`, the frames the DOM-order
 * assertion actually reads) — `CompanionPanelSlot` alone renders unconditional
 * on `companionEnabled`, with no notion of the docked frame that machinery
 * owns, so reproducing the claim here would mean rebuilding `app.tsx`'s own
 * layout code in a harness rather than testing `CompanionPanelSlot`.
 */

const UI_STATE = { selectedRepoId: 'repo-1' };

beforeEach(() => {
  useUiStore.setState({
    companionEnabled: false,
    companionPanelOpen: false,
    quickAccessOpen: false,
  });
  useCompanionStore.setState({ state: 'idle', transcript: [], activeHandoff: null });
});

afterEach(cleanup);

describe('the companion, gated through Settings and the quick-access menu', () => {
  it('companion disabled: the C leaf is disabled with its reason and the popover offers the enable row', () => {
    renderView(
      <>
        <QuickAccessMenu onClose={() => useUiStore.getState().setQuickAccessOpen(false)} />
        <CompanionPanelSlot />
      </>,
      { fixtures, uiState: UI_STATE },
    );

    expect(screen.getByTestId('companion-strip').textContent).toContain(
      'Enable the companion in Settings',
    );
    const leaf = screen.getByTestId('quick-access-row-c');
    expect(leaf.getAttribute('aria-disabled')).toBe('true');

    fireEvent.keyDown(screen.getByTestId('quick-access-menu'), { key: 'c' });
    // A disabled row is a no-op with an explanation, never a dead end that
    // closes the menu.
    expect(screen.getByTestId('quick-access-menu')).toBeTruthy();
    expect(screen.getByText('Enable in Settings ▸ Companion')).toBeTruthy();
    expect(screen.queryByTestId('companion-panel')).toBeNull();
  });

  it('Settings ▸ Companion enables it, and the real greet() renders the digest as one formatted turn', async () => {
    renderView(
      <>
        <SettingsView />
        <CompanionPanelSlot />
      </>,
      { fixtures, uiState: { ...UI_STATE, activeView: 'settings', settingsPage: 'companion' } },
    );

    const enable = screen.getByTestId('companion-enable');
    fireEvent.click(enable);
    expect((enable as HTMLInputElement).checked).toBe(true);
    expect(useUiStore.getState().companionEnabled).toBe(true);

    // The real `greetCompanion()` pipeline (registered by `register-flow-ports`
    // at import time), against the real mock bridge — not a hand-fed
    // transcript. Ported from the deleted "the greeting arrives as one
    // formatted turn" e2e test: a `<strong>`/`<code>` pair and a real PR link,
    // inside one bubble.
    expect(await screen.findByTestId('companion-state-label')).toHaveProperty(
      'textContent',
      'Ready',
    );
    const thread = screen.getByTestId('companion-thread');
    expect(thread.querySelector('[data-turn-role="companion"] strong')?.textContent).toBe(
      'midnite-studio',
    );
    expect(thread.querySelector('[data-turn-role="companion"] code')).toBeTruthy();
    expect(
      thread.querySelectorAll('[data-turn-role="companion"] a[href*="/pull/265"]'),
    ).toHaveLength(1);

    // At most 3 companion turns — greeting, overview, prompt — not the six to
    // twelve one-sentence-per-bubble fragments the pre-fix greeting produced.
    const companionTurns = thread.querySelectorAll('[data-turn-role="companion"]');
    expect(companionTurns.length).toBeGreaterThan(0);
    expect(companionTurns.length).toBeLessThanOrEqual(3);
  });

  it('the popover mirrors the last companion turn, and Repeat appears once there is one', async () => {
    renderView(
      <>
        <QuickAccessMenu onClose={() => useUiStore.getState().setQuickAccessOpen(false)} />
        <CompanionPanelSlot />
      </>,
      { fixtures, uiState: { ...UI_STATE, companionEnabled: true, companionPanelOpen: true } },
    );

    // The greeting has to finish before there is a "last turn" to mirror.
    expect(await screen.findByTestId('companion-state-label')).toHaveProperty(
      'textContent',
      'Ready',
    );
    expect(screen.getByTestId('companion-strip').textContent).toContain('Ready');
    // The greeting already posted a companion turn, so Repeat is offered with
    // no user input needed.
    expect(screen.getByTestId('quick-access-row-r')).toBeTruthy();
  });
});

describe("Settings ▸ Companion ▸ 'Speak replies aloud'", () => {
  afterEach(() => {
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  });

  it('is on by default, and turning it off disables the Say-hello preview', () => {
    // `companion-say-hello`'s own `disabled` also depends on there being at
    // least one system voice (or a ready local one) — a precondition this
    // test is not about, so it is satisfied here the same way
    // `companion-voice-page.test.tsx`'s `installVoices` does, rather than
    // left to fail on an unrelated gate.
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      getVoices: () => [{ voiceURI: 'urn:voice:0', name: 'Voice 0', lang: 'en-US', default: true }],
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    renderView(<SettingsView />, {
      fixtures,
      uiState: {
        ...UI_STATE,
        activeView: 'settings',
        settingsPage: 'companion',
        companionEnabled: true,
      },
    });

    const speak = screen.getByTestId('companion-speak-aloud');
    expect((speak as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('companion-say-hello') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(speak);
    expect((speak as HTMLInputElement).checked).toBe(false);
    // Turning speech off must not disable the thread — it takes the voice
    // preview with it, because there is nothing left to preview.
    expect((screen.getByTestId('companion-say-hello') as HTMLButtonElement).disabled).toBe(true);
  });
});
