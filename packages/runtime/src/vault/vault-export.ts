import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

import {
  VAULT_NAMESPACE_IDS,
  type VaultClient,
  type VaultNamespace,
  type VaultService,
} from './vault-service';

export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_FORMAT_ID = 'midnite-vault-export-v1';
export const EXPORT_SCRYPT_N = 131072; // 2^17
export const EXPORT_SCRYPT_R = 8;
export const EXPORT_SCRYPT_P = 1;
export const EXPORT_SCRYPT_MAXMEM = 268435456; // 256 MiB (128 * N * r = 128 MiB needed)
export const MIN_EXPORT_PASSPHRASE_LENGTH = 12;
const FILE_MODE_0600 = 0o600;

export type VaultExportKdf = {
  name: 'scrypt';
  N: number;
  r: number;
  p: number;
  maxmem: number;
  salt: string; // hex
};

export type VaultExportEnvelope = {
  v: 1;
  kdf: VaultExportKdf;
  cipher: 'aes-256-gcm';
  iv: string; // hex
  tag: string; // hex
  ciphertext: string; // hex
};

export type VaultExportEntry = {
  value: string;
  fingerprint?: string;
};

export type VaultExportPayload = {
  v: 1;
  exportedAt: string;
  namespaces: Record<string, Record<string, VaultExportEntry>>;
};

export type PassphraseStrength = {
  valid: boolean;
  score: number; // 0..4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  feedback?: string;
};

export function evaluatePassphraseStrength(passphrase: string): PassphraseStrength {
  if (!passphrase || passphrase.length < MIN_EXPORT_PASSPHRASE_LENGTH) {
    return {
      valid: false,
      score: 0,
      label: 'Too short',
      feedback: `Passphrase must be at least ${MIN_EXPORT_PASSPHRASE_LENGTH} characters.`,
    };
  }

  let score = 1;
  if (passphrase.length >= 16) score += 1;
  if (/[a-z]/.test(passphrase) && /[A-Z]/.test(passphrase)) score += 1;
  if (/[0-9]/.test(passphrase) && /[^a-zA-Z0-9]/.test(passphrase)) score += 1;

  const labels: Record<number, PassphraseStrength['label']> = {
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };

  return {
    valid: true,
    score,
    label: labels[score] ?? 'Fair',
  };
}

/**
 * Derives a 256-bit key using scrypt with parameters matching midnite-vault-export-v1.
 */
export async function deriveExportKey(passphrase: string, salt: Buffer, maxmem = EXPORT_SCRYPT_MAXMEM): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      32,
      {
        N: EXPORT_SCRYPT_N,
        r: EXPORT_SCRYPT_R,
        p: EXPORT_SCRYPT_P,
        maxmem,
      },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      },
    );
  });
}

/**
 * Encrypts a vault export payload into a versioned envelope using AES-256-GCM.
 */
export async function encryptVaultExport(
  payload: VaultExportPayload,
  passphrase: string,
): Promise<VaultExportEnvelope> {
  const evalResult = evaluatePassphraseStrength(passphrase);
  if (!evalResult.valid) {
    throw new Error(evalResult.feedback ?? 'Invalid passphrase');
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveExportKey(passphrase, salt);

  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintextBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      v: EXPORT_FORMAT_VERSION,
      kdf: {
        name: 'scrypt',
        N: EXPORT_SCRYPT_N,
        r: EXPORT_SCRYPT_R,
        p: EXPORT_SCRYPT_P,
        maxmem: EXPORT_SCRYPT_MAXMEM,
        salt: salt.toString('hex'),
      },
      cipher: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
    };
  } finally {
    key.fill(0);
  }
}

/**
 * Decrypts and authenticates a versioned vault export envelope.
 * Throws if authentication fails or passphrase is wrong.
 */
