import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { OllamaSettings } from '@midnite/studio-shared';

/**
 * Ollama's persisted config (Phase 96 Theme C) — the host override and the
 * default-model pre-fill. JSON under `userData`, following
 * `video/projects-store.ts`'s shape (itself following `councils-store.ts`),
 * scaled down to the two fields this domain persists.
 *
 * `resolveOllamaBaseUrl` (Theme B, `ollama/client.ts`) stays a pure,
 * env-only function with its own unit tests untouched — this store is a
 * separate, higher-priority source the IPC handlers and the pull queue
 * consult first via `getConfiguredOllamaHost()`, not a change to that
 * function's contract.
 */
const FILE_NAME = 'ollama-settings.json';

export type OllamaSettingsStore = {
  load: () => Promise<OllamaSettings>;
  save: (settings: OllamaSettings) => Promise<void>;
};

type StoredState = { version: 1; host: string | null; defaultModel: string | null };

export function createOllamaSettingsStore(directory: string): OllamaSettingsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        // Missing (first launch) or unreadable/corrupt — nothing configured yet.
        return { host: null, defaultModel: null };
      }
      return parseStoredSettings(raw);
    },

    save: async (settings) => {
      const state: StoredState = {
        version: 1,
        host: settings.host,
        defaultModel: settings.defaultModel,
      };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; the session still
        // works, it just won't be remembered.
      }
    },
  };
}

/** Exported for the store's own tests. A non-string field is treated as unset, never thrown. */
export function parseStoredSettings(value: unknown): OllamaSettings {
  if (typeof value !== 'object' || value === null) return { host: null, defaultModel: null };
  const record = value as { host?: unknown; defaultModel?: unknown };
  return {
    host: typeof record.host === 'string' ? record.host : null,
    defaultModel: typeof record.defaultModel === 'string' ? record.defaultModel : null,
  };
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullOllamaSettingsStore: OllamaSettingsStore = {
  load: async () => ({ host: null, defaultModel: null }),
  save: async () => {},
};
