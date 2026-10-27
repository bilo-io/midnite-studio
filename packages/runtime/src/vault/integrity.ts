import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { basename, join } from 'node:path';

import type { VaultAuditLog } from './audit/vault-audit';
import type { VaultCipher } from './secure-store';

export const INTEGRITY_FILE = 'vault-integrity.json';
export const INTEGRITY_KEY_FILE = 'vault-integrity.key';
const VAULT_MODE = 0o600;

export type IntegrityRecord = {
  version: 1;
  files: Record<string, string>; // fileName -> HMAC-SHA256 hex
};

export type VaultIntegrityOptions = {
  directory: string;
  cipher: VaultCipher;
  audit?: VaultAuditLog;
  onTamper?: (tamperedFile: string) => void;
};

export type VaultIntegrity = {
  getKey(): Promise<Buffer>;
  getKeySync(): Buffer;
  markWriting(filePath: string): () => void;
  updateFile(filePath: string): Promise<void>;
  updateFileSync(filePath: string): void;
  verifyFile(filePath: string): Promise<{ valid: boolean; tamperedFile?: string }>;
  verifyFileSync(filePath: string): { valid: boolean; tamperedFile?: string };
  verifyAll(): Promise<{ valid: boolean; tamperedFile?: string }>;
  startWatch(extraDirs?: string[]): () => void;
  getTamperedFile(): string | null;
  resetTamper(): void;
  setOnTamper(onTamper: (fileName: string) => void): void;
  setAudit(audit: VaultAuditLog): void;
};

/**
 * Checks whether a given filename is a vault-managed file subject to integrity protection.
 * Per Phase 118 Theme H:
 * (vault-*.json, vault-grants.json, vault-pairing.json, pairings.json, vault-audit.ndjson, passcode.json, *.vault.json)
 */
export function isVaultFile(fileName: string): boolean {
  if (
    fileName === INTEGRITY_FILE ||
    fileName === INTEGRITY_KEY_FILE ||
    fileName.endsWith('.tmp') ||
    fileName.startsWith('.')
  ) {
    return false;
  }
  return (
    fileName.endsWith('.vault.json') ||
    fileName.startsWith('vault-') ||
    fileName === 'pairings.json' ||
    fileName === 'passcode.json' ||
    fileName === 'lock-passcode.json' ||
    fileName === 'vault-audit.ndjson'
  );
}

/**
 * Calculates HMAC-SHA256 for a given buffer using the integrity key.
 */
