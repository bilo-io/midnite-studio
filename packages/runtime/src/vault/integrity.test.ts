import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeCipher } from './testing';
import { createVaultIntegrity, INTEGRITY_FILE, INTEGRITY_KEY_FILE } from './integrity';
import { createVaultGrants, VAULT_GRANTS_FILE } from './grants';
import { createVaultService } from './vault-service';

describe('vault integrity and tamper detection (Phase 118 Theme H)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vault-integrity-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('initializes HMAC key and creates vault-integrity.json', async () => {
    const cipher = createFakeCipher();
    const integrity = createVaultIntegrity({ directory: dir, cipher });

    const key = await integrity.getKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);

    expect(existsSync(join(dir, INTEGRITY_KEY_FILE))).toBe(true);
  });

  it('updates file HMAC and verifies correctly', async () => {
    const cipher = createFakeCipher();
    const integrity = createVaultIntegrity({ directory: dir, cipher });

    const testFile = join(dir, 'secrets.vault.json');
    writeFileSync(testFile, JSON.stringify({ version: 1, entries: { test: 'val' } }));

    await integrity.updateFile(testFile);
    expect(existsSync(join(dir, INTEGRITY_FILE))).toBe(true);

    const check = await integrity.verifyFile(testFile);
    expect(check.valid).toBe(true);
    expect(integrity.getTamperedFile()).toBeNull();
  });

  it('detects out-of-band tampering when a tracked file is edited', async () => {
    const cipher = createFakeCipher();
    let tampered: string | null = null;
    const integrity = createVaultIntegrity({
      directory: dir,
      cipher,
      onTamper: (file) => {
        tampered = file;
      },
    });

    const testFile = join(dir, 'secrets.vault.json');
    writeFileSync(testFile, JSON.stringify({ version: 1, entries: { test: 'val' } }));
    await integrity.updateFile(testFile);

    // Tamper with the file out-of-band
    writeFileSync(testFile, JSON.stringify({ version: 1, entries: { test: 'MALICIOUS_OVERWRITE' } }));

    const check = await integrity.verifyFile(testFile);
    expect(check.valid).toBe(false);
    expect(check.tamperedFile).toBe('secrets.vault.json');
    expect(integrity.getTamperedFile()).toBe('secrets.vault.json');
    expect(tampered).toBe('secrets.vault.json');

    const allCheck = await integrity.verifyAll();
    expect(allCheck.valid).toBe(false);
    expect(allCheck.tamperedFile).toBe('secrets.vault.json');
  });

  it('detects tampering when a tracked file is deleted', async () => {
    const cipher = createFakeCipher();
    const integrity = createVaultIntegrity({ directory: dir, cipher });

    const testFile = join(dir, 'test.vault.json');
    writeFileSync(testFile, 'initial content');
    await integrity.updateFile(testFile);

    await rm(testFile);

    const check = await integrity.verifyFile(testFile);
    expect(check.valid).toBe(false);
    expect(check.tamperedFile).toBe('test.vault.json');
  });

  it('detects tampering when an untracked sensitive file is created out-of-band', async () => {
    const cipher = createFakeCipher();
    const integrity = createVaultIntegrity({ directory: dir, cipher });

    // Seed integrity with one legitimate file so integrity record is active
    const legitFile = join(dir, 'legit.vault.json');
    writeFileSync(legitFile, 'legit');
    await integrity.updateFile(legitFile);

    // An attacker creates vault-grants.json directly without updateFile
    const maliciousGrants = join(dir, VAULT_GRANTS_FILE);
    writeFileSync(maliciousGrants, JSON.stringify({ version: 1, grants: { hacker: { secrets: '*' } } }));

    const check = await integrity.verifyFile(maliciousGrants);
    expect(check.valid).toBe(false);
    expect(check.tamperedFile).toBe(VAULT_GRANTS_FILE);
  });

  it('fs.watch detects out-of-band edits and triggers onTamper within one watch event', async () => {
    const cipher = createFakeCipher();
    let tamperedNamed: string | null = null;
    const integrity = createVaultIntegrity({
      directory: dir,
      cipher,
      onTamper: (file) => {
        tamperedNamed = file;
      },
    });

    const grantsFile = join(dir, VAULT_GRANTS_FILE);
    writeFileSync(grantsFile, JSON.stringify({ version: 1, grants: {} }));
    await integrity.updateFile(grantsFile);

    const stopWatch = integrity.startWatch();
    await new Promise((r) => setTimeout(r, 200));

    try {
      // Modify grants file out-of-band
      writeFileSync(grantsFile, JSON.stringify({ version: 1, grants: { spoofer: { secrets: '*' } } }));

      // Wait for fs.watch debounce
      await vi.waitFor(
        () => {
          expect(tamperedNamed).toBe(VAULT_GRANTS_FILE);
        },
        { timeout: 2000, interval: 20 },
      );

      expect(integrity.getTamperedFile()).toBe(VAULT_GRANTS_FILE);
    } finally {
      stopWatch();
    }
  });

  it('out-of-band grants tampering prevents authorization before grant decision', async () => {
    const cipher = createFakeCipher();
    const integrity = createVaultIntegrity({ directory: dir, cipher });

    const grants = createVaultGrants({
      directory: dir,
      onPersist: (p) => integrity.updateFileSync(p),
      checkIntegrity: () => integrity.verifyFileSync(join(dir, VAULT_GRANTS_FILE)).valid,
    });

    // Legitimate grant creation
    grants.set('coder', 'secrets', ['api-key']);
    expect(grants.authorize({ appId: 'coder', namespace: 'secrets', key: 'api-key', op: 'read' })).toBe(true);

    // Tamper with grants file out-of-band
    const raw = JSON.parse(readFileSync(join(dir, VAULT_GRANTS_FILE), 'utf8'));
    raw.grants.coder.secrets = '*';
    writeFileSync(join(dir, VAULT_GRANTS_FILE), JSON.stringify(raw));

    // Next authorize call detects tamper, denies authorization, and reports tamperedFile
    const authorized = grants.authorize({ appId: 'coder', namespace: 'secrets', key: 'other-key', op: 'read' });
    expect(authorized).toBe(false);
    expect(integrity.getTamperedFile()).toBe(VAULT_GRANTS_FILE);
  });

  it('service locks when tamper is detected and logs audit event', async () => {
    const cipher = createFakeCipher();
    const service = createVaultService({
      directory: dir,
      cipher,
    });

    expect(service.isLocked()).toBe(false);

    const client = service.forApp('studio');
    await client.set('secrets', 'k1', 'v1');

    // Tamper with secrets.vault.json directly
    const storePath = join(dir, 'secrets.vault.json');
    writeFileSync(storePath, JSON.stringify({ version: 1, entries: { k1: { encrypted: 'corrupted' } } }));

    // Verifying file triggers onTamper which locks the service
    await service.integrity.verifyFile(storePath);

    expect(service.isLocked()).toBe(true);
    expect(service.getTamperedFile()).toBe('secrets.vault.json');

    // Audit log contains tamper record
    const records = await service.audit.read(10);
    const tamperRecord = records.find((r) => r.op === 'tamper');
    expect(tamperRecord).toBeDefined();
    expect(tamperRecord?.result).toBe('locked');
    expect(tamperRecord?.reason).toContain('secrets.vault.json');
  });
});
