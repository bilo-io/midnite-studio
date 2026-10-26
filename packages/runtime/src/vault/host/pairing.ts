import { createPrivateKey, createPublicKey, randomBytes as nodeRandomBytes, sign, verify, type KeyObject } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { decryptSecret, encryptSecret, type VaultCipher } from '../secure-store';

/**
 * Guest pairing (`docs/APPS.md`, "Pairing"): how the vault host knows a socket peer claiming
 * `coder` is Coder.
 *
 * Each guest app keeps a 32-byte random seed — an Ed25519 private key — created on its first run
 * and stored encrypted under the app's **own** keychain item, so another process cannot read it
 * without that app's keychain prompt. The host keeps only the public key (bound on first hello,
 * TOFU). Every connection answers a fresh host nonce with a signature, so a captured hello is
 * useless on the next connection, and reading the host's file of public keys lets nobody forge one.
 */

/** Ed25519 PKCS#8 DER is this fixed prefix plus the 32-byte seed. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
export const PAIRING_SEED_BYTES = 32;

export type PairingIdentity = {
  /** The raw 32-byte public key, base64url — what the host binds. */
  readonly publicKey: string;
  /** Signs the host's nonce for `appId`; base64url. */
  prove(appId: string, nonce: string): string;
};

/** What is signed: a domain tag, the app id and the nonce — so a proof for one app is not one for another. */
function proofMessage(appId: string, nonce: string): Buffer {
  return Buffer.from(`midnite-vault-pairing\0${appId}\0${nonce}`, 'utf8');
}

function privateKeyFromSeed(seed: Buffer): KeyObject {
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

/** An identity over a seed — exported for tests; apps go through {@link loadOrCreatePairingIdentity}. */
export function pairingIdentityFromSeed(seed: Buffer): PairingIdentity {
  if (seed.length !== PAIRING_SEED_BYTES) throw new Error('pairing seed must be 32 bytes');
  const privateKey = privateKeyFromSeed(seed);
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('could not derive the pairing public key');
  return {
    publicKey: jwk.x,
    prove: (appId, nonce) => sign(null, proofMessage(appId, nonce), privateKey).toString('base64url'),
  };
}

/** Whether `signature` is `publicKey`'s proof of `nonce` for `appId`. Never throws. */
export function verifyPairingProof(publicKey: string, appId: string, nonce: string, signature: string): boolean {
  try {
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' });
    return verify(null, proofMessage(appId, nonce), key, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

/** The file a guest app keeps its encrypted pairing seed in, under its own userData. */
export const PAIRING_IDENTITY_FILE = 'vault-pairing.json';

/**
 * A guest app's lazy, cached pairing identity — what `connectRuntimeVault({ identity })` takes. Read
 * on first connection (after `ready`, which `safeStorage` needs), never at module load; `enabled:
 * false` (a smoke run) never touches the cipher at all. A miss is retried on the next connection.
 */
export function pairingIdentitySource(options: {
  userData: string;
  cipher: VaultCipher;
  enabled: boolean;
}): () => PairingIdentity | null {
  let cached: PairingIdentity | null = null;
  return () => {
    if (!options.enabled) return null;
    cached ??= loadOrCreatePairingIdentity({ file: join(options.userData, PAIRING_IDENTITY_FILE), cipher: options.cipher });
    return cached;
  };
}

/**
 * The app's pairing identity, from `file` (in the app's userData), creating it on first run.
 *
 * `null` when the app cannot keep one: the keychain is unavailable (nothing is written, so a plain
 * seed never reaches disk). A file this cipher cannot open — the app's keychain item was reset — is
 * moved aside, never deleted, and a fresh seed is made; the host then reports a pairing conflict
 * until the user unpairs the app in Vault.
 */
export function loadOrCreatePairingIdentity(options: {
  file: string;
  cipher: VaultCipher;
  randomBytes?: (n: number) => Buffer;
  now?: () => number;
  onPersist?: (filePath: string) => void;
}): PairingIdentity | null {
  const { file, cipher } = options;
  if (!cipher.isEncryptionAvailable()) return null;
  let stored: unknown = null;
  try {
    stored = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    stored = null;
  }
  const encrypted = (stored as { seed?: unknown } | null)?.seed;
  if (typeof encrypted === 'string') {
    const seed = decryptSecret(cipher, encrypted);
    if (seed !== null) {
      const bytes = Buffer.from(seed, 'base64');
      if (bytes.length === PAIRING_SEED_BYTES) return pairingIdentityFromSeed(bytes);
    }
    try {
      renameSync(file, `${file}.unreadable-${(options.now ?? Date.now)()}`);
    } catch {
      return null;
    }
  }
  const seed = (options.randomBytes ?? nodeRandomBytes)(PAIRING_SEED_BYTES);
  try {
    const ciphertext = encryptSecret(cipher, seed.toString('base64'));
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, seed: ciphertext })}\n`, { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
    options.onPersist?.(file);
  } catch {
    return null;
  }
  return pairingIdentityFromSeed(seed);
}
