import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanionIntent } from '@midnite/studio-shared';

/**
 * Theme B: `resolveNavigation` (pure, one case per branch) and
 * `navigateCompanion` (the impure executor `HandoffDeps.navigate` is wired
 * to) — see `navigate.ts`'s own module doc for the split.
 */

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  focusRole: vi.fn(),
  relay: vi.fn(),
  onRelayedHandler: null as ((message: unknown) => void) | null,
}));

vi.mock('../../services/bridge', () => ({
  bridge: () =>
    ({
      windowRole: mocks.windowRole,
      window: {
        focusRole: mocks.focusRole,
        relay: mocks.relay,
        onRelayed: (handler: (message: unknown) => void) => {
          mocks.onRelayedHandler = handler;
          return () => {
            mocks.onRelayedHandler = null;
          };
        },
      },
    }) as unknown,
}));

import { navigateCompanion, resolveNavigation, type NavigationState } from './navigate';
import { useBrowserStore } from '../../store/browser-store';
import { useFileEditorStore } from '../../store/file-editor-store';
import { useIssuesStore } from '../../store/issues-store';
import { useUiStore } from '../../store/ui-store';

const navigate = (
  over: Partial<Extract<CompanionIntent, { kind: 'navigate' }>>,
): Extract<CompanionIntent, { kind: 'navigate' }> => ({ kind: 'navigate', ...over });

const baseState: NavigationState = {
  windowRole: 'main',
  detachedPages: [],
  panelDetached: {
    terminal: false,
    repos: false,
    fab: false,
    companion: false,
    browser: false,
    'apps-spotify': false,
    'apps-google-calendar': false,
    'apps-youtube': false,
  },
  locked: false,
  repoId: 'r1',
};

describe('resolveNavigation — one case per branch', () => {
  it('relays when this renderer is a popout, before anything else', () => {
    expect(resolveNavigation(navigate({ view: 'graph' }), { ...baseState, windowRole: 'graph' })).toEqual({
      kind: 'relay',
    });
    // Even a locked, url, or issue-refusing shape still relays first — the
    // popout has no state of its own worth consulting.
    expect(
      resolveNavigation(navigate({ url: 'https://example.com' }), { ...baseState, windowRole: 'graph' }),
    ).toEqual({ kind: 'relay' });
  });

  it('refuses when the screen is locked', () => {
    expect(resolveNavigation(navigate({ view: 'graph' }), { ...baseState, locked: true })).toEqual({
      kind: 'refused',
      reason: 'locked',
    });
  });

  it('refuses an issue target with no repo open', () => {
    expect(
      resolveNavigation(navigate({ view: 'issues', issue: 212 }), { ...baseState, repoId: null }),
    ).toEqual({ kind: 'refused', reason: 'unknown-issue-repo' });
  });

  it('resolves a url target to the url plan, carrying whether the browser needs focusing first', () => {
    expect(resolveNavigation(navigate({ url: 'https://example.com/x' }), baseState)).toEqual({
      kind: 'url',
      url: 'https://example.com/x',
      focusFirst: false,
    });
    expect(
      resolveNavigation(navigate({ url: 'https://example.com/x' }), {
        ...baseState,
        panelDetached: { ...baseState.panelDetached, browser: true },
      }),
    ).toEqual({ kind: 'url', url: 'https://example.com/x', focusFirst: true });
  });

  it('focuses an already-detached page rather than opening a second copy', () => {
    expect(
      resolveNavigation(navigate({ view: 'graph' }), { ...baseState, detachedPages: ['graph'] }),
    ).toEqual({ kind: 'focus-window', role: 'graph', title: 'Graph' });
  });

  it('resolves an ordinary view, with its optional page/issue riding along', () => {
    expect(resolveNavigation(navigate({ view: 'graph' }), baseState)).toEqual({
      kind: 'view',
      view: 'graph',
    });
    expect(resolveNavigation(navigate({ view: 'settings', page: 'companion' }), baseState)).toEqual({
      kind: 'view',
      view: 'settings',
      page: 'companion',
    });
    expect(resolveNavigation(navigate({ view: 'issues', issue: 212 }), baseState)).toEqual({
      kind: 'view',
      view: 'issues',
      issue: 212,
    });
  });

  it('refuses a shape with neither a view nor a url, defensively', () => {
    expect(resolveNavigation(navigate({}), baseState)).toEqual({ kind: 'refused', reason: 'no-target' });
  });
});

