import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ConnectionConfigSchema, type ConnectionConfig } from '@midnite/studio-shared';

/**
 * The saved database connections — every field except the password (see
 * `ConnectionConfig`'s own doc comment for why that never lands here).
 *
 * Modelled on [`diagnostics/trust-store.ts`](../diagnostics/trust-store.ts)
 * rather than `repo-store.ts` — it is the closer template: a keyed map
 * (`{version: 1, connections: Record<string, ConnectionConfig>}`), a lazy
 * in-memory cache, and a `createConnectionsStore(directory: string)` factory
 * taking a plain string so this module carries no `electron` import and stays
 * testable against a temp dir.
 *
 * **Validated with real zod, not a hand-rolled guard.** `trust-store.ts`
 * states the rule: hand-rolled is fine for main-only trivia, zod once the
 * value is shared with the renderer or becomes an argument vector. A
 * connection record is both — it crosses IPC whole and its host/port/database
 * end up in a driver's connection options.
 *
 * **Writes are not atomic in this codebase** (`repo-store.ts` is a plain
 * `writeFile`; nothing here reaches for `rename`). This module does not
 * introduce atomicity either — a crash mid-write can still leave a partial
 * file, exactly as every other store here can.
 */
export type ConnectionsStore = {
  list: () => Promise<ConnectionConfig[]>;
  get: (id: string) => Promise<ConnectionConfig | null>;
  save: (config: ConnectionConfig) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

type StoredState = { version: 1; connections: Record<string, ConnectionConfig> };

const FILE_NAME = 'db-connections.json';

export function createConnectionsStore(directory: string): ConnectionsStore {
  const file = join(directory, FILE_NAME);
  let cache: Record<string, ConnectionConfig> | null = null;

  const load = async (): Promise<Record<string, ConnectionConfig>> => {
    if (cache) return cache;
    try {
      cache = parseConnectionsState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      // Missing (first launch) or corrupt. Starting empty is the safe
      // direction: the cost is re-entering connections, not connecting to
      // somewhere nobody configured.
      cache = {};
    }
    return cache;
  };

  const persist = async (connections: Record<string, ConnectionConfig>): Promise<void> => {
    const state: StoredState = { version: 1, connections };
    try {
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only data dir must not take the app down. The connection
      // holds for this session and is asked for again next launch.
    }
  };

  return {
    list: async () => Object.values(await load()),
    get: async (id) => (await load())[id] ?? null,
    save: async (config) => {
      const connections = await load();
      connections[config.id] = config;
      await persist(connections);
    },
    delete: async (id) => {
      const connections = await load();
      delete connections[id];
      await persist(connections);
    },
  };
}

/**
 * Validate a parsed `db-connections.json`. Total, and strict: a record whose
 * shape does not parse is dropped rather than half-kept, and a record whose
 * `id` key does not match its own `id` field is dropped too — a mismatch
 * there is not a shape this store can have written itself.
 */
export function parseConnectionsState(value: unknown): Record<string, ConnectionConfig> {
  if (typeof value !== 'object' || value === null) return {};
  const connections = (value as { connections?: unknown }).connections;
  if (typeof connections !== 'object' || connections === null) return {};

  const out: Record<string, ConnectionConfig> = {};
  for (const [id, raw] of Object.entries(connections as Record<string, unknown>)) {
    const parsed = ConnectionConfigSchema.safeParse(raw);
    if (parsed.success && parsed.data.id === id) out[id] = parsed.data;
  }
  return out;
}

/** Remembers no connections — the fallback before one is configured. */
export const nullConnectionsStore: ConnectionsStore = {
  list: async () => [],
  get: async () => null,
  save: async () => {},
  delete: async () => {},
};
