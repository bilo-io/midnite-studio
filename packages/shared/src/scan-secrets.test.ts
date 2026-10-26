import { describe, expect, it } from 'vitest';

import {
  isBenignEntropyToken,
  isHighEntropySecret,
  maskSecret,
  scanDiff,
  scanLine,
  scanText,
  shannonEntropy,
} from './scan-secrets';

describe('scan-secrets', () => {
  describe('maskSecret', () => {
    it('masks short strings to 8 asterisks', () => {
      expect(maskSecret('secret')).toBe('********');
      expect(maskSecret('12345678')).toBe('********');
    });

    it('masks strings longer than 8 characters to prefix...suffix', () => {
      expect(maskSecret('ghp_1234567890abcdef')).toBe('ghp_...cdef');
      expect(maskSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA...MPLE');
    });
  });

  describe('shannonEntropy', () => {
    it('returns 0 for empty or single repeated characters', () => {
      expect(shannonEntropy('')).toBe(0);
      expect(shannonEntropy('aaaaaaaaaa')).toBe(0);
    });

    it('measures entropy for varied character sets', () => {
      const hex = '0123456789abcdef';
      expect(shannonEntropy(hex)).toBeCloseTo(4.0, 1);
    });
  });

  describe('isBenignEntropyToken (negative cases)', () => {
    it('recognises 40-character commit SHAs as benign', () => {
      const commitSha = '4a5e1d7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e';
      expect(isBenignEntropyToken(commitSha)).toBe(true);
      expect(isHighEntropySecret(commitSha)).toBe(false);
    });

    it('recognises 64-character SHA-256 hashes as benign', () => {
      const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(isBenignEntropyToken(sha256)).toBe(true);
      expect(isHighEntropySecret(sha256)).toBe(false);
    });

    it('recognises UUIDs as benign', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(isBenignEntropyToken(uuid)).toBe(true);
      expect(isHighEntropySecret(uuid)).toBe(false);
    });

    it('recognises lockfile integrity hashes as benign', () => {
      const lockHash = 'sha512-v3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8==';
      expect(isBenignEntropyToken(lockHash)).toBe(true);
      expect(isHighEntropySecret(lockHash)).toBe(false);
    });
  });

  describe('scanText and scanLine', () => {
    it('detects GitHub PATs with pattern and masked preview', () => {
      const text = 'const token = "ghp_1234567890abcdef1234567890";';
      const findings = scanText(text);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        line: 1,
        column: 16,
        pattern: 'github-token',
        masked: 'ghp_...7890',
      });
    });

    it('detects AWS access keys', () => {
      const text = 'export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE";';
      const findings = scanText(text);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        pattern: 'aws-key',
        masked: 'AKIA...MPLE',
      });
    });

    it('detects live vault secrets even when prefixless', () => {
      const text = 'const key = "custom-arbitrary-vault-token-xyz";';
      const findings = scanText(text, {
        extraSecrets: ['custom-arbitrary-vault-token-xyz'],
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        pattern: 'vault-secret',
        masked: 'cust...-xyz',
      });
    });

    it('detects high-entropy random secrets without a fixed prefix', () => {
      const text = 'const secret = "c2VjcmV0VG9rZW5WYWx1ZTEyMzQ1Njc4OQ==";';
      const findings = scanText(text);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.pattern).toBe('high-entropy');
    });

    it('does not false-positive on commit SHAs or UUIDs in text', () => {
      const text = `
        const sha = "4a5e1d7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e";
        const id = "123e4567-e89b-12d3-a456-426614174000";
      `;
      const findings = scanText(text);
      expect(findings).toHaveLength(0);
    });
  });

  describe('scanDiff', () => {
    it('scans added lines in a unified diff and records file and line numbers', () => {
      const diff = `
diff --git a/src/config.ts b/src/config.ts
index 0000000..1111111 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@ function loadConfig() {
   const existing = true;
-  const oldToken = "none";
+  const token = "ghp_abcdef1234567890abcdef123456";
+  const normal = "hello world";
`;
      const findings = scanDiff(diff);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        file: 'src/config.ts',
        line: 11,
        pattern: 'github-token',
        masked: 'ghp_...3456',
      });
    });

    it('ignores deleted lines in diff', () => {
      const diff = `
diff --git a/secrets.txt b/secrets.txt
--- a/secrets.txt
+++ b/secrets.txt
@@ -1,2 +1,1 @@
-ghp_deletedtoken1234567890abcdef
 unchanged
`;
      const findings = scanDiff(diff);
      expect(findings).toHaveLength(0);
    });
  });
});
