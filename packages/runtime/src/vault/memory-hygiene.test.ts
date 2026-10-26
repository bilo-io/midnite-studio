import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAFE_PROCESS_ENV_KEYS, sanitizeSpawnEnv } from '../process-runner';
import { encryptSecret, withSecret } from './secure-store';
import { createFakeCipher } from './testing';
import { createVaultService } from './vault-service';

describe('vault memory hygiene and safe execution (Phase 118 Theme H)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vault-hygiene-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('withSecret zeroes buffer in finally after successful execution', async () => {
    const cipher = createFakeCipher();
    const secret = 'super-sensitive-token-12345';
    const encrypted = encryptSecret(cipher, secret);

    let capturedBuffer: Buffer | null = null;
    const res = await withSecret(cipher, encrypted, (buf) => {
      capturedBuffer = buf;
      expect(buf.toString('utf8')).toBe(secret);
      return 'done';
    });

    expect(res).toBe('done');
    expect(capturedBuffer).not.toBeNull();
    // After withSecret finishes, buffer must be zero-filled
    const allZeros = (capturedBuffer as unknown as Buffer).every((byte: number) => byte === 0);
    expect(allZeros).toBe(true);
  });

  it('withSecret zeroes buffer in finally when fn throws', async () => {
    const cipher = createFakeCipher();
    const secret = 'another-confidential-secret';
    const encrypted = encryptSecret(cipher, secret);

    let capturedBuffer: Buffer | null = null;
    await expect(
      withSecret(cipher, encrypted, (buf) => {
        capturedBuffer = buf;
        expect(buf.toString('utf8')).toBe(secret);
        throw new Error('Explosion during secret handling');
      }),
    ).rejects.toThrow('Explosion during secret handling');

    expect(capturedBuffer).not.toBeNull();
    // Buffer must be zeroed even when throwing
    const allZeros = (capturedBuffer as unknown as Buffer).every((byte: number) => byte === 0);
    expect(allZeros).toBe(true);
  });

  it('client.withSecret and service.withSecret zeroes buffer after resolve and throw', async () => {
    const cipher = createFakeCipher();
    const service = createVaultService({ directory: dir, cipher });
    const client = service.forApp('studio');

    const secretValue = 'ghp_secretTokenForTesting123';
    await client.set('secrets', 'test-key', secretValue);

    let capturedFromClient: Buffer | null = null;
    const clientRes = await client.withSecret('secrets', 'test-key', (buf) => {
      capturedFromClient = buf;
      expect(buf.toString('utf8')).toBe(secretValue);
      return 'client-ok';
    });

    expect(clientRes).toBe('client-ok');
    expect(capturedFromClient).not.toBeNull();
    expect((capturedFromClient as unknown as Buffer).every((b) => b === 0)).toBe(true);

    let capturedFromService: Buffer | null = null;
    const serviceRes = await service.withSecret('secrets', 'test-key', (buf) => {
      capturedFromService = buf;
      expect(buf.toString('utf8')).toBe(secretValue);
      return 'service-ok';
    });

    expect(serviceRes).toBe('service-ok');
    expect(capturedFromService).not.toBeNull();
    expect((capturedFromService as unknown as Buffer).every((b) => b === 0)).toBe(true);

    // Verify on throw
    let capturedOnThrow: Buffer | null = null;
    await expect(
      client.withSecret('secrets', 'test-key', (buf) => {
        capturedOnThrow = buf;
        throw new Error('client threw');
      }),
    ).rejects.toThrow('client threw');

    expect(capturedOnThrow).not.toBeNull();
    expect((capturedOnThrow as unknown as Buffer).every((b) => b === 0)).toBe(true);
  });

  it('sanitizeSpawnEnv removes sensitive ambient variables and keeps only allowlisted keys', () => {
    const dirtyEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/bin:/bin',
      SHELL: '/bin/zsh',
      USER: 'developer',
      HOME: '/Users/developer',
      GITHUB_TOKEN: 'ghp_secret_ambient_token',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      OPENAI_API_KEY: 'sk-ambient-secret-key-123',
      DATABASE_URL: 'postgres://user:password@localhost/db',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/...',
    };

    const clean = sanitizeSpawnEnv(dirtyEnv);

    // Clean env includes safe variables
    expect(clean['PATH']).toBe('/usr/bin:/bin');
    expect(clean['SHELL']).toBe('/bin/zsh');
    expect(clean['USER']).toBe('developer');
    expect(clean['HOME']).toBe('/Users/developer');

    // Clean env excludes secrets
    expect(clean['GITHUB_TOKEN']).toBeUndefined();
    expect(clean['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
    expect(clean['OPENAI_API_KEY']).toBeUndefined();
    expect(clean['DATABASE_URL']).toBeUndefined();
    expect(clean['SLACK_WEBHOOK_URL']).toBeUndefined();

    // Verify all keys in clean belong to SAFE_PROCESS_ENV_KEYS
    for (const k of Object.keys(clean)) {
      expect(SAFE_PROCESS_ENV_KEYS).toContain(k);
    }
  });

  it('vault-service and host server never log credential values', async () => {
    const cipher = createFakeCipher();
    const service = createVaultService({ directory: dir, cipher });

    const secretPassword = 'MySuperSecretPassword#2026';
    const client = service.forApp('studio');
    await client.set('secrets', 'database-pass', secretPassword);

    // Read back and reveal
    await client.get('secrets', 'database-pass');
    await service.reveal('secrets', 'database-pass');

    // Audit logs must never contain the plaintext secret
    const records = await service.audit.read(50);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      const serialized = JSON.stringify(record);
      expect(serialized).not.toContain(secretPassword);
    }
  });
});
