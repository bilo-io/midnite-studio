// vitest/jsdom: the composition over a mock bridge — tabs, toolbar, rail, menus and the agent strip are all
// DOM; the native views behind them are the bridge's, which a stub answers. No real browser is needed.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBrowserStore } from '@midnite/studio-feature-browser/renderer';

import { agentSessionStore } from './agent-session-store';
import { BrowserApp } from './browser-app';
import { browserUiStore, createBrowserUiStore } from './browser-ui-store';

/** Report an Issue's slice of the bridge: only `onOpen` is read until the dialog opens (the feature's own tests cover the rest). */
let openReport: (() => void) | null = null;
const REPORT_BRIDGE = {
  onOpen: vi.fn((handler: () => void) => {
    openReport = handler;
    return () => undefined;
  }),
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
  bundle: vi.fn(async () => ({ text: '' })),
};

/** Every bridge method answers: `on*` subscribes (returning its unsubscribe), the rest resolve `ok`. */
function namespace(calls: string[], name: string) {
  return new Proxy(
    {},
    {
      get: (_target, method: string) =>
        method.startsWith('on')
          ? () => () => undefined
          : (...args: unknown[]) => {
              calls.push(`${name}.${method}`);
              void args;
              return Promise.resolve({ ok: true });
            },
    },
  );
}

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  window.midniteStudio = { report: REPORT_BRIDGE,
    browser: namespace(calls, 'browser'),
    webApps: namespace(calls, 'webApps'),
    clipboard: namespace(calls, 'clipboard'),
    menu: namespace(calls, 'menu'),
  } as unknown as typeof window.midniteStudio;
  useBrowserStore.setState({ tabs: [], activeTabId: null } as never);
  browserUiStore.setState({ enabledWebApps: [], webAppsFlyoutAppId: null, lastOpenedWebAppId: null, occluders: 0 });
  agentSessionStore.setState({ session: null, notice: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrowserApp', () => {
  it('is the feature pane, full-window: tab strip and toolbar, opened on one tab', async () => {
    render(<BrowserApp />);

    expect(screen.getByRole('dialog', { name: 'Browser' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Address' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New tab' })).toBeTruthy();
    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(1));
  });

  it('is framed as Midnite Browser by the suite shell: name, a Browse rail row, Settings with the suite pages', async () => {
    render(<BrowserApp />);

    expect(screen.getAllByText('Midnite Browser').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'Browse' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = await screen.findByTestId('suite-settings');
    expect(within(settings).getAllByText('Appearance').length).toBeGreaterThan(0);
    // The DOM Settings view sits over the native views, so it counts as an occluder while open.
    expect(browserUiStore.getState().occluders).toBeGreaterThan(0);
  });

  it('offers nothing that only makes sense inside Studio: no layout picker, no close, no detach', () => {
    render(<BrowserApp />);

    expect(screen.queryByRole('group', { name: 'Browser layout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close browser' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Detach/ })).toBeNull();
  });

  it('turns a web app on from the menu, shows it on the rail, and gives it the page', async () => {
    render(<BrowserApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Web apps' }));
    fireEvent.click(await screen.findByText('Turn on Spotify'));
    expect(browserUiStore.getState().enabledWebApps).toEqual(['spotify']);

    const rail = screen.getByRole('group', { name: 'Apps' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Open Spotify' }));

    const view = await screen.findByTestId('web-app-view');
    expect(within(view).getByText('Spotify')).toBeTruthy();
    expect(calls).toContain('webApps.enable');

    fireEvent.click(within(view).getByRole('button', { name: 'Close Spotify' }));
    expect(screen.queryByTestId('web-app-view')).toBeNull();
  });

  it('starts an agent session on the page on screen, limited to its origin, asks through the strip, and lets the user take over', async () => {
    const browser = window.midniteStudio!.browser as unknown as Record<string, unknown>;
    let emit: ((event: unknown) => void) | null = null;
    const state = {
      sessionId: 's1',
      tabId: 'tab-1',
      goal: 'Check the sign-up form',
      allowlist: ['https://docs.example'],
      status: 'running' as const,
      pending: null,
      log: ['[start] Check the sign-up form'],
    };
    const agentStart = vi.fn(async () => ({ ok: true, state }));
    const agentRespond = vi.fn();
    const agentStop = vi.fn();
    window.midniteStudio!.browser = new Proxy(browser, {
      get: (target, key: string) =>
        key === 'agentStart'
          ? agentStart
          : key === 'agentRespond'
            ? agentRespond
            : key === 'agentStop'
              ? agentStop
              : key === 'onEvent'
                ? (handler: (event: unknown) => void) => ((emit = handler), () => undefined)
                : target[key],
    }) as never;
    useBrowserStore.setState({
      tabs: [{ id: 'tab-1', kind: 'page', url: 'https://docs.example/signup', title: 'Sign up', loading: false, canGoBack: false, canGoForward: false }],
      activeTabId: 'tab-1',
    } as never);
    render(<BrowserApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Agent Session' }));
    const goal = await screen.findByRole('textbox', { name: 'What should the agent do?' });
    fireEvent.change(goal, { target: { value: 'Check the sign-up form' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const strip = await screen.findByRole('region', { name: 'Agent Driving Session' });
    expect(agentStart).toHaveBeenCalledWith({ tabId: 'tab-1', goal: 'Check the sign-up form', allowlist: ['https://docs.example'] });
    expect(within(strip).getByText('AGENT DRIVING')).toBeTruthy();
    expect(within(strip).getByText('Goal: Check the sign-up form')).toBeTruthy();
    expect(within(strip).getByText('· Only on docs.example')).toBeTruthy();

    // Main pauses the session on a navigation off the list; the strip asks.
    act(() =>
      emit?.({
        kind: 'agent-session',
        tabId: 'tab-1',
        state: { ...state, status: 'waiting-for-user', pending: { id: 'q1', reason: 'cross-origin', summary: 'The agent wants to open a site outside this session: https://evil.example.' } },
      }),
    );
    const ask = await screen.findByRole('alertdialog', { name: 'The agent needs you' });
    expect(within(ask).getByText('Leave the allowed sites?')).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: 'Deny' }));
    expect(agentRespond).toHaveBeenCalledWith({ sessionId: 's1', pendingId: 'q1', decision: 'deny' });

    fireEvent.click(within(strip).getByRole('button', { name: 'Take Over' }));
    expect(agentStop).toHaveBeenCalledWith({ sessionId: 's1' });
    expect(screen.queryByRole('region', { name: 'Agent Driving Session' })).toBeNull();
    expect(agentSessionStore.getState().session).toBeNull();
  });

  it('will not start an agent on the new-tab page: the agent works on the site you are on', async () => {
    render(<BrowserApp />);
    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Start Agent Session' }));
    expect(await screen.findByText('Open a page first — the agent works on the site you are on.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'What should the agent do?' })).toBeNull();
    expect(calls).not.toContain('browser.agentStart');
  });
});

describe('createBrowserUiStore', () => {
  function memoryStorage(seed: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(seed));
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => data.get(key) ?? null,
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => void data.delete(key),
      setItem: (key, value) => void data.set(key, value),
    };
  }

  it('drops an app id it does not know from a stored blob', () => {
    const storage = memoryStorage({
      'midnite-browser.ui': JSON.stringify({ enabledWebApps: ['youtube', 'myspace'], lastOpenedWebAppId: 'myspace' }),
    });
    const store = createBrowserUiStore(storage);
    expect(store.getState().enabledWebApps).toEqual(['youtube']);
    expect(store.getState().lastOpenedWebAppId).toBeNull();
  });

  it('puts the tabs back when the app on screen is turned off', () => {
    const store = createBrowserUiStore(memoryStorage());
    act(() => {
      store.getState().setWebAppEnabled('youtube', true);
      store.getState().openWebAppsFlyout('youtube');
      store.getState().setWebAppEnabled('youtube', false);
    });
    expect(store.getState().webAppsFlyoutAppId).toBeNull();
    expect(store.getState().lastOpenedWebAppId).toBe('youtube');
  });

  it('counts occluders and releases each one once', () => {
    const store = createBrowserUiStore(memoryStorage());
    const release = store.getState().addOccluder();
    store.getState().addOccluder();
    expect(store.getState().occluders).toBe(2);
    release();
    release();
    expect(store.getState().occluders).toBe(1);
  });
});

describe('Report an Issue', () => {
  it("mounts the report feature's host: main's report:open event opens its dialog", async () => {
    openReport = null;
    // The suite bridge already carries `report` (see beforeEach).
    render(<BrowserApp />);
    await waitFor(() => expect(openReport).not.toBeNull());
    act(() => openReport?.());
    expect(await screen.findByTestId('report-issue-dialog')).toBeDefined();
  });
});
