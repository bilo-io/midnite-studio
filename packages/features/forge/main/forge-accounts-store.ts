import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ForgeAccountSchema, forgeAccountFromVaultKey, type ForgeAccount } from '@midnite/studio-shared';

/**
 * The non-secret half of the account registry, persisted across launches —
 * `forge-accounts.ts`'s own `repo-store.ts`. Only account records and the
 * active pointer live here; every token lives in `forge-account-vault.ts`'s
 * sibling file instead, exactly as `repo-registry.ts`/`repo-store.ts` split
 * "what's open" (main) from "what's on disk" (this file).
 */
export type ForgeAccountsState = { accounts: ForgeAccount[]; activeAccountId: string | null };

export type ForgeAccountsStore = {
  load: () => Promise<ForgeAccountsState>;
  save: (state: ForgeAccountsState) => Promise<void>;
};

type StoredState = { version: 1; accounts: unknown[]; activeAccountId: string | null };

const FILE_NAME = 'forge-accounts.json';

export function createForgeAccountsStore(directory: string): ForgeAccountsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      try {
        return parseStoredState(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        // Missing (first launch) or unreadable/corrupt — no accounts is the
        // recoverable answer, same as every other store in this directory.
        return { accounts: [], activeAccountId: null };
      }
    },

    save: async (state) => {
      const stored: StoredState = {
        version: 1,
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
      };
      try {
        await writeFile(file, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir must not take the app down; the accounts still
        // work for this session, they just won't be remembered.
      }
    },
  };
}

/**
 * A guest app's registry (`docs/APPS.md`, "The shared data plane"): its own records, plus every
 * token-backed account the runtime host's vault lets it see that it has no record of — so a forge
 * login Studio stored shows up in Coder once Coder is granted it. `vaultKeys` is the guest's
 * `vault.keys('forge-accounts')` (names only, already filtered by the host's grants); a vault that
 * cannot answer adds nothing. The first adopted account becomes active only when none is.
 */
export function withVaultForgeAccounts(store: ForgeAccountsStore, vaultKeys: () => Promise<string[]>): ForgeAccountsStore {
  // Adopted records are re-derived on every load, never written into this app's own file — so an
  // account removed where it was stored does not linger here as a record with no token.
  const adoptedIds = new Set<string>();
  return {
    load: async () => {
      const state = await store.load();
      const known = new Set(state.accounts.map((a) => a.id));
      let keys: string[] = [];
      try {
        keys = await vaultKeys();
      } catch {
        // No host, no adoption: the app's own records stand.
      }
      const adopted = keys
        .filter((key) => !known.has(key))
        .map(forgeAccountFromVaultKey)
        .filter((a): a is ForgeAccount => a !== null);
      adoptedIds.clear();
      for (const a of adopted) adoptedIds.add(a.id);
      return { accounts: [...state.accounts, ...adopted], activeAccountId: state.activeAccountId ?? adopted[0]?.id ?? null };
    },
    // An adopted record is the minimal one (`addedAt: 0`); one the user re-added here is their own.
    save: (state) => store.save({ ...state, accounts: state.accounts.filter((a) => !(adoptedIds.has(a.id) && a.addedAt === 0)) }),
  };
}

/** Every record is re-validated against the wire schema — a hand-edited or
 *  cross-version file must not resurrect a malformed account. */
function parseStoredState(value: unknown): ForgeAccountsState {
  if (typeof value !== 'object' || value === null) return { accounts: [], activeAccountId: null };
  const row = value as Record<string, unknown>;
  const rawAccounts = Array.isArray(row['accounts']) ? row['accounts'] : [];
  const accounts: ForgeAccount[] = [];
  for (const candidate of rawAccounts) {
    const parsed = ForgeAccountSchema.safeParse(candidate);
    if (parsed.success) accounts.push(parsed.data);
  }
  const activeAccountId = typeof row['activeAccountId'] === 'string' ? row['activeAccountId'] : null;
  return { accounts, activeAccountId: accounts.some((a) => a.id === activeAccountId) ? activeAccountId : null };
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullForgeAccountsStore: ForgeAccountsStore = {
  load: async () => ({ accounts: [], activeAccountId: null }),
  save: async () => {},
};
