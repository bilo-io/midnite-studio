import {
  defineFeatureMain,
  registerVaultGrantHandlers,
  registerVaultPairingHandlers,
  type ClipboardAdapter,
  type VaultClient,
  type VaultGrantsEditor,
  type VaultPairingsEditor,
  type VaultService,
} from '@midnite/studio-runtime';
import {
  CHANNELS,
  forgeAccountFromVaultKey,
  schemas,
  type ConnectionConfig,
  type DbOpResult,
  type ForgeAccount,
  type ForgeAccountAddResult,
  type WebAppId,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { vaultManifest } from '../manifest';

export { vaultManifest, type VaultManifest } from '../manifest';
export { vaultResponseSchemas } from '../response-schemas';

/**
 * The vault feature's main half (Phase 113 Theme J) — the handlers a
 * standalone Vault app registers over the runtime's one vault service.
 *
 * **No handler here returns a stored value.** Nothing calls `vault.get`: a
 * secret answers `has` (a boolean), a forge account is derived from the entry
 * *names* (`vault.keys`) and answers `hasToken`, and a write is one-way. The
 * channel list is the manifest's, which does not contain `secretsGet`.
 *
 * Studio does not register this module: its own handlers (`desktop/.../ipc`)
 * already answer these channels over the same vault.
 */
export type VaultMainServices = {
  /** The Vault's own handle on the runtime vault (`service.forApp('vault')`). */
  vault: VaultClient;
  /** The runtime vault service (optional in thin clients, present when hosting). */
  vaultService?: VaultService;
  /** Injected clipboard adapter for copy-once operations (Phase 118 Theme C). */
  clipboard?: ClipboardAdapter;
  /** Passcode check for vault lock. */
  hasPasscode?: () => boolean;
  canPromptTouchId?: () => boolean;
  promptTouchId?: (reason: string) => Promise<boolean>;
  /**
   * Validates a token against its provider and stores it. Absent in a
   * standalone Vault, which does not carry the forge feature: adding then
   * answers an honest error instead of storing an unchecked token.
   */
  addForgeAccount?: (kind: string, host: string, token: string | undefined) => Promise<ForgeAccountAddResult>;
  /**
   * The runtime's per-app grants — the store the vault authorizes with: in-process in Studio
   * (`createVaultGrants`), the runtime host's over its socket in the standalone Vault.
   */
  grants: VaultGrantsEditor;
  /** The host's guest pairings (list, Unpair). Absent: no app has paired, and Unpair does nothing. */
  pairings?: VaultPairingsEditor;
  /** Saved connections' non-secret metadata. Absent, there is none to list. */
  listConnections?: () => Promise<ConnectionConfig[]>;
  /**
   * The web apps' partitions (slice 3). Absent in the standalone Vault, which runs under its own
   * userData and so cannot see the `persist:app-<id>` sessions Studio's web apps signed in with:
   * the listing then answers unavailable, with {@link NEEDS_STUDIO_SIGN_INS} as the reason, and
   * Sign out refuses — the forge-add precedent, rather than reaching into another process.
   */
  webAppSignIns?: {
    list: () => Promise<WebAppsSignInsResponse>;
    signOut: (id: WebAppId) => Promise<WebAppsSignOutResponse>;
  };
};

type WebAppsSignInsResponse = z.infer<typeof schemas.WebAppsSignInsResponse>;
type WebAppsSignOutResponse = z.infer<typeof schemas.WebAppsSignOutResponse>;

/** Why the standalone Vault lists no web-app sign-ins. */
export const NEEDS_STUDIO_SIGN_INS =
  'Web-app sign-ins live in Midnite Studio’s own browser sessions, which the standalone Vault cannot see — open the Vault view in Midnite Studio to list or clear them.';

const NO_ADD =
  'Adding an account needs the forge feature, which the standalone Vault does not carry yet — add it in Midnite Studio.';

/** `forgeAccountId`'s inverse (`shared`'s `forgeAccountFromVaultKey`). Unparseable names are skipped. */
export const accountFromKey: (key: string) => ForgeAccount | null = forgeAccountFromVaultKey;

export const vaultMain = defineFeatureMain<VaultMainServices>({
  feature: vaultManifest.feature,
  channels: vaultManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const { vault } = services;

    ipc.handle(
      CHANNELS.secretsHas,
      schemas.SecretsHasRequest,
      async ({ key }) => ({ hasKey: await vault.has('secrets', key) }),
      () => ({ hasKey: false }),
    );
    ipc.handle(
      CHANNELS.secretsSet,
      schemas.SecretsSetRequest,
      async ({ key, value }) => {
        // An empty value clears the entry — the `secretsSet` contract. A refused write (no runtime
        // host running, for the standalone Vault) reads back as unset rather than throwing over IPC.
        try {
          if (!value.trim()) await vault.delete('secrets', key);
          else await vault.set('secrets', key, value);
        } catch {
          // `secretsHas` answers the truth on the next read.
        }
      },
      () => undefined,
    );

    ipc.handle(
      CHANNELS.forgeAccounts,
      schemas.ForgeAccountsRequest,
      async () => (await vault.keys('forge-accounts')).map(accountFromKey).filter((a): a is ForgeAccount => a !== null),
      () => [],
    );
    ipc.handle(
      CHANNELS.forgeAccountAdd,
      schemas.ForgeAccountAddRequest,
      async (req): Promise<ForgeAccountAddResult> =>
        services.addForgeAccount ? services.addForgeAccount(req.kind, req.host, req.token) : { ok: false, error: NO_ADD },
      (issue): ForgeAccountAddResult => ({ ok: false, error: issue }),
    );
    ipc.handle(
      CHANNELS.forgeAccountRemove,
      schemas.ForgeAccountRemoveRequest,
      async ({ id }) => {
        try {
          await vault.delete('forge-accounts', id);
          return { ok: true };
        } catch {
          return { ok: false };
        }
      },
      () => ({ ok: false }),
    );

    const reauthCheck = () => services.vaultService?.isReauthValid() ?? true;
    registerVaultGrantHandlers(ipc, () => services.grants, reauthCheck);
    registerVaultPairingHandlers(ipc, () => services.pairings ?? null, reauthCheck);

    ipc.handleBare(CHANNELS.vaultLockStatus, async () => {
      const s = services.vaultService;
      return {
        locked: s ? s.isLocked() : false,
        hasPasscode: services.hasPasscode ? services.hasPasscode() : false,
        recentUnlockAt: s ? s.recentUnlockAt : null,
        canPromptTouchId: services.canPromptTouchId ? services.canPromptTouchId() : false,
      };
    });

    ipc.handleBare(CHANNELS.vaultLock, async () => {
      services.vaultService?.lock();
      return { ok: true };
    });

    ipc.handle(
      CHANNELS.vaultUnlock,
      schemas.VaultUnlockRequest,
      async ({ passcode, useTouchId }) => {
        const s = services.vaultService;
        if (!s) return { ok: true };
        const proof = useTouchId ? 'touchid' : passcode;
        const ok = await s.unlock(proof);
        return { ok, error: ok ? undefined : 'Unlock failed' };
      },
      (issue) => ({ ok: false, error: issue }),
    );

    ipc.handle(
      CHANNELS.vaultAuditList,
      schemas.VaultAuditListRequest,
      async ({ limit, app, op }) => {
        const s = services.vaultService;
        if (!s) return { entries: [], valid: true, total: 0 };
        let entries = await s.audit.read(limit);
        if (app) entries = entries.filter((e) => e.app === app);
        if (op) entries = entries.filter((e) => e.op === op);
        const v = await s.audit.verify();
        return { entries, valid: v.valid, total: v.total };
      },
      () => ({ entries: [], valid: true, total: 0 }),
    );

    ipc.handleBare(CHANNELS.vaultAuditVerify, async () => {
      const s = services.vaultService;
      if (!s) return { valid: true, total: 0 };
      return s.audit.verify();
    });

    ipc.handleBare(CHANNELS.vaultAuditExport, async () => {
      const s = services.vaultService;
      if (!s) return { ok: false, error: 'Vault service not available' };
      if (!s.isReauthValid()) return { ok: false, error: 'Re-authentication required (within 60s)' };
      return { ok: true, path: s.audit.getFilePath() };
    });

    ipc.handle(
      CHANNELS.vaultBreachCheck,
      schemas.VaultBreachCheckRequest,
      async ({ password, saveToCache }) => {
        const s = services.vaultService;
        if (!s) return { breached: false, count: 0, checkedAt: Date.now() };
        return s.breachChecker.check(password, { skipCache: !saveToCache });
      },
      () => ({ breached: false, count: 0, checkedAt: Date.now() }),
    );

    ipc.handle(
      CHANNELS.vaultRevealOnce,
      schemas.VaultRevealOnceRequest,
      async ({ namespace, key }) => {
        const s = services.vaultService;
        if (!s) return { ok: false, error: 'Vault service not available' };
        const res = await s.reveal(namespace, key);
        if (!res.ok) return { ok: false, error: res.error };
        return { ok: true, revealed: res.value };
      },
      (issue) => ({ ok: false, error: issue }),
    );

    ipc.handle(
      CHANNELS.vaultCopyOnce,
      schemas.VaultCopyOnceRequest,
      async ({ namespace, key, timeoutSeconds }) => {
        const s = services.vaultService;
        if (!s) return { ok: false, error: 'Vault service not available' };
        if (!services.clipboard) return { ok: false, error: 'Clipboard not available' };
        return s.copy(namespace, key, services.clipboard, { timeoutSeconds });
      },
      (issue) => ({ ok: false, error: issue }),
    );

    ipc.handle(
      CHANNELS.webAppsSignIns,
      schemas.WebAppsSignInsRequest,
      async (): Promise<WebAppsSignInsResponse> =>
        services.webAppSignIns ? services.webAppSignIns.list() : { available: false, reason: NEEDS_STUDIO_SIGN_INS, apps: [] },
      (issue): WebAppsSignInsResponse => ({ available: false, reason: issue, apps: [] }),
    );
    ipc.handle(
      CHANNELS.webAppsSignOut,
      schemas.WebAppsSignOutRequest,
      async ({ id }): Promise<WebAppsSignOutResponse> =>
        services.webAppSignIns ? services.webAppSignIns.signOut(id) : { ok: false, message: NEEDS_STUDIO_SIGN_INS },
      (issue): WebAppsSignOutResponse => ({ ok: false, message: issue }),
    );

    ipc.handleBare(CHANNELS.dbListConnections, async () => (await services.listConnections?.()) ?? []);
    ipc.handle(
      CHANNELS.dbDeleteConnection,
      schemas.DbDeleteConnectionRequest,
      async ({ id }): Promise<DbOpResult> => {
        try {
          await vault.delete('db-credentials', id);
          return { ok: true };
        } catch (error) {
          return { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
        }
      },
      (issue): DbOpResult => ({ ok: false, kind: 'error', message: issue }),
    );
  },
});
