import { safeStorage } from 'electron';

import { pairingIdentitySource, type PairingIdentity } from '@midnite/studio-runtime';

/**
 * Vanguard's pairing key with the vault host (docs/APPS.md, "Pairing"), kept for the Vault module it
 * mounts (Phase 124 Theme E.3) — the **only** place Vanguard's main touches `safeStorage`, and only for
 * its own seed (`<userData>/vault-pairing.json`). The host lists and unpairs nothing until it is paired.
 * `scripts/app-vault-grants.test.mjs` holds that. A smoke run never reaches the keychain.
 */
export function vanguardVaultPairing(userData: string, smoke: boolean): () => PairingIdentity | null {
  return pairingIdentitySource({ userData, cipher: safeStorage, enabled: !smoke });
}
