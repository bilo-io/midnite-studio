import { describe, expect, it } from 'vitest';

import { detectInstallMethod, parseClaudeVersion, parseWhichOutput } from './claude-cli';

describe('parseClaudeVersion', () => {
  it('finds the semver in typical output', () => {
    expect(parseClaudeVersion('2.1.34 (Claude Code)')).toBe('2.1.34');
    expect(parseClaudeVersion('claude, version 1.0.128\n')).toBe('1.0.128');
  });

  it('survives login-shell banners before the version line', () => {
    expect(parseClaudeVersion('Last login: Tue\nmotd banner\n2.0.5 (Claude Code)')).toBe('2.0.5');
  });

  it('is not fooled by a bare semver in a banner', () => {
    // Branded form wins over an earlier bare version…
    expect(parseClaudeVersion('nvm 0.39.7 loaded\n2.1.34 (Claude Code)')).toBe('2.1.34');
    // …and without the brand, the LAST semver wins (banners print first).
    expect(parseClaudeVersion('tool 1.2.3 update available\nclaude version 2.1.34')).toBe('2.1.34');
  });

  it('returns null when nothing parses', () => {
    expect(parseClaudeVersion('command not found: claude')).toBeNull();
    expect(parseClaudeVersion('')).toBeNull();
  });
});

describe('parseWhichOutput', () => {
  it('takes the last absolute-path line, skipping banner noise', () => {
    expect(parseWhichOutput('banner text\n/Users/x/.nvm/versions/node/v22/bin/claude\n')).toBe(
      '/Users/x/.nvm/versions/node/v22/bin/claude',
    );
  });

  it('returns null when no path appears', () => {
    expect(parseWhichOutput('claude not found')).toBeNull();
  });
});

describe('detectInstallMethod', () => {
  it.each([
    ['/Users/x/.nvm/versions/node/v22.12.0/bin/claude', 'npm'],
    ['/usr/local/lib/node_modules/.bin/claude', 'npm'],
    ['/opt/homebrew/bin/../Cellar/claude-code/2.0.0/bin/claude', 'brew'],
    ['/opt/homebrew/bin/claude', 'brew'],
    ['/Users/x/.local/bin/claude', 'native'],
    ['/usr/bin/claude', 'unknown'],
    [null, 'unknown'],
  ] as const)('%s → %s', (path, method) => {
    expect(detectInstallMethod(path)).toBe(method);
  });
});
