import { createDecipheriv, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decryptVaultExport,
  encryptVaultExport,
  evaluatePassphraseStrength,
  type VaultExportPayload,
} from './vault-export';

describe('vault export/import (midnite-vault-export-v1)', () => {
  it('evaluates passphrase strength properly', () => {
    expect(evaluatePassphraseStrength('').valid).toBe(false);
    expect(evaluatePassphraseStrength('short').valid).toBe(false);
    expect(evaluatePassphraseStrength('12345678901').valid).toBe(false);

    const valid12 = evaluatePassphraseStrength('123456789012');
    expect(valid12.valid).toBe(true);
    expect(valid12.score).toBeGreaterThanOrEqual(1);

    const strong = evaluatePassphraseStrength('Correct-Horse-Battery-Staple-42!');
    expect(strong.valid).toBe(true);
    expect(strong.score).toBe(4);
    expect(strong.label).toBe('Strong');
  });

  it('encrypts and decrypts payload roundtrip', async () => {
    const payload: VaultExportPayload = {
      v: 1,
      exportedAt: new Date().toISOString(),
      namespaces: {
        secrets: {
          anthropic: { value: 'sk-ant-test-secret-value-12345' },
        },
        'forge-accounts': {
          'github:github.com:octocat': { value: 'ghp_testtoken1234567890' },
        },
        'db-credentials': {
          conn1: { value: 'db-password-987', fingerprint: 'fp-sha256-abc' },
        },
      },
    };

    const passphrase = 'Ultra-Secure-Passphrase-2026!';
    const envelope = await encryptVaultExport(payload, passphrase);

    expect(envelope.v).toBe(1);
    expect(envelope.cipher).toBe('aes-256-gcm');
    expect(envelope.kdf.name).toBe('scrypt');
    expect(envelope.kdf.N).toBe(131072);
    expect(envelope.kdf.maxmem).toBe(268435456);
    expect(envelope.iv).toHaveLength(24); // 12 bytes hex
    expect(envelope.tag).toHaveLength(32); // 16 bytes hex

    const decrypted = await decryptVaultExport(envelope, passphrase);
    expect(decrypted).toEqual(payload);
  });

  it('fails authentication on wrong passphrase or tampered tag', async () => {
    const payload: VaultExportPayload = {
      v: 1,
      exportedAt: new Date().toISOString(),
      namespaces: {
        secrets: { key: { value: 'secret' } },
      },
    };

    const envelope = await encryptVaultExport(payload, 'Correct-Passphrase-1234!');

    // Wrong passphrase fails auth
    await expect(decryptVaultExport(envelope, 'Wrong-Passphrase-5678!')).rejects.toThrow();

    // Tampered tag fails auth
    const tamperedTag = {
      ...envelope,
      tag: envelope.tag.slice(0, -1) + (envelope.tag.endsWith('0') ? '1' : '0'),
    };
    await expect(decryptVaultExport(tamperedTag, 'Correct-Passphrase-1234!')).rejects.toThrow();
  });

  it('can be decrypted by standard 16-line standalone Node.js script', async () => {
    const payload: VaultExportPayload = {
      v: 1,
      exportedAt: new Date().toISOString(),
      namespaces: {
        secrets: { myKey: { value: 'standalone-script-compatible-secret' } },
      },
    };

    const passphrase = 'MySuperPassphrase123!';
    const envelope = await encryptVaultExport(payload, passphrase);

    // Standalone node:crypto script simulation:
    const key = scryptSync(passphrase, Buffer.from(envelope.kdf.salt, 'hex'), 32, {
      N: envelope.kdf.N,
      r: envelope.kdf.r,
      p: envelope.kdf.p,
      maxmem: envelope.kdf.maxmem,
    });
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const decryptedBuf = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'hex')),
      decipher.final(),
    ]);
    const recovered = JSON.parse(decryptedBuf.toString('utf8'));

    expect(recovered).toEqual(payload);
  });
});
