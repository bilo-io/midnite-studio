import { describe, expect, it } from 'vitest';

import { loginShell, parseWhichOutput } from './login-shell';

/**
 * `parseWhichOutput` moved here from `claude-cli.test.ts` when Phase 21 gave
 * the login-shell probe a second caller. The cases are the original ones —
 * they were always about banner noise, not about Claude.
 */
describe('parseWhichOutput', () => {
  it('takes the last absolute-path line, skipping banner noise', () => {
    expect(parseWhichOutput('banner text\n/Users/x/.nvm/versions/node/v22/bin/claude\n')).toBe(
      '/Users/x/.nvm/versions/node/v22/bin/claude',
    );
  });

  it('returns null when no path appears', () => {
    expect(parseWhichOutput('claude not found')).toBeNull();
  });

  it('ignores a relative path — a shell function prints its name, not a file', () => {
    expect(parseWhichOutput('claude () {\n\t node cli.js\n}')).toBeNull();
  });

  it('returns null on empty output', () => {
    expect(parseWhichOutput('')).toBeNull();
  });
});

describe('loginShell', () => {
  it('prefers $SHELL', () => {
    const previous = process.env['SHELL'];
    process.env['SHELL'] = '/opt/homebrew/bin/fish';
    try {
      expect(loginShell()).toBe('/opt/homebrew/bin/fish');
    } finally {
      if (previous === undefined) delete process.env['SHELL'];
      else process.env['SHELL'] = previous;
    }
  });

  it('falls back to a platform default when $SHELL is unset', () => {
    const previous = process.env['SHELL'];
    delete process.env['SHELL'];
    try {
      expect(loginShell()).toBe(process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    } finally {
      if (previous !== undefined) process.env['SHELL'] = previous;
    }
  });
});
