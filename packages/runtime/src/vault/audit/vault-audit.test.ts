import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createVaultAuditLog, verifyAuditChain } from './vault-audit';

describe('vault-audit', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vault-audit-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes sequential hash-chained entries', async () => {
    const audit = createVaultAuditLog(tempDir);
    await audit.log({
      op: 'set',
      namespace: 'secrets',
      id: 'apiKey',
      app: 'studio',
      principal: 'user',
      result: 'ok',
    });
    await audit.log({
      op: 'get',
      namespace: 'secrets',
      id: 'apiKey',
      app: 'studio',
      principal: 'user',
      result: 'ok',
    });
    await audit.flush();

    const verifyRes = await audit.verify();
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.total).toBe(2);

    const records = await audit.read();
    expect(records.length).toBe(2);
    expect(records[0]?.op).toBe('get'); // Newest first
    expect(records[1]?.op).toBe('set');
  });

  it('detects tampering when an entry is edited', async () => {
    const audit = createVaultAuditLog(tempDir);
    for (let i = 1; i <= 5; i++) {
      await audit.log({
        op: 'set',
        namespace: 'secrets',
        id: `key-${i}`,
        app: 'studio',
        principal: 'user',
        result: 'ok',
      });
    }

    const initial = await audit.verify();
    expect(initial.valid).toBe(true);
    expect(initial.total).toBe(5);

    // Tamper with the 3rd line in the file
    const filePath = audit.getFilePath();
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    // Tamper with line 2 (3rd entry)
    lines[2] = lines[2]!.replace('key-3', 'tampered-key');
    await writeFile(filePath, lines.join('\n') + '\n');

    const tampered = await verifyAuditChain(filePath);
    expect(tampered.valid).toBe(false);
    expect(tampered.brokenSeq).toBe(4); // Line 4's prev won't match line 3's new hash
  });

  it('coalesces get operations within the 60s window', async () => {
    const audit = createVaultAuditLog(tempDir);
    const now = 1_000_000;

    // 10 get calls within the same minute
    for (let i = 0; i < 10; i++) {
      await audit.log({
        t: now + i * 1000,
        op: 'get',
        namespace: 'secrets',
        id: 'fast-poll',
        app: 'guest-app',
        principal: 'guest',
        result: 'ok',
      });
    }
    await audit.flush();

    const records = await audit.read();
    expect(records.length).toBe(1);
    expect(records[0]?.count).toBe(10);
    expect(records[0]?.id).toBe('fast-poll');
  });

  it('verifies 1000 lines cleanly', async () => {
    const audit = createVaultAuditLog(tempDir);
    for (let i = 0; i < 100; i++) {
      await audit.log({
        op: 'get',
        namespace: 'secrets',
        id: `k-${i}`,
        app: 'studio',
        principal: 'user',
        result: 'ok',
      });
    }
    await audit.flush();

    const res = await audit.verify();
    expect(res.valid).toBe(true);
    expect(res.total).toBe(100);
  });
});
