import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  defaultMapProject,
  failure,
  MAP_CACHE_CAP_MB,
  MAP_PROJECT_FILE,
  MapProjectFileSchema,
  ok,
  type GitOpResult,
  type MapProjectGetResult,
  type MapProjectPatch,
} from '@midnite/studio-shared';

/**
 * Media ▸ Maps' project file (Phase 108 Theme A): `map.json` per project, read with defaults and
 * written by shallow patch. Plain Node over the media store's own read/write, so it is testable
 * without Electron — the store keeps the jail, the per-root write queue and the `media:changed` ping.
 */
type Target = { repoId: string; project: string };

export type MapServiceDeps = {
  readText: (req: Target & { path: string }) => Promise<GitOpResult<string>>;
  writeText: (req: Target & { path: string; content: string }) => Promise<GitOpResult<unknown>>;
};

/** A missing file is not an error: every read fails the same way, so tell them apart by the message. */
const isMissing = (message: string): boolean => /not found|ENOENT|no such file/i.test(message);

export function createMapService(deps: MapServiceDeps) {
  /** Serialises read-modify-write per project, so two quick saves never lose one another's fields. */
  const chains = new Map<string, Promise<unknown>>();

  async function get(req: Target): Promise<GitOpResult<MapProjectGetResult>> {
    const read = await deps.readText({ ...req, path: MAP_PROJECT_FILE });
    if (!read.ok) {
      const message = read.kind === 'error' ? read.message : '';
      return isMissing(message) ? ok({ map: defaultMapProject() }) : failure(message || 'Could not read map.json.');
    }
    let json: unknown;
    try {
      json = JSON.parse(read.value);
    } catch (error) {
      return ok({ map: defaultMapProject(), warning: `map.json is not valid: ${error instanceof Error ? error.message : String(error)}` });
    }
    const parsed = MapProjectFileSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return ok({ map: defaultMapProject(), warning: `map.json is not valid: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'unknown'}` });
    }
    return ok({ map: parsed.data });
  }

  async function setView(req: Target & { patch: MapProjectPatch }): Promise<GitOpResult<MapProjectGetResult>> {
    const key = `${req.repoId}\0${req.project}`;
    const run = async (): Promise<GitOpResult<MapProjectGetResult>> => {
      const current = await get(req);
      if (!current.ok) return current;
      const next = MapProjectFileSchema.safeParse({ ...current.value.map, ...req.patch });
      if (!next.success) return failure(`Invalid map: ${next.error.issues[0]?.message ?? 'unknown'}`);
      const written = await deps.writeText({ ...req, path: MAP_PROJECT_FILE, content: `${JSON.stringify(next.data, null, 2)}\n` });
      if (!written.ok) return written;
      return ok({ map: next.data });
    };
    const previous = chains.get(key) ?? Promise.resolve();
    const result = previous.then(run, run);
    chains.set(key, result);
    void result.finally(() => {
      if (chains.get(key) === result) chains.delete(key);
    });
    return result;
  }

  return { get, setView };
}

export type MapService = ReturnType<typeof createMapService>;

/** `userData/map-settings.json` — main's own map settings (the tile-cache cap). */
export type MapSettings = { version: 1; cacheCapMB: number };

const clampCap = (value: unknown): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : MAP_CACHE_CAP_MB.default;
  return Math.min(MAP_CACHE_CAP_MB.max, Math.max(MAP_CACHE_CAP_MB.min, n));
};

export function createMapSettingsStore(userData: string) {
  const path = join(userData, 'map-settings.json');
  return {
    async load(): Promise<MapSettings> {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8')) as { cacheCapMB?: unknown };
        return { version: 1, cacheCapMB: clampCap(raw.cacheCapMB) };
      } catch {
        return { version: 1, cacheCapMB: MAP_CACHE_CAP_MB.default };
      }
    },
    async save(settings: MapSettings): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({ version: 1, cacheCapMB: clampCap(settings.cacheCapMB) }, null, 2)}\n`);
    },
  };
}
