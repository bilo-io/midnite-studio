import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useActionsStore } from '../store/actions-store';
import { useBrowserStore } from '../store/browser-store';
import { useIssuesStore } from '../store/issues-store';
import { useReviewsStore } from '../store/reviews-store';
import { useUiStore } from '../store/ui-store';

import { forgeRegistryKey, useRepoForgeRegistry } from './repo-forge-registry';
import {
  navigateInAppRoute,
  openInMidnite,
  openLinkFromEvent,
  resolveDestination,
  type LinkModifiers,
} from './open-in-midnite';

const openExternal = vi.hoisted(() => vi.fn());
vi.mock('./queries', () => ({ openExternal }));

const click = (over: Partial<LinkModifiers> = {}): LinkModifiers => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  button: 0,
  ...over,
});

/** A PR URL for `bilo-io/midnite-studio`, registered under `repo-1` in most tests below. */
const PR_URL = 'https://github.com/bilo-io/midnite-studio/pull/42';

beforeEach(() => {
  openExternal.mockClear();
  useBrowserStore.setState({ tabs: [], groups: [], activeTabId: null, recentlyClosed: [] });
  useUiStore.setState({
    linkTarget: 'in-app',
    browserOpen: false,
    selectedRepoId: null,
    activeView: 'graph',
  });
  useRepoForgeRegistry.setState({ byForgeKey: {} });
  useReviewsStore.setState({ selectedPull: {}, openGroups: {} });
  useIssuesStore.setState({ selectedIssue: {} });
  useActionsStore.setState({ selectedRun: {}, selectedJob: {}, collapsedWorkflows: {} });
});

/** Registers `bilo-io/midnite-studio` → `repo-1`, so `PR_URL` resolves to an in-app route. */
function registerRepo1(): void {
  useRepoForgeRegistry.setState({
    byForgeKey: { [forgeRegistryKey('github.com', 'bilo-io', 'midnite-studio')]: 'repo-1' },
  });
}

