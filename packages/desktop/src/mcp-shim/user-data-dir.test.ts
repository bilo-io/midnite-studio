import { describe, expect, it } from 'vitest';

import { resolveUserDataDir } from './user-data-dir';

describe('resolveUserDataDir', () => {
  it('uses Application Support on macOS', () => {
    expect(resolveUserDataDir('Midnite Studio', 'darwin', '/Users/x')).toBe(
      '/Users/x/Library/Application Support/Midnite Studio',
    );
  });

  it('uses %APPDATA% on Windows, falling back to a computed default', () => {
    const original = process.env['APPDATA'];
    delete process.env['APPDATA'];
    try {
      expect(resolveUserDataDir('Midnite Studio', 'win32', 'C:\\Users\\x')).toBe(
        'C:\\Users\\x\\AppData\\Roaming\\Midnite Studio',
      );
    } finally {
      if (original !== undefined) process.env['APPDATA'] = original;
    }
  });

  it('uses XDG_CONFIG_HOME (or ~/.config) elsewhere', () => {
    const original = process.env['XDG_CONFIG_HOME'];
    delete process.env['XDG_CONFIG_HOME'];
    try {
      expect(resolveUserDataDir('Midnite Studio', 'linux', '/home/x')).toBe(
        '/home/x/.config/Midnite Studio',
      );
    } finally {
      if (original !== undefined) process.env['XDG_CONFIG_HOME'] = original;
    }
  });
});
