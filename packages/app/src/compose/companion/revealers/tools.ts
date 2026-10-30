import { resourceRefLabel, type SettingsPageId } from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { apiTabId, useApiClientStore } from '@midnite/studio-feature-api-client/renderer';
import { useBrowserStore } from '@midnite/studio-feature-browser/renderer/store';
import { openQueryTab, previewSql, useDatabaseConnectionsStore } from '@midnite/studio-feature-database/renderer';
import { useUiStore } from '../../../store/ui-store';
import { SETTINGS_SECTIONS } from '../../../features/settings/settings-sections';
import { liveNavigationState } from '@midnite/studio-feature-companion/renderer';
import type { FamilyRevealers, RevealOutcome } from '@midnite/studio-feature-companion/renderer';

/**
 * Tools + settings — Phase 112 Theme F. The engine has already switched repo
 * and view; these only select. Nothing here runs a query, sends a request,
 * or navigates a tab away from where it is.
 */
export type ToolsResourceKind = 'dbTable' | 'apiRequest' | 'browserTab' | 'setting';

const notFound = (say: string): RevealOutcome => ({ ok: false, reason: 'not-found', say });

/** How long a reveal's section ring stays on — matches `settings-section-flash` in `styles.css`. */
const HIGHLIGHT_MS = 1800;

/** `schema.table` → its parts; a bare name has no schema. */
function splitTable(table: string): { name: string; schema?: string } {
  const dot = table.indexOf('.');
  return dot === -1 ? { name: table } : { schema: table.slice(0, dot), name: table.slice(dot + 1) };
}

/** The same address, whatever a trailing slash or default port says. */
function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
}

/** The settings page's mounted anchor for `section`, once the page has rendered. */
async function findSectionAnchor(section: string): Promise<HTMLElement | null> {
  const selector = `[data-settings-section="${section}"]`;
  // The settings view and its page may be lazy chunks; poll for them rather than assume they are
  // mounted. Timers, not animation frames — a hidden window never fires a frame.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return found;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

/** Scroll to a section, open it if it is collapsed, and ring it briefly. */
async function showSection(page: SettingsPageId, section: string): Promise<boolean> {
  if (!SETTINGS_SECTIONS[page].some((s) => s.id === section)) return false;
  const anchor = await findSectionAnchor(section);
  if (!anchor) return false;
  const header = anchor.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
  header?.click();
  anchor.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  anchor.classList.add('settings-section-highlight');
  setTimeout(() => anchor.classList.remove('settings-section-highlight'), HIGHLIGHT_MS);
  return true;
}

export const TOOLS_REVEALERS: FamilyRevealers<ToolsResourceKind> = {
  dbTable: {
    view: 'database',
    reveal: async (ref) => {
      const connections = useDatabaseConnectionsStore.getState();
      if (connections.status === 'idle') await connections.load();
      const connection = useDatabaseConnectionsStore.getState().connections.find((c) => c.id === ref.connectionId);
      if (!connection) return notFound("I couldn't find that database connection.");
      useDatabaseConnectionsStore.getState().select(connection.id);
      if (ref.table === undefined) return { ok: true, did: 'revealed', label: resourceRefLabel(ref, { [`dbTable:${ref.connectionId}`]: connection.name }) };
      // The tab's identity is connection + label, so reopening a table refocuses its preview tab. The
      // statement is only placed in the editor — a reveal never runs it.
      const table = splitTable(ref.table);
      openQueryTab({ connectionId: connection.id, label: ref.table, sql: previewSql(connection.provider, { ...table, kind: 'table', columns: [] }) });
      return { ok: true, did: 'revealed', label: resourceRefLabel(ref) };
    },
  },
  apiRequest: {
    view: 'apiClient',
    reveal: async (ref) => {
      const state = useApiClientStore.getState();
      if (state.collectionsRepoId !== ref.repoId) await state.loadCollections(ref.repoId);
      const itemPath = ref.itemPath.split('/').filter((segment) => segment !== '');
      const summary = useApiClientStore.getState().collections.find((c) => c.id === ref.collectionId);
      let items = summary?.collection.item ?? [];
      let item = undefined as (typeof items)[number] | undefined;
      for (const segment of itemPath) {
        item = items.find((candidate) => candidate.name === segment);
        if (!item) break;
        items = item.item ?? [];
      }
      if (!summary || !item) return notFound("I couldn't find that request.");
      const id = apiTabId({ repoId: ref.repoId, collectionId: ref.collectionId, itemPath });
      const api = useApiClientStore.getState();
      // `openTab` focuses an open tab without touching its draft, and otherwise opens one — it never sends.
      if (api.tabs.some((tab) => tab.id === id)) api.focusTab(id);
      else api.openTab({ repoId: ref.repoId, collectionId: ref.collectionId, itemPath, item });
      return { ok: true, did: 'revealed', label: resourceRefLabel(ref, { [`apiRequest:${ref.itemPath}`]: item.name }) };
    },
  },
  // The browser is a panel, not a view (Phase 81 Theme B) — no view switch, so the revealer shows
  // the panel itself (or brings its own window forward).
  browserTab: {
    view: null,
    reveal: async (ref) => {
      if (liveNavigationState().panelDetached.browser) bridge()?.window.focusRole({ role: 'browser' });
      else useUiStore.getState().setBrowserOpen(true);
      const browser = useBrowserStore.getState();
      const existing = browser.tabs.find((tab) => tab.url !== '' && sameUrl(tab.url, ref.url));
      if (existing) browser.activateTab(existing.id);
      else browser.openTab(ref.url);
      return { ok: true, did: 'revealed', label: resourceRefLabel(ref) };
    },
  },
  setting: {
    view: 'settings',
    reveal: async (ref) => {
      useUiStore.getState().setSettingsPage(ref.page);
      const label = resourceRefLabel(ref);
      if (ref.section === undefined) return { ok: true, did: 'revealed', label };
      if (await showSection(ref.page, ref.section)) return { ok: true, did: 'revealed', label };
      // The page is open, only the section could not be picked out — say so rather than fail.
      return { ok: true, did: 'revealed', label: resourceRefLabel({ kind: 'setting', page: ref.page }), say: `Here are the ${resourceRefLabel({ kind: 'setting', page: ref.page })} — I couldn't pick out that section.` };
    },
  },
};
