import type { OllamaSettings } from '@midnite/studio-shared';

import { nullOllamaSettingsStore, type OllamaSettingsStore } from './settings-store';

/**
 * In-memory cache in front of `settings-store.ts`, mirroring
 * `video-service.ts`'s `ensureRootLoaded()` — one `load()` per process
 * lifetime, everything after reads the cache. `configureOllamaSettings` is
 * called once from `main/index.ts`, after `userData` is known, the same
 * point `configureVideo` is.
 */
let store: OllamaSettingsStore = nullOllamaSettingsStore;
let cached: OllamaSettings | null = null;
let loading: Promise<OllamaSettings> | null = null;

export function configureOllamaSettings(nextStore: OllamaSettingsStore): void {
  store = nextStore;
  cached = null;
  loading = null;
}

async function ensureLoaded(): Promise<OllamaSettings> {
  if (cached) return cached;
  loading ??= store.load().then((settings) => {
    cached = settings;
    return settings;
  });
  return loading;
}

export async function getOllamaSettings(): Promise<OllamaSettings> {
  return ensureLoaded();
}

/** `null` (a bare `resolveOllamaBaseUrl()` fallback applies) unless a host has been configured. */
export async function getConfiguredOllamaHost(): Promise<string | null> {
  return (await ensureLoaded()).host;
}

/** Only the fields present in `patch` change; the rest keep their current value. */
export async function setOllamaSettings(
  patch: Partial<OllamaSettings>,
): Promise<OllamaSettings> {
  const current = await ensureLoaded();
  const next: OllamaSettings = {
    host: patch.host !== undefined ? patch.host : current.host,
    defaultModel: patch.defaultModel !== undefined ? patch.defaultModel : current.defaultModel,
  };
  await store.save(next);
  cached = next;
  return next;
}

/** Test-only: drop the cache between suites. */
export function resetOllamaSettingsState(): void {
  store = nullOllamaSettingsStore;
  cached = null;
  loading = null;
}
