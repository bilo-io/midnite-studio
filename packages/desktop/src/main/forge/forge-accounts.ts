import {
  forgeAccountId,
  forgeAccountVaultKey,
  type Forge,
  type ForgeAccount,
  type ForgeAccountAddResult,
  type ForgeKind,
} from '@midnite/studio-shared';

import { nullForgeAccountVault, type ForgeAccountVault } from './forge-account-vault';
import { nullForgeAccountsStore, type ForgeAccountsStore } from './forge-accounts-store';
import { ghStatus } from './gh-shell';
import { whoami } from './whoami';

/**
 * The account registry — "what's open" over `forge-accounts-store.ts`'s
 * "what's on disk", the same split `repo-registry.ts`/`repo-store.ts` make.
 *
 * Every mutating export here is `async` and re-persists on every change,
 * matching `repo-registry.ts`'s own discipline: the in-memory list is never
 * allowed to be ahead of the file across a crash.
 */

let accounts: ForgeAccount[] = [];
let activeAccountId: string | null = null;
let store: ForgeAccountsStore = nullForgeAccountsStore;
let vault: ForgeAccountVault = nullForgeAccountVault;
let ready: Promise<void> | null = null;

export function configureForgeAccounts(nextStore: ForgeAccountsStore, nextVault: ForgeAccountVault): void {
  store = nextStore;
  vault = nextVault;
  ready = store.load().then((state) => {
    accounts = state.accounts;
    activeAccountId = state.activeAccountId;
  });
}

/** Every read/write below awaits this first, so a handler that fires before
 *  the boot-time load resolves sees the persisted state rather than `[]`. */
async function ensureLoaded(): Promise<void> {
  if (ready) await ready;
}

async function persist(): Promise<void> {
  await store.save({ accounts, activeAccountId });
}

export async function listForgeAccounts(): Promise<ForgeAccount[]> {
  await ensureLoaded();
  return accounts;
}

export async function getActiveAccountId(): Promise<string | null> {
  await ensureLoaded();
  return activeAccountId;
}

/** The active account's own record, or `null` when none is active. Read by
 *  the title-bar avatar and, later, Theme C's repo-scoping filter. */
export async function getActiveAccount(): Promise<ForgeAccount | null> {
  await ensureLoaded();
  return accounts.find((a) => a.id === activeAccountId) ?? null;
}

/**
 * Validate `token` against `kind`'s `whoami`, then store the result.
 *
 * GitHub is the one kind that can validate with no token: an omitted token
 * resolves through `gh auth status`/`gh api user`, exactly as every other
 * GitHub read in this app does, and the resulting account is `delegated:
 * 'gh'` with `hasToken: false` — `gh` remains its credential. Every other
 * kind requires a token; the whoami call IS the validation, so a rejected
 * PAT never reaches the vault or the registry.
 */
export async function addForgeAccount(
  kind: ForgeKind,
  host: string,
  token?: string,
): Promise<ForgeAccountAddResult> {
  await ensureLoaded();

  if (kind === 'github' && !token) {
    const status = await ghStatus();
    if (status.reason !== 'ready') {
      return { ok: false, error: status.hint || 'Sign in with `gh auth login` first.' };
    }
  } else if (!token) {
    return { ok: false, error: 'A personal access token is required for this provider.' };
  }

  const identity = await whoami(kind, host, token);
  if (!identity) {
    return { ok: false, error: 'Could not verify this token. Check it and its scopes, then try again.' };
  }

  const id = forgeAccountId(kind, host, identity.login);
  const delegated = kind === 'github' && !token ? ('gh' as const) : null;
  const account: ForgeAccount = {
    id,
    kind,
    host,
    login: identity.login,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    addedAt: Date.now(),
    hasToken: delegated === null && token !== undefined,
    delegated,
  };

  if (delegated === null && token) {
    await vault.set(forgeAccountVaultKey(kind, host, identity.login), token);
  }

  accounts = [...accounts.filter((a) => a.id !== id), account];
  if (activeAccountId === null) activeAccountId = id;
  await persist();

  return { ok: true, account };
}

export async function removeForgeAccount(id: string): Promise<boolean> {
  await ensureLoaded();
  const account = accounts.find((a) => a.id === id);
  if (!account) return false;

  accounts = accounts.filter((a) => a.id !== id);
  if (account.delegated === null) {
    await vault.delete(forgeAccountVaultKey(account.kind, account.host, account.login));
  }
  if (activeAccountId === id) activeAccountId = accounts[0]?.id ?? null;
  await persist();
  return true;
}

/**
 * Move the active-account pointer. This alone is the whole of what Theme B
 * ships — it changes which account Settings ▸ Accounts marks active and
 * nothing else. Rescoping the repo list, invalidating forge queries and
 * running `gh auth switch` are Theme C's job, wired on top of this same
 * pointer once that theme lands.
 */
export async function switchActiveForgeAccount(
  id: string | null,
): Promise<{ ok: boolean; activeAccountId: string | null }> {
  await ensureLoaded();
  if (id !== null && !accounts.some((a) => a.id === id)) {
    return { ok: false, activeAccountId };
  }
  activeAccountId = id;
  await persist();
  return { ok: true, activeAccountId };
}

/** The vaulted token for an account, for a future caller that needs to make
 *  an authenticated request (Themes E-G's adapters). Never crosses IPC. */
export async function forgeAccountToken(account: ForgeAccount): Promise<string | null> {
  if (account.delegated !== null) return null;
  return vault.get(forgeAccountVaultKey(account.kind, account.host, account.login));
}

/** The active account whose host matches `forge`, if any — the lookup
 *  Theme C's repo-scoping filter will use; exported now so that theme is a
 *  pure consumer of this registry rather than a second copy of it. */
export async function activeAccountFor(forge: Forge): Promise<ForgeAccount | null> {
  const active = await getActiveAccount();
  return active && active.host === forge.host ? active : null;
}

/** Test seam — module-level state would otherwise leak between cases. */
export function __resetForgeAccountsForTests(): void {
  accounts = [];
  activeAccountId = null;
  store = nullForgeAccountsStore;
  vault = nullForgeAccountVault;
  ready = null;
}
