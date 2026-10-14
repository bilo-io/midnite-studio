import type { VaultCipher } from './secure-store';

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
