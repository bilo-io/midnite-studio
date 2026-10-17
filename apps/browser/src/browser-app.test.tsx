// vitest/jsdom: the composition over a mock bridge — tabs, toolbar, rail, menus and the agent strip are all
// DOM; the native views behind them are the bridge's, which a stub answers. No real browser is needed.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBrowserStore } from '@midnite/studio-feature-browser/renderer';

import { agentSessionStore } from './agent-session-store';
import { BrowserApp } from './browser-app';
import { browserUiStore, createBrowserUiStore } from './browser-ui-store';

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
  window.midniteStudio = {
    browser: namespace(calls, 'browser'),
    webApps: namespace(calls, 'webApps'),
    clipboard: namespace(calls, 'clipboard'),
    menu: namespace(calls, 'menu'),
  } as unknown as typeof window.midniteStudio;
  useBrowserStore.setState({ tabs: [], activeTabId: null } as never);
  browserUiStore.setState({ enabledWebApps: [], webAppsFlyoutAppId: null, lastOpenedWebAppId: null, occluders: 0 });
  agentSessionStore.setState({ active: false, status: 'idle', logs: [], goal: undefined, lastAction: undefined });
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

  it('runs the agent session strip: start with a goal, step, take over', async () => {
    render(<BrowserApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Agent Session' }));
    const goal = await screen.findByRole('textbox', { name: 'What should the agent do?' });
    fireEvent.change(goal, { target: { value: 'Check the sign-up form' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const strip = await screen.findByRole('region', { name: 'Agent Driving Session' });
    expect(within(strip).getByText('AGENT DRIVING')).toBeTruthy();
    expect(within(strip).getByText('Goal: Check the sign-up form')).toBeTruthy();

    fireEvent.click(within(strip).getByRole('button', { name: 'Step' }));
    expect(agentSessionStore.getState().logs).toHaveLength(2);

    fireEvent.click(within(strip).getByRole('button', { name: 'Take Over' }));
    expect(screen.queryByRole('region', { name: 'Agent Driving Session' })).toBeNull();
    expect(agentSessionStore.getState().active).toBe(false);
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
