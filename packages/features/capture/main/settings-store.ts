import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CaptureSettingsSchema, type CaptureSettings } from '@midnite/studio-shared';

/**
 * Capture's settings, kept in main (`<dataDir>/settings.json`): the shortcut has to be registered at
 * startup before any window exists, and the clipboard poller has to know whether it may run, so neither
 * can live in a renderer's localStorage. `defaults` is the composer's: the standalone Capture app ships
 * a chord, Studio ships none (a system-wide chord is not Studio's to take unasked). Clipboard history is
 * off in every composer's defaults.
 */
export const CAPTURE_SETTINGS_FILE = 'settings.json';

export type SettingsStore = {
  read: () => Promise<CaptureSettings>;
  write: (patch: Partial<CaptureSettings>) => Promise<CaptureSettings>;
};

export function createSettingsStore(dataDir: string, defaults: CaptureSettings): SettingsStore {
  const file = join(dataDir, CAPTURE_SETTINGS_FILE);
  let cached: CaptureSettings | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<CaptureSettings> => {
    if (cached) return cached;
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
      const parsed = CaptureSettingsSchema.partial().safeParse(raw);
      cached = { ...defaults, ...(parsed.success ? parsed.data : {}) };
    } catch {
      cached = { ...defaults };
    }
    return cached;
  };

  const write = (patch: Partial<CaptureSettings>) => {
    const run = chain.then(async () => {
      const next = CaptureSettingsSchema.parse({ ...(await read()), ...patch });
      await mkdir(dataDir, { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2));
      await rename(tmp, file);
      cached = next;
      return next;
    });
    chain = run.catch(() => undefined);
    return run;
  };

  return { read, write };
}
