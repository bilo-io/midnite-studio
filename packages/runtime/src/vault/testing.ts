import { randomBytes } from 'node:crypto';

import { runtimeHostDirectory, vaultHostSocketPath } from '../host/host-record';
import { createVaultGrants, type VaultGrants } from './grants';
import { PAIRING_SEED_BYTES, pairingIdentityFromSeed, type PairingIdentity } from './host/pairing';
import { createPairingStore, type PairingStore } from './host/pairing-store';
import { startVaultHost } from './host/server';
import type { VaultCipher } from './secure-store';
import { createVaultService, type VaultAuthorize, type VaultClient, type VaultService } from './vault-service';

export type TestVaultHost = {
  socketPath: string;
  grants: VaultGrants;
  pairings: PairingStore;
  service: VaultService;
  /** The host's own in-process handle — what Studio reads through. */
  studio: VaultClient;
  close(): Promise<void>;
};

/**
 * A real vault host on a socket under `runtimeDirectory` (a temp dir), over a fake cipher — what a
 * guest app's tests reach their vault through, exactly as the app reaches Studio's. Grants come from
 * `runtimeDirectory`'s `vault-grants.json` unless `authorize` overrides them.
 */
export async function startTestVaultHost(options: {
  runtimeDirectory: string;
  cipher: VaultCipher;
  authorize?: VaultAuthorize;
}): Promise<TestVaultHost> {
  const grants = createVaultGrants({ directory: options.runtimeDirectory });
  const service = createVaultService({
    directory: options.runtimeDirectory,
    cipher: options.cipher,
    authorize: options.authorize ?? grants.authorize,
  });
  const pairings = createPairingStore({ hostDirectory: runtimeHostDirectory(options.runtimeDirectory) });
  const host = await startVaultHost({ socketPath: vaultHostSocketPath(options.runtimeDirectory), service, grants, pairings });
  return { socketPath: host.socketPath, grants, pairings, service, studio: service.forApp('studio'), close: () => host.close() };
}

/** A fresh pairing key for a test guest — a random seed, never a keychain. */
export function testPairingIdentity(): PairingIdentity {
  return pairingIdentityFromSeed(randomBytes(PAIRING_SEED_BYTES));
}

/** A {@link VaultCipher} for tests, with the knobs a vault test turns. */
export interface FakeCipher extends VaultCipher {
  /** Flip `isEncryptionAvailable()` — the "no working keychain" machine. */
  setAvailable(available: boolean): void;
  /** Every plaintext handed to `encryptString`, in order. */
  readonly encrypted: string[];
}

/**
 * A reversible stand-in for `electron.safeStorage`: `enc:<plaintext>` bytes,
 * the same scheme the desktop vault tests always mocked it with, so a file a
 * test writes reads back the way a real one would — and never touches the
 * user's keychain.
 */
export function createFakeCipher(): FakeCipher {
  let available = true;
  const encrypted: string[] = [];
  return {
    encrypted,
    setAvailable: (next) => {
      available = next;
    },
    isEncryptionAvailable: () => available,
    encryptString: (plaintext) => {
      encrypted.push(plaintext);
      return Buffer.from(`enc:${plaintext}`);
    },
    decryptString: (buf) => {
      const text = buf.toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('not encrypted by this cipher');
      return text.slice('enc:'.length);
    },
  };
}
