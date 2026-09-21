import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ForgeAccountSchema, type ForgeAccount } from '@midnite/studio-shared';

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
