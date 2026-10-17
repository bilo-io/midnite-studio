import type { VaultHost } from '@midnite/studio-feature-vault/renderer';

/**
 * Vault's side of the vault feature's host port (Phase 113 Theme J slice 3). The standalone Vault has
 * no web apps to open — their sign-ins live in Studio's own partitions, which this process cannot see
 * (the listing answers "needs Studio") — and no forge kit: its Forge accounts section talks to the
 * bridge directly. So both are null.
 */
export const VAULT_APP_HOST: VaultHost = { openWebApp: null, forge: null };
