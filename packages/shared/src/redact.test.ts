import { describe, expect, it } from 'vitest';

import { redactPaths, redactRecord } from './redact';

describe('redactPaths', () => {
  it('collapses the named home directory to ~', () => {
    const text = 'ENOENT: /Users/bilolwabona/Dev/midnite-studio/packages/app/src/main.tsx';
    const out = redactPaths(text, '/Users/bilolwabona');
    expect(out).toBe('ENOENT: ~/Dev/midnite-studio/packages/app/src/main.tsx');
    expect(out).not.toContain('bilolwabona');
  });

  it('collapses a Windows home directory, either separator', () => {
    const text = 'at C:\\Users\\bo\\app\\main.js and C:/Users/bo/app/other.js';
    const out = redactPaths(text, 'C:\\Users\\bo');
    expect(out).not.toMatch(/bo\b/);
    expect(out).toContain('~\\app\\main.js');
    expect(out).toContain('~/app/other.js');
  });

  it('collapses a home-shaped path this process did not name', () => {
    // A second account's tree, or a path baked into a dependency at build time.
    const out = redactPaths('/Users/someoneelse/lib/x.js', '/Users/me');
    expect(out).toBe('~/lib/x.js');
  });

  it('leaves relative paths, shas and branch names alone', () => {
    const text = 'packages/app/src/app.tsx @ 3f2f6efabc on feature/p65-report';
    expect(redactPaths(text, '/Users/me')).toBe(text);
  });

  it('redacts credential-shaped strings', () => {
    const secrets = [
      'ghp_0123456789abcdefghijABCDEF',
      'github_pat_11ABCDEFG0abcdefghijklmnop',
      'sk-ant-api03-abcdefghijklmnop',
      'xoxb-123456789012-abcdefghij',
    ];
    for (const secret of secrets) {
      const out = redactPaths(`failed with ${secret}`, '/Users/me');
      expect(out).not.toContain(secret);
      expect(out).toContain('<redacted>');
    }
  });

  it('redacts a bearer header and keeps the shape readable', () => {
    const out = redactPaths('Authorization: Bearer abcdefghijklmnopqrstuvwxyz', '/Users/me');
    expect(out).toBe('Authorization: <redacted>');
  });

  it('redacts credentials embedded in a remote URL but keeps the host', () => {
    const out = redactPaths('https://someone:hunter22222@github.com/bilo-io/x.git', '/Users/me');
    expect(out).toContain('github.com/bilo-io/x.git');
    expect(out).not.toContain('hunter22222');
  });

  it('is a no-op on an empty string and needs no home directory', () => {
    expect(redactPaths('')).toBe('');
    expect(redactPaths('plain message')).toBe('plain message');
  });

  it('redacts the string leaves of a record and leaves the rest', () => {
    const out = redactRecord(
      { message: 'boom at /Users/me/x', at: 12, ok: true },
      '/Users/me',
    );
    expect(out).toEqual({ message: 'boom at ~/x', at: 12, ok: true });
  });
});