describe('openInMidnite', () => {
  it('opens an https URL in a browser tab and never reaches openExternal', () => {
    openInMidnite('https://example.com/a');

    const { tabs, activeTabId } = useBrowserStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.url).toBe('https://example.com/a');
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

  it('a forced target bypasses in-app-route resolution entirely', () => {
    registerRepo1();
    openInMidnite(PR_URL, { target: 'in-app' });

    // Landed as a tab, not a Reviews navigation.
    expect(useBrowserStore.getState().tabs[0]?.url).toBe(PR_URL);
    expect(useUiStore.getState().activeView).not.toBe('reviews');
  });

  it('reads the stored preference when no target is given and no route matches', () => {
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

  describe('preferInAppRoute', () => {
    it('off by default: a URL with a registered route still opens a tab', () => {
      registerRepo1();
      openInMidnite(PR_URL);

      expect(useBrowserStore.getState().tabs[0]?.url).toBe(PR_URL);
      expect(useUiStore.getState().activeView).not.toBe('reviews');
    });

    it('on: navigates to the native view instead of opening a tab', () => {
      registerRepo1();
      openInMidnite(PR_URL, { preferInAppRoute: true });

      expect(useBrowserStore.getState().tabs).toHaveLength(0);
      expect(useUiStore.getState().selectedRepoId).toBe('repo-1');
      expect(useUiStore.getState().activeView).toBe('reviews');
      expect(useReviewsStore.getState().selectedPull['repo-1']).toBe(42);
    });

    it('on, but no route matches: falls back to the stored preference', () => {
      openInMidnite('https://example.com', { preferInAppRoute: true });

      expect(useBrowserStore.getState().tabs[0]?.url).toBe('https://example.com/');
    });
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

describe('navigateInAppRoute', () => {
  it('reviews: selects the repo, the pull, and the Reviews view', () => {
    navigateInAppRoute({ view: 'reviews', repoId: 'repo-1', pull: 7 });

    expect(useUiStore.getState().selectedRepoId).toBe('repo-1');
    expect(useReviewsStore.getState().selectedPull['repo-1']).toBe(7);
    expect(useUiStore.getState().activeView).toBe('reviews');
  });

  it('issues: selects the repo, the issue, and the Issues view', () => {
    navigateInAppRoute({ view: 'issues', repoId: 'repo-1', issue: 9 });

    expect(useIssuesStore.getState().selectedIssue['repo-1']).toBe(9);
    expect(useUiStore.getState().activeView).toBe('issues');
  });

  it('actions: selects the repo, the run, and the Actions view', () => {
    navigateInAppRoute({ view: 'actions', repoId: 'repo-1', runId: 'run-1' });

    expect(useActionsStore.getState().selectedRun['repo-1']).toBe('run-1');
    expect(useUiStore.getState().activeView).toBe('actions');
  });

  it('graph: selects the repo and the Graph view, and nothing else', () => {
    navigateInAppRoute({ view: 'graph', repoId: 'repo-1' });

    expect(useUiStore.getState().selectedRepoId).toBe('repo-1');
    expect(useUiStore.getState().activeView).toBe('graph');
  });
});

describe('resolveDestination — the modifier matrix', () => {
  const opts = (preference: 'in-app' | 'system', preferInAppRoute = false) => ({
    preference,
    preferInAppRoute,
  });

  it.each([
    // Mod/Ctrl and Shift: always the system browser, regardless of preference.
    ['meta', click({ metaKey: true })],
    ['ctrl', click({ ctrlKey: true })],
    ['shift', click({ shiftKey: true })],
    ['meta+shift', click({ metaKey: true, shiftKey: true })],
  ])('%s → system, for either preference', (_name, event) => {
    expect(resolveDestination('https://example.com', event, opts('in-app'))).toEqual({
      kind: 'system',
    });
    expect(resolveDestination('https://example.com', event, opts('system'))).toEqual({
      kind: 'system',
    });
  });

  it('alt → embedded, regardless of preference', () => {
    expect(resolveDestination('https://example.com', click({ altKey: true }), opts('in-app'))).toEqual({
      kind: 'embedded',
    });
    expect(resolveDestination('https://example.com', click({ altKey: true }), opts('system'))).toEqual({
      kind: 'embedded',
    });
  });

  it('alt beats a matching in-app route: the forced embedded browser wins', () => {
    registerRepo1();
    expect(
      resolveDestination(PR_URL, click({ altKey: true }), opts('in-app', true)),
    ).toEqual({ kind: 'embedded' });
  });

  it('mod beats a matching in-app route too', () => {
    registerRepo1();
    expect(
      resolveDestination(PR_URL, click({ metaKey: true }), opts('in-app', true)),
    ).toEqual({ kind: 'system' });
  });

  it('middle-click → the preference, never a route, even when one matches', () => {
    registerRepo1();
    expect(
      resolveDestination(PR_URL, click({ button: 1 }), opts('in-app', true)),
    ).toEqual({ kind: 'embedded' });
    expect(
      resolveDestination(PR_URL, click({ button: 1 }), opts('system', true)),
    ).toEqual({ kind: 'system' });
  });

  it('plain click, preferInAppRoute off: honours the preference', () => {
    expect(resolveDestination('https://example.com', click(), opts('in-app'))).toEqual({
      kind: 'embedded',
    });
    expect(resolveDestination('https://example.com', click(), opts('system'))).toEqual({
      kind: 'system',
    });
  });

  it('plain click, preferInAppRoute on, a route matches: the route wins over either preference', () => {
    registerRepo1();
    const expected = {
      kind: 'in-app-route',
      route: { view: 'reviews', repoId: 'repo-1', pull: 42 },
    };
    expect(resolveDestination(PR_URL, click(), opts('in-app', true))).toEqual(expected);
    expect(resolveDestination(PR_URL, click(), opts('system', true))).toEqual(expected);
  });

  it('plain click, preferInAppRoute on, no route matches: falls back to the preference', () => {
    expect(resolveDestination('https://example.com', click(), opts('system', true))).toEqual({
      kind: 'system',
    });
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

  it('routes a meta-click to the system browser regardless of the preference', () => {
    useUiStore.setState({ linkTarget: 'system' });
    openLinkFromEvent('https://example.com', click({ metaKey: true }));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('routes a ctrl-click to the system browser', () => {
    openLinkFromEvent('https://example.com', click({ ctrlKey: true }));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('routes an alt-click to the embedded browser, even over a matching in-app route', () => {
    registerRepo1();
    openLinkFromEvent(PR_URL, click({ altKey: true }), { preferInAppRoute: true });

    expect(useBrowserStore.getState().tabs[0]?.url).toBe(PR_URL);
    expect(useUiStore.getState().activeView).not.toBe('reviews');
  });

  it('routes a middle-click into a background tab', () => {
    const first = useBrowserStore.getState().openTab('https://one.example');
    openLinkFromEvent('https://two.example', click({ button: 1 }));
    expect(useBrowserStore.getState().activeTabId).toBe(first);
  });

  it('a plain click with preferInAppRoute navigates to the native view', () => {
    registerRepo1();
    openLinkFromEvent(PR_URL, click(), { originRepoId: 'repo-1', preferInAppRoute: true });

    expect(useUiStore.getState().activeView).toBe('reviews');
    expect(useReviewsStore.getState().selectedPull['repo-1']).toBe(42);
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('a plain click without preferInAppRoute ignores a matching route', () => {
    registerRepo1();
    openLinkFromEvent(PR_URL, click(), { originRepoId: 'repo-1' });

    expect(useUiStore.getState().activeView).not.toBe('reviews');
    expect(useBrowserStore.getState().tabs[0]?.url).toBe(PR_URL);
  });
});
