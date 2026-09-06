import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBrowserStore } from '../store/browser-store';
import { useUiStore } from '../store/ui-store';

import { openInMidnite, openLinkFromEvent, resolveLinkTarget } from './open-in-midnite';

const openExternal = vi.hoisted(() => vi.fn());
vi.mock('./queries', () => ({ openExternal }));

const click = (over: Partial<Parameters<typeof resolveLinkTarget>[0]> = {}) => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  button: 0,
  ...over,
});

beforeEach(() => {
  openExternal.mockClear();
  useBrowserStore.setState({ tabs: [], groups: [], activeTabId: null, recentlyClosed: [] });
  useUiStore.setState({ linkTarget: 'in-app', browserOpen: false });
});

describe('openInMidnite', () => {
  it('opens an https URL in a browser tab and never reaches openExternal', () => {
    openInMidnite('https://github.com/bilo-io/midnite-studio/pull/1');

    const { tabs, activeTabId } = useBrowserStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.url).toBe('https://github.com/bilo-io/midnite-studio/pull/1');
    expect(activeTabId).toBe(tabs[0]?.id);
    expect(useUiStore.getState().browserOpen).toBe(true);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('passes originRepoId through, so the tab lands in that repo derived group', () => {
    openInMidnite('https://example.com', { originRepoId: 'repo-a' });
    expect(useBrowserStore.getState().tabs[0]?.originRepoId).toBe('repo-a');
  });

  // The single most important case in the module: `mailto:` is on
  // `OPEN_EXTERNAL_PROTOCOLS` but is NOT routable in-app — Phase 32 Theme B
  // blocks it at `will-navigate`, so a tab would show an error page instead of
  // an email client.
  it('sends a mailto: URL to openExternal even when asked for in-app', () => {
    openInMidnite('mailto:bilo.lwabona@gmail.com', { target: 'in-app' });

    expect(openExternal).toHaveBeenCalledWith('mailto:bilo.lwabona@gmail.com');
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('sends a non-openable protocol to openExternal rather than opening a tab', () => {
    openInMidnite('file:///etc/passwd', { target: 'in-app' });

    expect(openExternal).toHaveBeenCalledWith('file:///etc/passwd');
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('sends an https URL to openExternal when the caller forces target: system', () => {
    openInMidnite('https://example.com', { target: 'system' });

    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('reads the store when no target is given', () => {
    useUiStore.setState({ linkTarget: 'system' });
    openInMidnite('https://example.com');

    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('opens what was validated, not what was passed', () => {
    // The WHATWG parser strips the control characters, so the canonical href
    // is what reaches the engine.
    openInMidnite('https://example.com/a\n');
    expect(useBrowserStore.getState().tabs[0]?.url).toBe('https://example.com/a');
  });

  describe('background', () => {
    it('leaves the previous tab active and does not reveal the pane', () => {
      const first = useBrowserStore.getState().openTab('https://one.example');
      useUiStore.setState({ browserOpen: false });

      openInMidnite('https://two.example', { background: true });

      const { tabs, activeTabId } = useBrowserStore.getState();
      expect(tabs).toHaveLength(2);
      expect(activeTabId).toBe(first);
      expect(useUiStore.getState().browserOpen).toBe(false);
    });

    it('keeps focus on the new tab when there was no previous one', () => {
      openInMidnite('https://one.example', { background: true });
      const { tabs, activeTabId } = useBrowserStore.getState();
      expect(activeTabId).toBe(tabs[0]?.id);
    });
  });
});

describe('resolveLinkTarget', () => {
  it.each([
    ['plain, in-app', click(), 'in-app' as const, { target: 'in-app', background: false }],
    ['plain, system', click(), 'system' as const, { target: 'system', background: false }],
    // Cmd/Ctrl flips, in both directions.
    [
      'meta, in-app',
      click({ metaKey: true }),
      'in-app' as const,
      { target: 'system', background: false },
    ],
    [
      'meta, system',
      click({ metaKey: true }),
      'system' as const,
      { target: 'in-app', background: false },
    ],
    [
      'ctrl, in-app',
      click({ ctrlKey: true }),
      'in-app' as const,
      { target: 'system', background: false },
    ],
    [
      'ctrl, system',
      click({ ctrlKey: true }),
      'system' as const,
      { target: 'in-app', background: false },
    ],
    // Shift is absolute, in both directions.
    [
      'shift, in-app',
      click({ shiftKey: true }),
      'in-app' as const,
      { target: 'system', background: false },
    ],
    [
      'shift, system',
      click({ shiftKey: true }),
      'system' as const,
      { target: 'system', background: false },
    ],
    // …and beats Cmd, deliberately: "always leave the app" is one gesture.
    [
      'shift+meta, in-app',
      click({ shiftKey: true, metaKey: true }),
      'in-app' as const,
      { target: 'system', background: false },
    ],
    [
      'shift+meta, system',
      click({ shiftKey: true, metaKey: true }),
      'system' as const,
      { target: 'system', background: false },
    ],
    // Middle-click is orthogonal to where: it only says "not now".
    [
      'middle, in-app',
      click({ button: 1 }),
      'in-app' as const,
      { target: 'in-app', background: true },
    ],
    [
      'middle, system',
      click({ button: 1 }),
      'system' as const,
      { target: 'system', background: true },
    ],
    // Middle beats Cmd — the flip never fires once the button rule has matched.
    [
      'middle+meta, in-app',
      click({ button: 1, metaKey: true }),
      'in-app' as const,
      { target: 'in-app', background: true },
    ],
    // …but shift still beats middle, and drops the background with it.
    [
      'middle+shift, in-app',
      click({ button: 1, shiftKey: true }),
      'in-app' as const,
      { target: 'system', background: false },
    ],
  ])('%s', (_name, event, preference, expected) => {
    expect(resolveLinkTarget(event, preference)).toEqual(expected);
  });
});

describe('openLinkFromEvent', () => {
  it('routes a plain click by the stored preference', () => {
    openLinkFromEvent('https://example.com', click(), { originRepoId: 'repo-a' });
    expect(useBrowserStore.getState().tabs[0]?.originRepoId).toBe('repo-a');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('routes a shift-click to the system browser regardless of the preference', () => {
    openLinkFromEvent('https://example.com', click({ shiftKey: true }));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('routes a meta-click to the opposite of the preference', () => {
    openLinkFromEvent('https://example.com', click({ metaKey: true }));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('routes a middle-click into a background tab', () => {
    const first = useBrowserStore.getState().openTab('https://one.example');
    openLinkFromEvent('https://two.example', click({ button: 1 }));
    expect(useBrowserStore.getState().activeTabId).toBe(first);
  });
});
