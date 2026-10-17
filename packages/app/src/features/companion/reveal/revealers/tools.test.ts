import { beforeEach, describe, expect, it } from 'vitest';

import { useBrowserStore } from '../../../../store/browser-store';
import { useDatabaseConnectionsStore, useWorkbenchStore } from '@midnite/studio-feature-database/renderer';
import { useUiStore } from '../../../../store/ui-store';
import { TOOLS_REVEALERS } from './tools';

const ctx = { caller: 'companion', focusedWindow: false } as const;

beforeEach(() => {
  useWorkbenchStore.setState({ tabs: [], activeQueryTabId: null });
  useBrowserStore.setState({ tabs: [], activeTabId: null });
  useDatabaseConnectionsStore.setState({
    status: 'ready',
    selectedConnectionId: null,
    connections: [{ id: 'c1', name: 'Main', provider: 'postgres' } as never],
  });
  document.body.innerHTML = '';
});

describe('dbTable', () => {
  it('selects the connection and opens a preview tab without running it', async () => {
    const out = await TOOLS_REVEALERS.dbTable.reveal({ kind: 'dbTable', connectionId: 'c1', table: 'public.users' }, ctx);
    expect(out.ok).toBe(true);
    expect(useDatabaseConnectionsStore.getState().selectedConnectionId).toBe('c1');
    const [tab] = useWorkbenchStore.getState().tabs;
    expect(tab?.sql).toBe('SELECT * FROM "public"."users" LIMIT 200');
  });

  it('refocuses the same table tab instead of stacking another', async () => {
    const ref = { kind: 'dbTable', connectionId: 'c1', table: 'users' } as const;
    await TOOLS_REVEALERS.dbTable.reveal(ref, ctx);
    await TOOLS_REVEALERS.dbTable.reveal(ref, ctx);
    expect(useWorkbenchStore.getState().tabs).toHaveLength(1);
  });

  it('is not-found for an unknown connection', async () => {
    expect(await TOOLS_REVEALERS.dbTable.reveal({ kind: 'dbTable', connectionId: 'zz' }, ctx)).toMatchObject({ ok: false, reason: 'not-found' });
  });
});

describe('browserTab', () => {
  it('opens a tab for a new url and focuses an existing one', async () => {
    const ref = { kind: 'browserTab', url: 'https://example.com/' } as const;
    await TOOLS_REVEALERS.browserTab.reveal(ref, ctx);
    useBrowserStore.getState().openTab('https://other.dev/');
    await TOOLS_REVEALERS.browserTab.reveal({ kind: 'browserTab', url: 'https://example.com' }, ctx);
    const { tabs, activeTabId } = useBrowserStore.getState();
    expect(tabs).toHaveLength(2);
    expect(activeTabId).toBe(tabs[0]?.id);
    expect(useUiStore.getState().browserOpen).toBe(true);
  });

  it('has no view — it is a panel', () => {
    expect(TOOLS_REVEALERS.browserTab.view).toBeNull();
  });
});

describe('setting', () => {
  it('selects the page, then scrolls to and highlights the section', async () => {
    document.body.innerHTML = '<div data-settings-section="memory"><button aria-expanded="false"></button></div>';
    const out = await TOOLS_REVEALERS.setting.reveal({ kind: 'setting', page: 'terminal', section: 'memory' }, ctx);
    expect(out).toMatchObject({ ok: true });
    expect(useUiStore.getState().settingsPage).toBe('terminal');
    expect(document.querySelector('[data-settings-section="memory"]')?.classList.contains('settings-section-highlight')).toBe(true);
  });

  it('still lands on the page, and says so, when the section cannot be found', async () => {
    const out = await TOOLS_REVEALERS.setting.reveal({ kind: 'setting', page: 'terminal', section: 'no-such' }, ctx);
    expect(out).toMatchObject({ ok: true });
    expect(out.ok && out.say).toMatch(/couldn't pick out/);
  });
});
