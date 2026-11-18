import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  DEFAULT_STARTUP_AI_SETTINGS,
  StartupAiSettingsSchema,
  type StartupAiSettings,
  type StartupRequest,
  type StartupResult,
} from '@midnite/studio-shared';

/**
 * Which model drafts the investor update (Phase 153 Theme D), kept in the app's own settings file —
 * `<userData>/startup/ai-settings.json`, beside the workspace but never inside it — the same pattern and the same
 * reasons as `agent-consent.ts`: an exported or restored workspace cannot redirect a prompt that carries the
 * company's figures to another model. `get` is synchronous; `set` writes temp + rename.
 */
export type AiSettingsStore = {
  get(): StartupAiSettings;
  set(next: StartupAiSettings): Promise<StartupAiSettings>;
};

export function openAiSettings(dir: string, warn?: (message: string) => void): AiSettingsStore {
  const file = join(dir, 'ai-settings.json');
  let current: StartupAiSettings = DEFAULT_STARTUP_AI_SETTINGS;
  try {
    const parsed = StartupAiSettingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) current = parsed.data;
    else warn?.('startup: ai-settings.json is not valid; the default model is used.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warn?.(`startup: could not read ai-settings.json (${String(error)}); the default model is used.`);
  }
  return {
    get: () => current,
    async set(next) {
      const value = StartupAiSettingsSchema.parse(next);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      await writeFile(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
      await rename(tmp, file);
      current = value;
      return value;
    },
  };
}

/** The two ops over the store; `store` is absent in a bare test, where reads answer the defaults and writes refuse. */
export async function aiSettingsOp(
  store: AiSettingsStore | undefined,
  request: Extract<StartupRequest, { op: 'getAiSettings' | 'setAiSettings' }>,
): Promise<StartupResult<StartupAiSettings>> {
  if (request.op === 'getAiSettings') return { ok: true, value: store?.get() ?? DEFAULT_STARTUP_AI_SETTINGS };
  if (store === undefined) return { ok: false, kind: 'invalid', message: 'The AI model cannot be changed here.' };
  try {
    return { ok: true, value: await store.set(request.settings) };
  } catch (error) {
    return { ok: false, kind: 'io', message: String(error) };
  }
}
