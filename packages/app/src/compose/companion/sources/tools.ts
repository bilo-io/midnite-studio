import type { ApiCollectionSummary, PostmanItem, SchemaTree } from '@midnite/studio-shared';

import { bridge } from '../../../../services/bridge';
import { keys } from '../../../../services/queries';
import { useApiClientStore } from '@midnite/studio-feature-api-client/renderer';
import { useBrowserStore } from '@midnite/studio-feature-browser/renderer/store';
import { useDatabaseConnectionsStore } from '@midnite/studio-feature-database/renderer';
import { SETTINGS_PAGES } from '../../../../store/ui-store';
import { SETTINGS_SECTIONS } from '../../../settings/settings-sections';
import type { ResourceCandidate, ResourceSource } from '../resolve';
import { cachedOne } from './util';

/**
 * Tools + settings sources. Database tables come only from schema trees a
 * connection's tree already introspected — a find never connects to a
 * database. Settings are a static table, so they always answer.
 */

const databases: ResourceSource = {
  id: 'databases',
  kinds: ['dbTable'],
  load: async () => {
    const store = useDatabaseConnectionsStore.getState();
    // The list is main's own config file, not a database — loading it is cheap.
    if (store.status === 'idle') await store.load();
    const out: ResourceCandidate[] = [];
    for (const connection of useDatabaseConnectionsStore.getState().connections) {
      out.push({
        ref: { kind: 'dbTable', connectionId: connection.id },
        title: connection.name,
        detail: `${connection.provider} connection`,
        keywords: connection.database,
      });
      for (const table of cachedOne<SchemaTree>(keys.dbSchema(connection.id))?.tables ?? []) {
        const name = table.schema ? `${table.schema}.${table.name}` : table.name;
        out.push({
          ref: { kind: 'dbTable', connectionId: connection.id, table: name },
          title: table.name,
          detail: `${table.kind} in ${connection.name}`,
          keywords: name,
        });
      }
    }
    return out;
  },
};

/** Every request in a collection, with its folder path — the shape `apiRequest` refs carry. */
function walkRequests(items: readonly PostmanItem[], parents: readonly string[], visit: (item: PostmanItem, path: string[]) => void): void {
  for (const item of items) {
    const path = [...parents, item.name];
    if (item.request) visit(item, path);
    if (item.item) walkRequests(item.item, path, visit);
  }
}

const apiRequests: ResourceSource = {
  id: 'api-requests',
  kinds: ['apiRequest'],
  load: async (q) => {
    if (q.repoId === null) return [];
    const repoId = q.repoId;
    const store = useApiClientStore.getState();
    let collections: readonly ApiCollectionSummary[] = store.collectionsRepoId === repoId ? store.collections : [];
    if (store.collectionsRepoId !== repoId) {
      // Read, never load into the store: a find must not swap the API client's open collections.
      const listed = await bridge()?.apiClient.listCollections({ repoId });
      if (listed?.ok) collections = listed.value;
    }
    const out: ResourceCandidate[] = [];
    for (const summary of collections) {
      walkRequests(summary.collection.item, [], (item, path) => {
        const url = typeof item.request?.url === 'string' ? item.request.url : (item.request?.url.raw ?? '');
        out.push({
          ref: { kind: 'apiRequest', repoId, collectionId: summary.id, itemPath: path.join('/') },
          title: item.name,
          detail: `${item.request?.method ?? 'request'} · ${summary.collection.info.name}`,
          keywords: `${path.join(' ')} ${url}`.toLowerCase(),
        });
      });
    }
    return out;
  },
};

function validUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const browserTabs: ResourceSource = {
  id: 'browser-tabs',
  kinds: ['browserTab'],
  load: async () =>
    useBrowserStore.getState().tabs.flatMap((tab) => {
      const host = validUrl(tab.url);
      if (host === null) return [];
      return [{ ref: { kind: 'browserTab' as const, url: tab.url }, title: tab.title || host, detail: `browser tab · ${host}`, keywords: tab.url.toLowerCase() }];
    }),
};

const settings: ResourceSource = {
  id: 'settings',
  kinds: ['setting'],
  load: async () => {
    const out: ResourceCandidate[] = [];
    for (const page of SETTINGS_PAGES) {
      out.push({ ref: { kind: 'setting', page: page.id }, title: `${page.label} settings`, detail: 'settings page', keywords: `${page.id} ${page.group}`.toLowerCase() });
      for (const section of SETTINGS_SECTIONS[page.id]) {
        out.push({
          ref: { kind: 'setting', page: page.id, section: section.id },
          title: `${page.label} settings — ${section.label}`,
          detail: `${page.label} settings section`,
          keywords: section.keywords.join(' ').toLowerCase(),
        });
      }
    }
    return out;
  },
};

export const TOOLS_SOURCES: readonly ResourceSource[] = [databases, apiRequests, browserTabs, settings];
