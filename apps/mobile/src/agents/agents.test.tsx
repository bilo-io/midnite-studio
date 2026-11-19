// vitest/jsdom: the provider registry, the Agents tab and the More tab over the real provider tree (Phase 146 J).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setParams } from '../../test/mocks/expo-router';
import { store } from '../../test/mocks/expo-secure-store';
import { failNextOpen, openedBrowsers } from '../../test/mocks/expo-web-browser';
import { renderInShell, resetShellState } from '../../test/shell-harness';
import { MoreScreen, REPORT_ISSUE_URL } from '../more/more-screen';
import { parseScopes } from '../more/token-scopes';
import { usePrefs } from '../state/prefs';
import { AgentsScreen } from './agents-screen';
import { AGENT_PROVIDERS, orderProviders } from './providers';

beforeEach(() => {
  openedBrowsers.length = 0;
  setParams({});
  resetShellState();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('registry', () => {
  it('has unique ids and https urls', () => {
    const ids = AGENT_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of AGENT_PROVIDERS) expect(new URL(p.url).protocol).toBe('https:');
  });
  it('puts the last-used provider first', () => {
    expect(orderProviders('gemini')[0]!.id).toBe('gemini');
    expect(orderProviders('gemini')).toHaveLength(AGENT_PROVIDERS.length);
    expect(orderProviders('nope')[0]!.id).toBe(AGENT_PROVIDERS[0]!.id);
  });
});

describe('Agents tab', () => {
  it('opens a provider in the in-app browser, records it and badges it', async () => {
    await renderInShell(<AgentsScreen />);
    fireEvent.click(screen.getByLabelText('Open Codex'));
    await waitFor(() => expect(openedBrowsers).toHaveLength(1));
    expect(openedBrowsers[0]!.url).toBe('https://chatgpt.com/codex');
    expect(openedBrowsers[0]!.options).toMatchObject({ presentationStyle: 'fullScreen', dismissButtonStyle: 'close' });
    expect(usePrefs.getState().lastProvider).toBe('codex');
    await waitFor(() => expect(screen.getByText('Last used')).toBeTruthy());
  });
  it('shows the sign-in hint until dismissed', async () => {
    await renderInShell(<AgentsScreen />);
    expect(screen.getByTestId('agent-hint')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dismiss hint'));
    await waitFor(() => expect(screen.queryByTestId('agent-hint')).toBeNull());
    expect(usePrefs.getState().seenAgentHint).toBe(true);
  });
  it('opens ?open=<provider> on arrival and ignores an unknown id', async () => {
    setParams({ open: 'jules' });
    await renderInShell(<AgentsScreen />);
    await waitFor(() => expect(openedBrowsers.map((o) => o.url)).toEqual(['https://jules.google.com']));
    cleanup();
    openedBrowsers.length = 0;
    setParams({ open: 'bogus' });
    await renderInShell(<AgentsScreen />);
    expect(openedBrowsers).toHaveLength(0);
  });
  it('shows a banner when the browser cannot open', async () => {
    await renderInShell(<AgentsScreen />);
    failNextOpen();
    fireEvent.click(screen.getByLabelText('Open Gemini'));
    expect((await screen.findByTestId('agent-open-error')).textContent).toBe("Couldn't open Gemini");
  });
});

describe('More tab', () => {
  const source = { viewer: async () => ({ ok: true, value: { login: 'octo', name: 'Octo Cat', avatarUrl: null } }) };

  it('shows the account, scopes and about rows, and opens the issue repo in the browser', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { headers: { 'x-oauth-scopes': 'repo, read:project' } }));
    await renderInShell(<MoreScreen />, source);
    expect(await screen.findByText('@octo')).toBeTruthy();
    expect(await screen.findByText('repo, read:project')).toBeTruthy();
    expect(screen.getByText('1.2.3')).toBeTruthy();
    fireEvent.click(screen.getByText('Report an issue'));
    await waitFor(() => expect(openedBrowsers[0]?.url).toBe(REPORT_ISSUE_URL));
  });
  it('writes the theme preference', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'));
    await renderInShell(<MoreScreen />, source);
    fireEvent.click(screen.getByText('Dark'));
    expect(usePrefs.getState().theme).toBe('dark');
  });
  it('signs out, clearing the keychain entry', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'));
    await renderInShell(<MoreScreen />, source);
    fireEvent.click(screen.getByLabelText('Sign out'));
    await waitFor(() => expect(store.has('github:github.com:octo')).toBe(false));
  });
});

describe('parseScopes', () => {
  it('splits a classic header and treats none as fine-grained', () => {
    expect(parseScopes('repo, read:org')).toEqual({ kind: 'scopes', scopes: ['repo', 'read:org'] });
    expect(parseScopes('')).toEqual({ kind: 'none' });
    expect(parseScopes(null)).toEqual({ kind: 'none' });
  });
});
