import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WindowRole } from '@midnite/studio-shared';

/**
 * Popout window geometry, persisted across launches — the multi-window
 * sibling of `repo-store.ts`, copied `{version: 1, …}` shape and all. Geometry
 * is main's concern, so main owns its durability: the alternative of a
 * `ui-store` field would have every popout racing the same `localStorage` key.
 * No `electron-store` dependency; this file is the whole of it.
 */
export type WindowBounds = { x: number; y: number; width: number; height: number };

type StoredState = { version: 1; bounds: Partial<Record<WindowRole, WindowBounds>> };

const FILE_NAME = 'windows.json';

export type WindowsStore = {
  load: () => Promise<Partial<Record<WindowRole, WindowBounds>>>;
  save: (bounds: Partial<Record<WindowRole, WindowBounds>>) => Promise<void>;
};

export function createWindowsStore(directory: string): WindowsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      try {
        return parseStoredState(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        // Missing (first launch) or unreadable/corrupt — role defaults rather
        // than failing boot over remembered window geometry.
        return {};
      }
    },

    save: async (bounds) => {
      const state: StoredState = { version: 1, bounds };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; geometry just
        // won't be remembered next launch.
      }
    },
  };
}

const isBounds = (value: unknown): value is WindowBounds =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as WindowBounds).x === 'number' &&
  typeof (value as WindowBounds).y === 'number' &&
  typeof (value as WindowBounds).width === 'number' &&
  typeof (value as WindowBounds).height === 'number';

/** Validate without zod, same as `repo-store.ts`'s own `parseStoredState`. */
export function parseStoredState(value: unknown): Partial<Record<WindowRole, WindowBounds>> {
  if (typeof value !== 'object' || value === null) return {};
  const bounds = (value as { bounds?: unknown }).bounds;
  if (typeof bounds !== 'object' || bounds === null) return {};
  const result: Partial<Record<WindowRole, WindowBounds>> = {};
  for (const [role, entry] of Object.entries(bounds as Record<string, unknown>)) {
    if (isBounds(entry)) result[role as WindowRole] = entry;
  }
  return result;
}

/**
 * Which popout roles were open when the app last ran, so a launch can put them
 * back — a separate file from `windows.json`, whose `save` rewrites the whole
 * document from `boundsCache` on every popout close and would otherwise clobber
 * a sibling field. Only roles in `window-manager`'s `REOPEN_ON_LAUNCH` are
 * ever written here.
 */
export type ReopenStore = {
  load: () => Promise<WindowRole[]>;
  save: (roles: readonly WindowRole[]) => Promise<void>;
};

export function createReopenStore(directory: string): ReopenStore {
  const file = join(directory, 'windows-reopen.json');
  return {
    load: async () => {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8')) as { roles?: unknown };
        return Array.isArray(parsed.roles)
          ? (parsed.roles.filter((r) => typeof r === 'string') as WindowRole[])
          : [];
      } catch {
        return [];
      }
    },
    save: async (roles) => {
      try {
        await writeFile(file, `${JSON.stringify({ version: 1, roles }, null, 2)}\n`, 'utf8');
      } catch {
        // Not remembering which windows were open is not worth failing over.
      }
    },
  };
}
