import { clipboard } from 'electron';

import {
  registerVaultGrantHandlers,
  registerVaultPairingHandlers,
  type PairingStore,
  type VaultGrants,
  type VaultService,
} from '@midnite/studio-runtime';
import { CHANNELS, schemas, type SecretKey } from '@midnite/studio-shared';

import type { SecretsVault } from '../secrets-vault';
import { handle, handleBare, handleSend } from './handle';

let vault: SecretsVault | null = null;

export function configureSecrets(next: SecretsVault): void {
  vault = next;
}

let grants: VaultGrants | null = null;

let pairings: PairingStore | null = null;

let vaultService: VaultService | null = null;

/**
 * The runtime's per-app grants (Phase 113 Theme J slice 2), configured beside the vault service, and
 * the host's guest pairings, which Studio's Vault view lists and unpairs in-process.
 */
export function configureVaultGrants(
  next: VaultGrants,
  nextPairings: PairingStore | null = null,
  nextVaultService: VaultService | null = null,
): void {
  grants = next;
  pairings = nextPairings;
  vaultService = nextVaultService;
}

async function readTwelveDataKey(): Promise<string | null> {
  if (!vault) return null;
  return vault.get('finance.twelveData');
}

/** Exposed for finance handlers — the key never crosses back to the renderer. */
export { readTwelveDataKey };

/**
 * The brokerage accounts' credential store (Phase 113 Theme P slice 2): main-only, read by the
 * accounts service to sign a request and by nothing else. A write with no vault is dropped, like
 * every other secret's, and reads as absent — the account then reports its credentials missing.
 */
export const accountCredentials = {
  get: async (name: string): Promise<string | null> => (vault ? vault.getEntry(name) : null),
  set: async (name: string, value: string): Promise<void> => {
    if (vault) await vault.setEntry(name, value);
  },
  delete: async (name: string): Promise<void> => {
    if (vault) await vault.deleteEntry(name);
  },
};

/**
 * Exposed for `ollama-handlers.ts` (the cloud catalogue fetch) and
 * `pty-service.ts`'s `useOllamaKey` marker resolution (Phase 96 Theme F) —
 * the key never crosses back to the renderer either way.
 */
export async function readOllamaApiKey(): Promise<string | null> {
  if (!vault) return null;
  return vault.get('ollama.apiKey');
}

/**
 * One engine's own API key (`agent.<id>.apiKey`), for main to put in that engine's spawn environment
 * (Phase 121 Theme I). Callers pass the key of the engine being started and no other.
 */
export async function readAgentApiKey(key: SecretKey): Promise<string | null> {
  if (!vault) return null;
  return vault.get(key);
}

/**
 * Keys that never cross the bridge, whatever asks. `secretsGet` used to hand
 * `finance.twelveData` to Settings so it could tell whether one was set; that
 * is `secretsHas`'s job now (Phase 113 Theme P), and the finance handlers read
 * the key in main. Refusing it here makes "the renderer never receives the
 * market-data key" a property of the channel, not of the callers.
 */
export const MAIN_ONLY_SECRETS: readonly SecretKey[] = ['finance.twelveData'];

export function registerSecretsHandlers(): void {
  const reauthCheck = () => vaultService?.isReauthValid() ?? true;
  registerVaultGrantHandlers({ handle, handleBare, send: handleSend }, () => grants, reauthCheck);
  registerVaultPairingHandlers({ handle, handleBare, send: handleSend }, () => pairings, reauthCheck);

  handleBare(CHANNELS.vaultLockStatus, async () => ({
    locked: vaultService ? vaultService.isLocked() : false,
    hasPasscode: false,
    recentUnlockAt: vaultService ? vaultService.recentUnlockAt : null,
    canPromptTouchId: false,
  }));

  handleBare(CHANNELS.vaultLock, async () => {
    vaultService?.lock();
    return { ok: true };
  });

  handle(
    CHANNELS.vaultUnlock,
    schemas.VaultUnlockRequest,
    async ({ passcode, useTouchId }) => {
      if (!vaultService) return { ok: true };
      const proof = useTouchId ? 'touchid' : passcode;
      const ok = await vaultService.unlock(proof);
      return { ok, error: ok ? undefined : 'Unlock failed' };
    },
    (issue) => ({ ok: false, error: issue }),
  );

  handle(
    CHANNELS.vaultAuditList,
    schemas.VaultAuditListRequest,
    async ({ limit, app, op }) => {
      if (!vaultService) return { entries: [], valid: true, total: 0 };
      let entries = await vaultService.audit.read(limit);
      if (app) entries = entries.filter((e) => e.app === app);
      if (op) entries = entries.filter((e) => e.op === op);
      const v = await vaultService.audit.verify();
      return { entries, valid: v.valid, total: v.total };
    },
    () => ({ entries: [], valid: true, total: 0 }),
  );

  handleBare(CHANNELS.vaultAuditVerify, async () => {
    if (!vaultService) return { valid: true, total: 0 };
    return vaultService.audit.verify();
  });

  handleBare(CHANNELS.vaultAuditExport, async () => {
    if (!vaultService) return { ok: false, error: 'Vault service not available' };
    if (!vaultService.isReauthValid()) return { ok: false, error: 'Re-authentication required (within 60s)' };
    return { ok: true, path: vaultService.audit.getFilePath() };
  });

  handle(
    CHANNELS.vaultBreachCheck,
    schemas.VaultBreachCheckRequest,
    async ({ password, saveToCache }) => {
      if (!vaultService) return { breached: false, count: 0, checkedAt: Date.now() };
      return vaultService.breachChecker.check(password, { skipCache: !saveToCache });
    },
    () => ({ breached: false, count: 0, checkedAt: Date.now() }),
  );

  handle(
    CHANNELS.vaultRevealOnce,
    schemas.VaultRevealOnceRequest,
    async ({ namespace, key }) => {
      if (!vaultService) return { ok: false, error: 'Vault service not available' };
      const res = await vaultService.reveal(namespace, key);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, revealed: res.value };
    },
    (issue) => ({ ok: false, error: issue }),
  );

  handle(
    CHANNELS.vaultCopyOnce,
    schemas.VaultCopyOnceRequest,
    async ({ namespace, key, timeoutSeconds }) => {
      if (!vaultService) return { ok: false, error: 'Vault service not available' };
      return vaultService.copy(namespace, key, clipboard, { timeoutSeconds });
    },
    (issue) => ({ ok: false, error: issue }),
  );

  handle(
    CHANNELS.secretsGet,
    schemas.SecretsGetRequest,
    async ({ key }) => {
      if (!vault || MAIN_ONLY_SECRETS.includes(key)) return { value: null };
      return { value: await vault.get(key) };
    },
    () => ({ value: null }),
  );

  handle(
    CHANNELS.secretsSet,
    schemas.SecretsSetRequest,
    async ({ key, value }) => {
      if (!vault) return;
      if (!value.trim()) {
        await vault.delete(key);
        return;
      }
      await vault.set(key, value);
    },
    () => undefined,
  );

  handle(
    CHANNELS.secretsHas,
    schemas.SecretsHasRequest,
    async ({ key }) => {
      if (!vault) return { hasKey: false };
      return { hasKey: (await vault.get(key)) !== null };
    },
    () => ({ hasKey: false }),
  );
}

/**
 * Exposed for `media-image-handlers.ts` (Phase 99 Theme C) — the image
 * adapters' API keys are read here in main and never cross the bridge.
 */
export async function readSecret(key: SecretKey): Promise<string | null> {
  if (!vault) return null;
  return vault.get(key);
}