export async function decryptVaultExport(
  envelope: VaultExportEnvelope,
  passphrase: string,
): Promise<VaultExportPayload> {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported export format version: ${String(envelope.v)}`);
  }
  if (envelope.cipher !== 'aes-256-gcm') {
    throw new Error(`Unsupported cipher: ${envelope.cipher}`);
  }
  if (envelope.kdf?.name !== 'scrypt') {
    throw new Error(`Unsupported KDF: ${envelope.kdf?.name}`);
  }

  const salt = Buffer.from(envelope.kdf.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  if (tag.length !== 16) {
    throw new Error(`Invalid authentication tag length: expected 16 bytes, got ${tag.length}`);
  }
  const ciphertext = Buffer.from(envelope.ciphertext, 'hex');

  const maxmem = envelope.kdf.maxmem || EXPORT_SCRYPT_MAXMEM;
  const key = await deriveExportKey(passphrase, salt, maxmem);

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const decryptedBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(decryptedBuffer.toString('utf8')) as VaultExportPayload;
    return payload;
  } finally {
    key.fill(0);
  }
}

/**
 * Collects all decrypted entries across all vault namespaces.
 */
export async function collectVaultPayload(client: VaultClient): Promise<VaultExportPayload> {
  const namespaces: Record<string, Record<string, VaultExportEntry>> = {};

  for (const ns of VAULT_NAMESPACE_IDS) {
    const keys = await client.keys(ns);
    if (keys.length > 0) {
      namespaces[ns] = {};
      for (const key of keys) {
        const val = await client.get(ns, key);
        if (val !== null) {
          const fingerprint = await client.fingerprint(ns, key);
          namespaces[ns][key] = {
            value: val,
            ...(fingerprint ? { fingerprint } : {}),
          };
        }
      }
    }
  }

  return {
    v: 1,
    exportedAt: new Date().toISOString(),
    namespaces,
  };
}

export type ExportVaultResult =
  | { ok: true; path: string; entryCount: number }
  | { ok: false; error: string };

/**
 * Full export flow: checks re-auth, gathers entries, encrypts, writes 0600 file, and writes audit line.
 */
export async function exportVaultToFile(
  service: VaultService,
  outputPath: string,
  passphrase: string,
): Promise<ExportVaultResult> {
  if (service.isLocked()) {
    return { ok: false, error: 'Vault is locked. Unlock before exporting.' };
  }
  if (!service.isReauthValid()) {
    return { ok: false, error: 'Fresh re-authentication required (unlock within last 60 seconds).' };
  }

  const client = service.forApp('vault');
  const payload = await collectVaultPayload(client);

  let totalEntries = 0;
  for (const ns of Object.values(payload.namespaces)) {
    totalEntries += Object.keys(ns).length;
  }

  try {
    const envelope = await encryptVaultExport(payload, passphrase);
    const content = JSON.stringify(envelope, null, 2);
    await writeFile(outputPath, content, { mode: FILE_MODE_0600, encoding: 'utf8' });
    // Explicit chmod to guarantee 0600 on platforms where umask affects writeFile
    await chmod(outputPath, FILE_MODE_0600).catch(() => {});

    await service.audit.log({
      op: 'export',
      app: 'vault',
      principal: 'user',
      result: 'ok',
      count: totalEntries,
    });

    return { ok: true, path: outputPath, entryCount: totalEntries };
  } catch (err) {
    await service.audit.log({
      op: 'export',
      app: 'vault',
      principal: 'user',
      result: 'failed',
      reason: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type VaultImportPreviewEntry = {
  namespace: string;
  key: string;
  existsLocally: boolean;
  hasFingerprint: boolean;
};

export type VaultImportPreviewResult =
  | {
      ok: true;
      totalEntries: number;
      entries: VaultImportPreviewEntry[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Reads and decrypts an export file to preview entry names without committing changes.
 */
export async function previewVaultExportFile(
  service: VaultService,
  inputPath: string,
  passphrase: string,
): Promise<VaultImportPreviewResult> {
  if (service.isLocked()) {
    return { ok: false, error: 'Vault is locked.' };
  }
  if (!service.isReauthValid()) {
    return { ok: false, error: 'Fresh re-authentication required (unlock within last 60 seconds).' };
  }

  try {
    const raw = await readFile(inputPath, 'utf8');
    const envelope = JSON.parse(raw) as VaultExportEnvelope;
    const payload = await decryptVaultExport(envelope, passphrase);

    const client = service.forApp('vault');
    const previewEntries: VaultImportPreviewEntry[] = [];

    for (const [namespace, entries] of Object.entries(payload.namespaces)) {
      const ns = namespace as VaultNamespace;
      for (const [key, entry] of Object.entries(entries)) {
        const existsLocally = await client.has(ns, key);
        previewEntries.push({
          namespace,
          key,
          existsLocally,
          hasFingerprint: !!entry.fingerprint,
        });
      }
    }

    return {
      ok: true,
      totalEntries: previewEntries.length,
      entries: previewEntries,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message.includes('Unsupported state')
          ? 'Invalid passphrase or corrupt export file.'
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}

export type VaultImportResult =
  | {
      ok: true;
      importedCount: number;
      skippedCount: number;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Imports entries from an export file:
 * - Checks re-auth
 * - Decrypts payload
 * - Merges entries (defaulting to keep existing when overwriteExisting is false)
 * - Writes audit log line per imported entry
 */
export async function importVaultFromFile(
  service: VaultService,
  inputPath: string,
  passphrase: string,
  options?: { overwriteExisting?: boolean },
): Promise<VaultImportResult> {
  if (service.isLocked()) {
    return { ok: false, error: 'Vault is locked.' };
  }
  if (!service.isReauthValid()) {
    return { ok: false, error: 'Fresh re-authentication required (unlock within last 60 seconds).' };
  }

  const overwrite = options?.overwriteExisting ?? false;

  let payload: VaultExportPayload;
  try {
    const raw = await readFile(inputPath, 'utf8');
    const envelope = JSON.parse(raw) as VaultExportEnvelope;
    payload = await decryptVaultExport(envelope, passphrase);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message.includes('Unsupported state')
          ? 'Invalid passphrase or corrupt export file.'
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }

  const client = service.forApp('vault');
  let importedCount = 0;
  let skippedCount = 0;

  for (const [namespace, entries] of Object.entries(payload.namespaces)) {
    const ns = namespace as VaultNamespace;
    for (const [key, entry] of Object.entries(entries)) {
      const exists = await client.has(ns, key);
      if (exists && !overwrite) {
        skippedCount++;
        continue;
      }

      try {
        await client.set(
          ns,
          key,
          entry.value,
          entry.fingerprint ? { fingerprint: entry.fingerprint } : undefined,
        );
        await service.audit.log({
          op: 'import',
          namespace: ns,
          id: key,
          app: 'vault',
          principal: 'user',
          result: 'ok',
        });
        importedCount++;
      } catch (err) {
        await service.audit.log({
          op: 'import',
          namespace: ns,
          id: key,
          app: 'vault',
          principal: 'user',
          result: 'failed',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    ok: true,
    importedCount,
    skippedCount,
  };
}
