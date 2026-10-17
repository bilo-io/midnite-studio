import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DEFAULT_GAMES_SETTINGS, GamesSettingsSchema, type GamesSettings } from '@midnite/studio-shared';

/**
 * The Games location and defaults (Phase 107 Theme A) — one JSON file under
 * `userData`, shaped like `video/projects-store.ts`. Lives in main rather than
 * the renderer's ui-store because main validates and creates the folder, and
 * MCP needs the value with no window open.
 */
const FILE_NAME = 'games-settings.json';

export type GamesSettingsStore = {
  load: () => Promise<GamesSettings>;
  save: (settings: GamesSettings) => Promise<void>;
};

/** Tolerant: an unreadable or hand-broken file reads as the defaults, field by field. */
export function parseStoredGamesSettings(value: unknown): GamesSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_GAMES_SETTINGS };
  const whole = GamesSettingsSchema.safeParse(value);
  if (whole.success) return whole.data;
  const raw = value as Record<string, unknown>;
  const pick = <K extends keyof GamesSettings>(key: K): GamesSettings[K] => {
    const field = GamesSettingsSchema.shape[key].safeParse(raw[key]);
    return field.success ? (field.data as GamesSettings[K]) : DEFAULT_GAMES_SETTINGS[key];
  };
  return {
    version: 1,
    gamesRoot: pick('gamesRoot'),
    defaultEngine: pick('defaultEngine'),
    defaultNetwork: pick('defaultNetwork'),
    squashRunCommits: pick('squashRunCommits'),
  };
}

export function createGamesSettingsStore(directory: string): GamesSettingsStore {
  const file = join(directory, FILE_NAME);
  return {
    load: async () => {
      try {
        return parseStoredGamesSettings(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        return { ...DEFAULT_GAMES_SETTINGS };
      }
    },
    save: async (settings) => {
      try {
        await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; the session still works.
      }
    },
  };
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullGamesSettingsStore: GamesSettingsStore = {
  load: async () => ({ ...DEFAULT_GAMES_SETTINGS }),
  save: async () => {},
};