describe('navigateCompanion', () => {
  beforeEach(() => {
    mocks.windowRole = 'main';
    mocks.focusRole.mockClear();
    mocks.relay.mockClear();
    mocks.onRelayedHandler = null;
    useUiStore.setState({
      activeView: 'dashboard',
      detachedPages: [],
      terminalDetached: false,
      reposDetached: false,
      fabDetached: false,
      companionDetached: false,
      browserDetached: false,
      screensaverLocked: false,
      selectedRepoId: 'r1',
    });
    useFileEditorStore.setState({ target: null, content: '', savedContent: '', pendingNav: null });
    useBrowserStore.setState({ tabs: [], activeTabId: null, browserOpen: false } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('changes the view and says "here\'s the X"', async () => {
    const outcome = await navigateCompanion(navigate({ view: 'graph' }));
    expect(useUiStore.getState().activeView).toBe('graph');
    expect(outcome.say).toBe('Here\'s the Commit Graph.');
  });

  it('says "you\'re already on" rather than "here\'s" for a view that did not change', async () => {
    useUiStore.setState({ activeView: 'graph' });
    const outcome = await navigateCompanion(navigate({ view: 'graph' }));
    expect(outcome.say).toBe("You're already on the Commit Graph.");
  });

  it('navigates to a settings page and names it', async () => {
    const outcome = await navigateCompanion(navigate({ view: 'settings', page: 'companion' }));
    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('companion');
    expect(outcome.say).toBe('Settings — Companion.');
  });

  it('selects the issue when a repo is open', async () => {
    const outcome = await navigateCompanion(navigate({ view: 'issues', issue: 212 }));
    expect(useUiStore.getState().activeView).toBe('issues');
    expect(useIssuesStore.getState().selectedIssue['r1']).toBe(212);
    expect(outcome.say).toBe('Here\'s the Issues.');
  });

  it('focuses an already-detached page instead of opening a second copy', async () => {
    useUiStore.setState({ detachedPages: ['graph'], activeView: 'dashboard' });
    const outcome = await navigateCompanion(navigate({ view: 'graph' }));
    expect(mocks.focusRole).toHaveBeenCalledWith({ role: 'graph' });
    // No second copy: the main window's own active view is untouched.
    expect(useUiStore.getState().activeView).toBe('dashboard');
    expect(outcome.say).toBe('The Graph is in its own window — bringing it forward.');
  });

  it('refuses while the screen is locked', async () => {
    useUiStore.setState({ screensaverLocked: true, activeView: 'dashboard' });
    const outcome = await navigateCompanion(navigate({ view: 'graph' }));
    expect(useUiStore.getState().activeView).toBe('dashboard');
    expect(outcome.say).toBe('The screen is locked — unlock it first.');
  });

  it('defers to the unsaved-file dialog and touches nothing else', async () => {
    useFileEditorStore.setState({
      target: { repoId: 'r1', relPath: 'a.ts', key: 'r1:a.ts' },
      content: 'dirty',
      savedContent: 'clean',
    });
    const outcome = await navigateCompanion(navigate({ view: 'graph' }));
    expect(outcome.say).toBe("There's an unsaved file — the dialog is asking what to do with it.");
    // The navigation is pending on the dialog, not applied.
    expect(useUiStore.getState().activeView).toBe('dashboard');
    expect(useFileEditorStore.getState().pendingNav).not.toBeNull();
  });

  it('opens a url in the docked browser, saying only the host', async () => {
    const outcome = await navigateCompanion(navigate({ url: 'https://example.com/pr/1' }));
    expect(useUiStore.getState().browserOpen).toBe(true);
    expect(useBrowserStore.getState().tabs.some((t) => t.url === 'https://example.com/pr/1')).toBe(true);
    expect(outcome.say).toBe('Opening example.com.');
    expect(mocks.focusRole).not.toHaveBeenCalled();
  });

  it('focuses the browser first when it is already detached, then still opens the tab', async () => {
    useUiStore.setState({ browserDetached: true });
    const outcome = await navigateCompanion(navigate({ url: 'https://example.com/pr/1' }));
    expect(mocks.focusRole).toHaveBeenCalledWith({ role: 'browser' });
    expect(useBrowserStore.getState().tabs.some((t) => t.url === 'https://example.com/pr/1')).toBe(true);
    expect(outcome.say).toBe('Opening example.com.');
  });

  it('relays to main when this renderer is a popout, and speaks whatever main replied', async () => {
    mocks.windowRole = 'graph';
    mocks.relay.mockImplementation((message: { payload: { replyTo: string } }) => {
      // Answer synchronously, as if main replied instantly.
      queueMicrotask(() =>
        mocks.onRelayedHandler?.({
          kind: 'companion',
          payload: { result: { ok: true, say: "Here's the Commit Graph." }, replyTo: message.payload.replyTo },
        }),
      );
    });

    const outcome = await navigateCompanion(navigate({ view: 'graph' }));
    expect(mocks.relay).toHaveBeenCalledTimes(1);
    const sent = mocks.relay.mock.calls[0]?.[0];
    expect(sent).toMatchObject({ kind: 'companion' });
    expect(sent.payload.action).toEqual({ kind: 'navigate', view: 'graph' });
    expect(outcome.say).toBe("Here's the Commit Graph.");
    // Never touched this (popout) renderer's own store.
    expect(useUiStore.getState().activeView).toBe('dashboard');
  });

  it('times out rather than hanging forever when main never answers', async () => {
    vi.useFakeTimers();
    mocks.windowRole = 'graph';
    const promise = navigateCompanion(navigate({ view: 'graph' }));
    await vi.advanceTimersByTimeAsync(5_000);
    const outcome = await promise;
    expect(outcome.say).toBe('The main window did not answer.');
    vi.useRealTimers();
  });
});
