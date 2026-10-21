import { safeStorage } from 'electron';

import { pairingIdentitySource, type PairingIdentity } from '@midnite/studio-runtime';

/**
 * Vault's pairing key with the vault host (docs/APPS.md, "Pairing") — the **only** place Vault's
 * main touches `safeStorage`, and only to keep its own seed under its own keychain item
 * (`<userData>/vault-pairing.json`). Vault composes no vault service; it must be paired before the
 * host lets it list or unpair anything. `scripts/app-vault-grants.test.mjs` holds that. A smoke
 * run never reaches the keychain.
 */
export function vaultPairing(userData: string, smoke: boolean): () => PairingIdentity | null {
  return pairingIdentitySource({ userData, cipher: safeStorage, enabled: !smoke });
}
