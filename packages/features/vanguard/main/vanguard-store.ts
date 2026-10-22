import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { DEFAULT_VANGUARD_SETTINGS, VanguardSettingsSchema, type VanguardSettings } from '@midnite/studio-shared';

/**
 * Vanguard's persisted settings — main-side, not renderer `localStorage`, because sensors start before any
 * window exists (the `mcp-store.ts` pattern, copied: a versioned JSON file under `userData`, no `electron`
 * import, a missing or corrupt file loads the safe default rather than throwing). The safe default is
 * "viewOpened: false", so Studio starts no sensor on a profile it cannot read.
 */
export type VanguardStore = {
  load: () => Promise<VanguardSettings>;
  save: (settings: VanguardSettings) => Promise<void>;
};

const FILE_NAME = 'vanguard.json';

export function parseStoredSettings(raw: unknown): VanguardSettings {
  const parsed = VanguardSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_VANGUARD_SETTINGS, sensors: {} };
}

export function createVanguardStore(directory: string): VanguardStore {
  const file = join(directory, FILE_NAME);
  return {
    load: async () => {
      try {
        return parseStoredSettings(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        return { ...DEFAULT_VANGUARD_SETTINGS, sensors: {} };
      }
    },
    save: async (settings) => {
      try {
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(tmp, file);
      } catch {
        // A read-only data dir must not take the app down; the setting just will not persist.
      }
    },
  };
}

/** The settings held in memory over a store: sync reads for the sensor host, write-through on update. */
export type VanguardSettingsState = {
  get: () => VanguardSettings;
  update: (patch: Partial<Omit<VanguardSettings, 'version' | 'sensors'>> & { sensors?: Record<string, boolean> }) => Promise<VanguardSettings>;
};

export async function createVanguardSettingsState(store: VanguardStore): Promise<VanguardSettingsState> {
  let current = await store.load();
  return {
    get: () => current,
    update: async (patch) => {
      current = { ...current, ...patch, sensors: { ...current.sensors, ...(patch.sensors ?? {}) } };
      await store.save(current);
      return current;
    },
  };
}
