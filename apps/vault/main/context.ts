import { vaultMain } from '@midnite/studio-feature-vault/main';
import {
  createIpcContext,
  createVaultGrants,
  createVaultService,
  type IpcContextElectron,
  type VaultCipher,
} from '@midnite/studio-runtime';

/** The electron pieces Vault's main needs, injected so registration is testable under bare vitest. */
export type VaultElectron = IpcContextElectron & {
  /** `safeStorage` in the app, a fake in tests — never the real keychain under test. */
  cipher: VaultCipher;
  /** The runtime's data directory (`vaultDirectory`), where the namespace files live. */
  directory: string;
};

/**
 * Composes the runtime vault over the runtime's data directory — as the `vault` app — and registers
 * the only channels Vault's renderer can call. Nothing here reads a stored value.
 */
export function registerVaultHandlers(el: VaultElectron): void {
  // Grants live beside the namespace files; Vault is trusted, but it is also where they are edited.
  const grants = createVaultGrants({ directory: el.directory });
  const service = createVaultService({ directory: el.directory, cipher: el.cipher, authorize: grants.authorize });
  vaultMain.register(createIpcContext(el), { vault: service.forApp('vault'), grants });
}
