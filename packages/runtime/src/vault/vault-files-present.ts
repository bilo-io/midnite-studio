import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { INTEGRITY_KEY_FILE } from './integrity';
import { VAULT_NAMESPACES } from './vault-service';

/**
 * Whether the vault directory holds any vault file at all — a namespace file or the integrity key.
 * It only stats files and never touches the cipher, so it is safe on the boot path: a profile with
 * no vault has nothing to decrypt, and so no reason to reach the keychain.
 */
export function vaultFilesPresent(directory: string): boolean {
  const names = [...Object.values(VAULT_NAMESPACES).map((spec) => spec.fileName), INTEGRITY_KEY_FILE];
  return names.some((name) => existsSync(join(directory, name)));
}
