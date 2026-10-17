import { safeStorage } from 'electron';

import { pairingIdentitySource, type PairingIdentity } from '@midnite/studio-runtime';

/**
 * Media's pairing key with the vault host (docs/APPS.md, "Pairing") — the **only** place
 * Media's main touches `safeStorage`, and only to keep its own seed under its own keychain item
 * (`<userData>/vault-pairing.json`). Media composes no vault; `scripts/app-vault-grants.test.mjs`
 * holds that. A smoke run never reaches the keychain.
 */
export function mediaPairing(userData: string, smoke: boolean): () => PairingIdentity | null {
  return pairingIdentitySource({ userData, cipher: safeStorage, enabled: !smoke });
}
