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
      'ATATT3xFfGF0abcdefghijklmnopqrstuvwxyz0123456789',
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

  /**
   * Phase 93 Theme D — a verification bullet, not a build one. The in-app
   * issue composer (`report-issue-dialog.tsx`) introduces no new credential
   * shape: it never asks for a token and never stores one, it only wraps
   * the diagnostics text `mstudio:report:bundle` already returned (already
   * redacted, main-side) inside a markdown section alongside the user's own
   * free-text description. This proves that concatenation still ends up
   * fully redacted by the existing `SECRET_PATTERNS`/`FOREIGN_HOMES` sets
   * with no new pattern added for this phase — the shapes below are exactly
   * what such a composer-built body looks like once `gh issue create --body`
   * would receive it.
   */
  it('a composer-built issue body (description + diagnostics section) needs no new secret pattern', () => {
    const body = [
      'Clicked sync and it spun forever.',
      '',
      '---',
      '',
      '## Diagnostics',
      '',
      '```',
      'boot v0.3.1',
      '2026-01-01T00:00:00.000Z ERROR /Users/bilolwabona/Dev/midnite-studio failed: ghp_0123456789abcdefghijABCDEF',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      '```',
    ].join('\n');

    const out = redactPaths(body, '/Users/bilolwabona');

    expect(out).toContain('Clicked sync and it spun forever.');
    expect(out).toContain('## Diagnostics');
    expect(out).not.toContain('bilolwabona');
    expect(out).not.toContain('ghp_0123456789abcdefghijABCDEF');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(out).toContain('<redacted>');
  });
});
