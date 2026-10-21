import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Vault exposes — exactly what the vault renderer reads, and
 * nothing else: `secrets.has`/`set`, the account registry's list/add/remove and the database
 * connections' list/delete, and the web apps' sign-in listing and Sign out. **`secrets.get` is deliberately absent**, so a Vault renderer cannot read
 * a stored value even by accident (`bridge.test.ts` holds the list).
 */
export type VaultBridge = {
  secrets: Pick<MidniteStudioBridge['secrets'], 'has' | 'set'>;
  forgeAccounts: Pick<MidniteStudioBridge['forgeAccounts'], 'list' | 'add' | 'remove'>;
  db: Pick<MidniteStudioBridge['db'], 'listConnections' | 'deleteConnection'>;
  vaultGrants: MidniteStudioBridge['vaultGrants'];
  /** Who has paired with the vault host, conflicts, and Unpair — never a key. */
  vaultPairings: NonNullable<MidniteStudioBridge['vaultPairings']>;
  /**
   * Web-app sign-ins: metadata and Sign out only — never a view, bounds or activation. In this app
   * they answer "needs Studio" (`NEEDS_STUDIO_SIGN_INS`): the partitions are Studio's.
   */
  webApps: Pick<MidniteStudioBridge['webApps'], 'signIns' | 'signOut'>;
};

export type { RendererIpc };

export function createVaultBridge(ipc: RendererIpc): VaultBridge {
  const { call } = createBridgeSlice(ipc);
  return {
    secrets: {
      has: (req) => call(CHANNELS.secretsHas, req),
      set: (req) => call(CHANNELS.secretsSet, req),
    },
    forgeAccounts: {
      list: (req) => call(CHANNELS.forgeAccounts, req),
      add: (req) => call(CHANNELS.forgeAccountAdd, req),
      remove: (req) => call(CHANNELS.forgeAccountRemove, req),
    },
    db: {
      listConnections: () => call(CHANNELS.dbListConnections),
      deleteConnection: (req) => call(CHANNELS.dbDeleteConnection, req),
    },
    vaultGrants: {
      list: (req) => call(CHANNELS.vaultGrantsList, req),
      set: (req) => call(CHANNELS.vaultGrantSet, req),
      revoke: (req) => call(CHANNELS.vaultGrantRevoke, req),
    },
    vaultPairings: {
      list: (req) => call(CHANNELS.vaultPairingsList, req),
      unpair: (req) => call(CHANNELS.vaultPairingUnpair, req),
    },
    webApps: {
      signIns: (req) => call(CHANNELS.webAppsSignIns, req),
      signOut: (req) => call(CHANNELS.webAppsSignOut, req),
    },
  };
}
