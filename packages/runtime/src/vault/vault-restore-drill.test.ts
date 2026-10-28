import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeCipher } from './testing';
import {
  exportVaultToFile,
  importVaultFromFile,
  previewVaultExportFile,
} from './vault-export';
import { createVaultService } from './vault-service';

describe('vault restore drill (Mac A -> Mac B)', () => {
  let dirA: string;
  let dirB: string;
  let exportPath: string;

  beforeEach(async () => {
    dirA = await mkdtemp(join(tmpdir(), 'midnite-vault-drill-a-'));
    dirB = await mkdtemp(join(tmpdir(), 'midnite-vault-drill-b-'));
    exportPath = join(dirA, 'vault-backup.json');
  });

  afterEach(async () => {
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  });

  it('runs complete restore drill: Mac A export -> fresh Mac B profile import', async () => {
    // 1. Setup Mac A vault
    const serviceA = createVaultService({
      directory: dirA,
      cipher: createFakeCipher(),
    });
    // Fresh unlock so re-auth is valid
    await serviceA.unlock();

    const clientA = serviceA.forApp('vault');
    await clientA.set('secrets', 'llm-key', 'sk-ant-mac-a-api-key-12345');
    await clientA.set('secrets', 'stt-key', 'eleven-labs-api-key-xyz');
    await clientA.set('forge-accounts', 'github:github.com:octocat', 'ghp_octocat_pat_9999');
    await clientA.set('db-credentials', 'prod-db', 'super-secret-db-pass', {
      fingerprint: 'fp:host=db.example.com;user=admin',
    });

    const passphrase = 'Restore-Drill-Passphrase-2026!';

    // 2. Export on Mac A
    const exportRes = await exportVaultToFile(serviceA, exportPath, passphrase);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;
    expect(exportRes.entryCount).toBe(4);

    // Verify audit log on Mac A
    const auditRecordsA = await serviceA.audit.read(10);
    const exportAudit = auditRecordsA.find((r) => r.op === 'export');
    expect(exportAudit).toBeDefined();
    expect(exportAudit?.result).toBe('ok');
    expect(exportAudit?.count).toBe(4);

    // 3. Setup fresh Mac B profile with completely different directory & cipher instance
    const serviceB = createVaultService({
      directory: dirB,
      cipher: createFakeCipher(),
    });
    await serviceB.unlock();
    const clientB = serviceB.forApp('vault');

    // Verify Mac B has none of these initially
    expect(await clientB.has('secrets', 'llm-key')).toBe(false);
    expect(await clientB.has('secrets', 'stt-key')).toBe(false);
    expect(await clientB.has('forge-accounts', 'github:github.com:octocat')).toBe(false);
    expect(await clientB.has('db-credentials', 'prod-db')).toBe(false);

    // 4. Preview import on Mac B
    const preview = await previewVaultExportFile(serviceB, exportPath, passphrase);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.totalEntries).toBe(4);
    expect(preview.entries.every((e) => e.existsLocally === false)).toBe(true);

    // 5. Import on Mac B
    const importRes = await importVaultFromFile(serviceB, exportPath, passphrase);
    expect(importRes).toMatchObject({ ok: true, importedCount: 4, skippedCount: 0 });

    // 6. Assert every entry exists and decrypts on Mac B!
    expect(await clientB.has('secrets', 'llm-key')).toBe(true);
    expect(await clientB.get('secrets', 'llm-key')).toBe('sk-ant-mac-a-api-key-12345');

    expect(await clientB.has('secrets', 'stt-key')).toBe(true);
    expect(await clientB.get('secrets', 'stt-key')).toBe('eleven-labs-api-key-xyz');

    expect(await clientB.has('forge-accounts', 'github:github.com:octocat')).toBe(true);
    expect(await clientB.get('forge-accounts', 'github:github.com:octocat')).toBe('ghp_octocat_pat_9999');

    expect(await clientB.has('db-credentials', 'prod-db')).toBe(true);
    expect(await clientB.get('db-credentials', 'prod-db')).toBe('super-secret-db-pass');
    expect(await clientB.fingerprint('db-credentials', 'prod-db')).toBe('fp:host=db.example.com;user=admin');

    // Verify audit log on Mac B recorded the import events
    const auditRecordsB = await serviceB.audit.read(100);
    const importAudits = auditRecordsB.filter((r) => r.op === 'import');
    expect(importAudits.length).toBe(4);

    // 7. Second import without overwrite skips existing
    const secondImport = await importVaultFromFile(serviceB, exportPath, passphrase, { overwriteExisting: false });
    expect(secondImport.ok).toBe(true);
    if (!secondImport.ok) return;
    expect(secondImport.importedCount).toBe(0);
    expect(secondImport.skippedCount).toBe(4);
  }, 30_000);
});
