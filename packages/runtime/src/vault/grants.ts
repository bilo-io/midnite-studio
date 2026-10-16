import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { schemas } from '@midnite/studio-shared';

import type { RuntimeAppId } from '../app-id';
import type { VaultAccess, VaultAuthorize, VaultNamespace } from './vault-service';

/**
 * Per-app vault grants (Phase 113 Theme J slice 2) — the real `authorize`
 * behind {@link createVaultService}'s seam.
 *
 * **Deny by default.** Studio and Vault are always allowed everything; any
 * other app may touch only what it has been granted, and a grant is
 * `{ appId → { namespace → entry names | '*' } }`. A grant covers read, write
 * and delete of the entries it names — an app that may use a token may rotate
 * it.
 *
 * **Never widens on failure.** The file is read synchronously (the authorize
 * seam is sync) and re-read when it changes on disk, so a revoke made by the
 * Vault app takes effect in another process on its next access. Missing means
 * no grants; unreadable or malformed means no grants *and* {@link VaultGrants.corrupt}
 * — never "allow", and one bad namespace entry drops that app's grants, not
 * the file's other apps. No function here throws. The file holds names only,
 * never a value.
 */
export const VAULT_GRANTS_FILE = 'vault-grants.json';

/** The apps that need no grant. */
const TRUSTED: ReadonlySet<RuntimeAppId> = new Set<RuntimeAppId>(['studio', 'vault']);

export type VaultGrantScope = '*' | string[];
export type VaultGrantsMap = Record<string, Partial<Record<VaultNamespace, VaultGrantScope>>>;

export interface VaultGrants {
  /** Plug into `createVaultService({ authorize })`. */
  readonly authorize: VaultAuthorize;
  list(): { grants: VaultGrantsMap; corrupt: boolean };
  /** Returns false when the write failed or the app is trusted (nothing to grant). */
  set(appId: RuntimeAppId, namespace: VaultNamespace, scope: VaultGrantScope): boolean;
  /** Drops one namespace's grant, or every grant the app holds. */
  revoke(appId: RuntimeAppId, namespace?: VaultNamespace): boolean;
}

type Loaded = { grants: VaultGrantsMap; corrupt: boolean };

function parse(raw: string): Loaded {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { grants: {}, corrupt: true };
  }
  const grants = (json as { grants?: unknown } | null)?.grants;
  if (typeof grants !== 'object' || grants === null || Array.isArray(grants)) return { grants: {}, corrupt: true };
  const out: VaultGrantsMap = {};
  let corrupt = false;
  for (const [appId, perApp] of Object.entries(grants)) {
    const parsed = schemas.VaultGrantsSchema.safeParse({ [appId]: perApp });
    if (parsed.success) out[appId] = parsed.data[appId] ?? {};
    else corrupt = true;
  }
  return { grants: out, corrupt };
}

export function createVaultGrants(options: { directory: string }): VaultGrants {
  const path = join(options.directory, VAULT_GRANTS_FILE);
  let cache: Loaded = { grants: {}, corrupt: false };
  let stamp = '';

  const load = (): Loaded => {
    try {
      const st = statSync(path);
      const next = `${st.mtimeMs}:${st.size}`;
      if (next === stamp) return cache;
      stamp = next;
      cache = parse(readFileSync(path, 'utf8'));
    } catch (error) {
      stamp = '';
      // No file is a clean "nothing granted"; any other failure is unreadable.
      cache = { grants: {}, corrupt: (error as NodeJS.ErrnoException).code !== 'ENOENT' };
    }
    return cache;
  };

  const save = (grants: VaultGrantsMap): boolean => {
    try {
      mkdirSync(options.directory, { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, grants }, null, 2), { mode: 0o600 });
      renameSync(tmp, path);
      stamp = '';
      return true;
    } catch {
      return false;
    }
  };

  const authorize: VaultAuthorize = ({ appId, namespace, key }: VaultAccess) => {
    if (TRUSTED.has(appId)) return true;
    const scope = load().grants[appId]?.[namespace];
    if (scope === undefined) return false;
    return scope === '*' || scope.includes(key);
  };

  return {
    authorize,
    list: () => {
      const { grants, corrupt } = load();
      return { grants: structuredClone(grants), corrupt };
    },
    set: (appId, namespace, scope) => {
      if (TRUSTED.has(appId)) return false;
      // A corrupt file starts over from nothing — that only ever narrows what was readable.
      const grants = structuredClone(load().grants);
      grants[appId] = { ...grants[appId], [namespace]: scope };
      return save(grants);
    },
    revoke: (appId, namespace) => {
      const grants = structuredClone(load().grants);
      if (namespace === undefined) delete grants[appId];
      else if (grants[appId]) {
        delete grants[appId][namespace];
        if (Object.keys(grants[appId]).length === 0) delete grants[appId];
      }
      return save(grants);
    },
  };
}
