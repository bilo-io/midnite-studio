import { CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The vault feature — Vault's one feature (Phase 113 Theme J), copying the
 * monitor's template (`../monitor/manifest.ts`).
 *
 * **The hard rule: no stored value ever reaches a renderer from anything the
 * Vault calls or registers.** The view lists metadata (a secret's key and
 * whether it is set; a forge account's provider, host and login; a database
 * login's name, host and user), and writes one way: a new value goes in
 * (`secretsSet`), nothing comes back. `secretsGet` — which returns the
 * plaintext for `finance.twelveData` — is deliberately absent from `ipc`, and
 * `manifest.test.ts` walks {@link vaultResponseSchemas} to prove no response
 * carries a value field.
 *
 * Settings pages stay registered where they are (`FEATURE_SETTINGS_PAGES.forge`
 * → `accounts`, Agent's own page), so `settingsPages` is empty: since slice 3
 * the credential parts of those pages are this feature's components, which
 * Studio's pages render through the `VaultHost` port (`renderer/host.tsx`).
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const vaultManifest = defineFeatureManifest({
  feature: 'vault',
  owner: 'vault',
  views: [
    {
      id: 'vault',
      // Global: the vault is the machine's, not one checkout's.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Vault',
        description: 'Stored secrets, forge accounts, database logins and web-app sign-ins — set, rotate or remove, never read back',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.secretsHas,
    CHANNELS.secretsSet,
    CHANNELS.forgeAccounts,
    CHANNELS.forgeAccountAdd,
    CHANNELS.forgeAccountRemove,
    CHANNELS.dbListConnections,
    CHANNELS.dbDeleteConnection,
    CHANNELS.vaultGrantsList,
    CHANNELS.vaultGrantSet,
    CHANNELS.vaultGrantRevoke,
    CHANNELS.vaultPairingsList,
    CHANNELS.vaultPairingUnpair,
    // Web-app sign-ins (slice 3): which `persist:app-<id>` partitions hold cookies, and Sign out.
    // The browser feature answers them in Studio, whose sessions they are; the standalone Vault
    // answers "needs Studio" (`main/index.ts`).
    CHANNELS.webAppsSignIns,
    CHANNELS.webAppsSignOut,
    // Vault lock, audit & breach (Phase 118)
    CHANNELS.vaultLockStatus,
    CHANNELS.vaultLock,
    CHANNELS.vaultUnlock,
    CHANNELS.vaultAuditList,
    CHANNELS.vaultAuditVerify,
    CHANNELS.vaultAuditExport,
    CHANNELS.vaultBreachCheck,
  ],
  events: [],
  mcpTools: [],
});

export type VaultManifest = typeof vaultManifest;

export type VaultChannel = VaultManifest['ipc'][number];