export function calculateHmac(key: Buffer, data: Buffer | string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Creates the vault integrity manager (Phase 118 Theme H).
 * Holds an HMAC key encrypted via safeStorage and verifies file contents
 * to detect out-of-band tampering.
 */
export function createVaultIntegrity(options: VaultIntegrityOptions): VaultIntegrity {
  const { directory, cipher } = options;
  let audit = options.audit;
  let onTamper = options.onTamper;

  const integrityFilePath = join(directory, INTEGRITY_FILE);
  const keyFilePath = join(directory, INTEGRITY_KEY_FILE);

  let cachedKey: Buffer | null = null;
  let cachedRecord: IntegrityRecord | null = null;
  let tamperedFile: string | null = null;
  let watchers: FSWatcher[] = [];
  const writingFiles = new Set<string>();

  const getKeySync = (): Buffer => {
    if (cachedKey) return cachedKey;

    try {
      if (existsSync(keyFilePath)) {
        const rawEncrypted = readFileSync(keyFilePath);
        if (cipher.isEncryptionAvailable()) {
          const decryptedHex = cipher.decryptString(rawEncrypted);
          cachedKey = Buffer.from(decryptedHex, 'hex');
          return cachedKey;
        }
      }
    } catch {
      // Key doesn't exist yet or unreadable
    }

    // Generate fresh 32-byte HMAC key
    const freshKey = randomBytes(32);
    if (cipher.isEncryptionAvailable()) {
      try {
        const encrypted = cipher.encryptString(freshKey.toString('hex'));
        const tmp = `${keyFilePath}.${process.pid}.tmp`;
        writeFileSync(tmp, encrypted, { mode: VAULT_MODE });
        renameSync(tmp, keyFilePath);
        chmodSync(keyFilePath, VAULT_MODE);
      } catch {
        // Ignore filesystem write errors in read-only setups
      }
    }
    cachedKey = freshKey;
    return cachedKey;
  };

  const getKey = async (): Promise<Buffer> => getKeySync();

  const loadRecordSync = (): IntegrityRecord => {
    if (cachedRecord) return cachedRecord;
    try {
      if (existsSync(integrityFilePath)) {
        const raw = readFileSync(integrityFilePath, 'utf8');
        cachedRecord = JSON.parse(raw) as IntegrityRecord;
        return cachedRecord;
      }
    } catch {
      // File unreadable
    }
    cachedRecord = { version: 1, files: {} };
    return cachedRecord;
  };

  const saveRecordSync = (record: IntegrityRecord): void => {
    cachedRecord = record;
    try {
      const content = `${JSON.stringify(record, null, 2)}\n`;
      const tmp = `${integrityFilePath}.${process.pid}.tmp`;
      writeFileSync(tmp, content, { mode: VAULT_MODE, encoding: 'utf8' });
      renameSync(tmp, integrityFilePath);
      chmodSync(integrityFilePath, VAULT_MODE);
    } catch {
      // Ignore
    }
  };

  const baseline = (): void => {
    if (existsSync(integrityFilePath)) return;
    try {
      if (!existsSync(directory)) return;
      const files = readdirSync(directory);
      const record: IntegrityRecord = { version: 1, files: {} };
      const key = getKeySync();
      for (const file of files) {
        if (!isVaultFile(file)) continue;
        const fullPath = join(directory, file);
        try {
          const st = statSync(fullPath);
          if (st.isFile()) {
            const content = readFileSync(fullPath);
            record.files[file] = calculateHmac(key, content);
          }
        } catch {}
      }
      saveRecordSync(record);
    } catch {}
  };

  // Baseline on initialization if directory exists
  baseline();

  const handleTamperDetected = async (fileName: string) => {
    tamperedFile = fileName;
    if (audit) {
      await audit.log({
        op: 'tamper',
        app: 'vault',
        principal: 'system',
        result: 'locked',
        reason: `Tamper detected in ${fileName}`,
      });
    }
    onTamper?.(fileName);
  };

  const markWriting = (filePath: string): (() => void) => {
    const fileName = basename(filePath);
    if (!isVaultFile(fileName)) return () => {};
    writingFiles.add(fileName);
    return () => {
      writingFiles.delete(fileName);
    };
  };

  const updateFileSync = (filePath: string): void => {
    const fileName = basename(filePath);
    if (!isVaultFile(fileName)) return;

    writingFiles.add(fileName);
    try {
      const key = getKeySync();
      const content = readFileSync(filePath);
      const hmac = calculateHmac(key, content);

      const record = loadRecordSync();
      record.files[fileName] = hmac;
      saveRecordSync(record);
    } catch {
      // File may not exist yet or cannot be read
    } finally {
      writingFiles.delete(fileName);
    }
  };

  const updateFile = async (filePath: string): Promise<void> => updateFileSync(filePath);

  const verifyFileSync = (filePath: string): { valid: boolean; tamperedFile?: string } => {
    const fileName = basename(filePath);
    if (!isVaultFile(fileName)) {
      return { valid: true };
    }
    if (writingFiles.has(fileName)) {
      return { valid: true };
    }

    const record = loadRecordSync();
    const recordedHmac = record.files[fileName];

    try {
      if (!existsSync(filePath)) {
        if (recordedHmac) {
          void handleTamperDetected(fileName);
          return { valid: false, tamperedFile: fileName };
        }
        return { valid: true };
      }

      const content = readFileSync(filePath);
      const key = getKeySync();
      const currentHmac = calculateHmac(key, content);

      if (!recordedHmac) {
        // If file exists on disk and is a vault file with no record, treat as unverified/out-of-band
        void handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }

      if (currentHmac !== recordedHmac) {
        void handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }
      return { valid: true };
    } catch {
      if (recordedHmac) {
        void handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }
      return { valid: true };
    }
  };

  const verifyFile = async (filePath: string): Promise<{ valid: boolean; tamperedFile?: string }> => {
    const fileName = basename(filePath);
    if (!isVaultFile(fileName)) {
      return { valid: true };
    }
    if (writingFiles.has(fileName)) {
      return { valid: true };
    }

    const record = loadRecordSync();
    const recordedHmac = record.files[fileName];

    try {
      if (!existsSync(filePath)) {
        if (recordedHmac) {
          await handleTamperDetected(fileName);
          return { valid: false, tamperedFile: fileName };
        }
        return { valid: true };
      }

      const content = readFileSync(filePath);
      const key = getKeySync();
      const currentHmac = calculateHmac(key, content);

      if (!recordedHmac) {
        await handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }

      if (currentHmac !== recordedHmac) {
        await handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }
      return { valid: true };
    } catch {
      if (recordedHmac) {
        await handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }
      return { valid: true };
    }
  };

  const verifyAll = async (): Promise<{ valid: boolean; tamperedFile?: string }> => {
    const record = loadRecordSync();
    for (const [fileName, recordedHmac] of Object.entries(record.files)) {
      const filePath = join(directory, fileName);
      try {
        if (!existsSync(filePath)) {
          await handleTamperDetected(fileName);
          return { valid: false, tamperedFile: fileName };
        }
        const content = readFileSync(filePath);
        const key = getKeySync();
        const currentHmac = calculateHmac(key, content);
        if (currentHmac !== recordedHmac) {
          await handleTamperDetected(fileName);
          return { valid: false, tamperedFile: fileName };
        }
      } catch {
        await handleTamperDetected(fileName);
        return { valid: false, tamperedFile: fileName };
      }
    }
    return { valid: true };
  };

  const startWatch = (extraDirs: string[] = []): (() => void) => {
    const dirsToWatch = [directory, ...extraDirs];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    for (const dir of dirsToWatch) {
      try {
        if (!existsSync(dir)) continue;
        const watcher = fsWatch(dir, (_eventType, filename) => {
          if (!filename) return;
          const name = String(filename);
          if (!isVaultFile(name)) return;

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            void verifyFile(join(dir, name));
          }, 50);
        });
        watchers.push(watcher);
      } catch {
        // Watcher unavailable
      }
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const w of watchers) {
        try {
          w.close();
        } catch {}
      }
      watchers = [];
    };
  };

  return {
    getKey,
    getKeySync,
    markWriting,
    updateFile,
    updateFileSync,
    verifyFile,
    verifyFileSync,
    verifyAll,
    startWatch,
    getTamperedFile: () => tamperedFile,
    resetTamper: () => {
      tamperedFile = null;
    },
    setOnTamper: (fn) => {
      onTamper = fn;
    },
    setAudit: (a) => {
      audit = a;
    },
  };
}
