import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { BrowserPermissionRecord, BrowserPermissionValue } from '@midnite/studio-shared';

import { normaliseOrigin } from './browser-security';

/**
 * Remembered site permissions per origin (Phase 117 Theme B).
 *
 * Persisted in `<userData>/browser-permissions.json` (mode 0600, atomic temp+rename).
 * Keyed by normalised origin (`normaliseOrigin`) and permission string, value `allow | deny | ask`,
 * with a `grantedAt` timestamp.
 *
 * Rule: `clipboard-read` is never promptable and cannot be granted `allow`. Attempting to store
 * `allow` for `clipboard-read` throws.
 */

export const BROWSER_PERMISSIONS_FILE = 'browser-permissions.json';

export type StoredGrant = {
  value: BrowserPermissionValue;
  grantedAt: number;
};

export type StoredGrantsMap = Record<string, Record<string, StoredGrant>>;

type PersistedPermissionsData = {
  version: 1;
  grants: StoredGrantsMap;
};

export interface PermissionGrantStore {
  get(origin: string, permission: string): BrowserPermissionValue;
  set(origin: string, permission: string, value: BrowserPermissionValue): void;
  revoke(origin: string, permission: string): void;
  resetAll(): void;
  list(): BrowserPermissionRecord[];
  /** File path if disk-backed, null if in-memory only. */
  readonly path: string | null;
}

export function createPermissionGrantStore(options?: { directory?: string; filePath?: string }): PermissionGrantStore {
  const filePath = options?.filePath ?? (options?.directory ? join(options.directory, BROWSER_PERMISSIONS_FILE) : null);

  let cache: StoredGrantsMap = {};
  let loaded = false;
  let stamp = '';

  const load = (): StoredGrantsMap => {
    if (!filePath) {
      return cache;
    }
    try {
      const st = statSync(filePath);
      const nextStamp = `${st.mtimeMs}:${st.size}`;
      if (loaded && nextStamp === stamp) return cache;
      stamp = nextStamp;
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedPermissionsData;
      if (parsed && typeof parsed.grants === 'object' && parsed.grants !== null) {
        cache = parsed.grants;
      } else {
        cache = {};
      }
      loaded = true;
    } catch (err) {
      stamp = '';
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        cache = {};
      } else {
        // Corrupted file starts fresh
        cache = {};
      }
      loaded = true;
    }
    return cache;
  };

  const save = (grants: StoredGrantsMap): void => {
    cache = grants;
    if (!filePath) return;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      const data: PersistedPermissionsData = { version: 1, grants };
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, filePath);
      stamp = '';
    } catch {
      // Do not crash main if disk write fails
    }
  };

  return {
    path: filePath,
    get(origin: string, permission: string): BrowserPermissionValue {
      const key = normaliseOrigin(origin);
      const grants = load();
      return grants[key]?.[permission]?.value ?? 'ask';
    },
    set(origin: string, permission: string, value: BrowserPermissionValue): void {
      if (permission === 'clipboard-read' && value === 'allow') {
        throw new Error('clipboard-read cannot be granted allow');
      }
      const key = normaliseOrigin(origin);
      const current = structuredClone(load());
      if (value === 'ask') {
        if (current[key]) {
          delete current[key][permission];
          if (Object.keys(current[key]).length === 0) delete current[key];
        }
      } else {
        current[key] ??= {};
        current[key][permission] = {
          value,
          grantedAt: Date.now(),
        };
      }
      save(current);
    },
    revoke(origin: string, permission: string): void {
      const key = normaliseOrigin(origin);
      const current = structuredClone(load());
      if (current[key]) {
        delete current[key][permission];
        if (Object.keys(current[key]).length === 0) delete current[key];
        save(current);
      }
    },
    resetAll(): void {
      save({});
    },
    list(): BrowserPermissionRecord[] {
      const grants = load();
      const records: BrowserPermissionRecord[] = [];
      for (const [origin, perms] of Object.entries(grants)) {
        for (const [permission, grant] of Object.entries(perms)) {
          records.push({
            origin,
            permission,
            value: grant.value,
            grantedAt: grant.grantedAt,
          });
        }
      }
      return records.sort((a, b) => a.origin.localeCompare(b.origin) || a.permission.localeCompare(b.permission));
    },
  };
}
