import { describe, expect, it } from 'vitest';
import {
  parseToolchainVersion,
  TOOLCHAIN_TOOLS,
  toolchainReleaseUrl,
} from './toolchain-version';

describe('toolchainReleaseUrl', () => {
  it('builds expected release URLs for all toolchain tools', () => {
    expect(toolchainReleaseUrl('homebrew', '4.4.18')).toBe(
      'https://github.com/Homebrew/brew/releases/tag/4.4.18',
    );
    expect(toolchainReleaseUrl('node', '22.12.0')).toBe(
      'https://github.com/nodejs/node/releases/tag/v22.12.0',
    );
    expect(toolchainReleaseUrl('pnpm', '9.15.0')).toBe(
      'https://github.com/pnpm/pnpm/releases/tag/v9.15.0',
    );
    expect(toolchainReleaseUrl('moon', '2.3.4')).toBe(
      'https://github.com/moonrepo/moon/releases/tag/v2.3.4',
    );
  });
});

describe('parseToolchainVersion', () => {
  it('parses Homebrew version string', () => {
    expect(parseToolchainVersion('homebrew', 'Homebrew 4.4.18')).toEqual({
      number: '4.4.18',
      label: 'v4.4.18',
      url: 'https://github.com/Homebrew/brew/releases/tag/4.4.18',
    });
  });

  it('parses Node.js version string with leading v', () => {
    expect(parseToolchainVersion('node', 'v22.12.0')).toEqual({
      number: '22.12.0',
      label: 'v22.12.0',
      url: 'https://github.com/nodejs/node/releases/tag/v22.12.0',
    });
  });

  it('parses bare pnpm version', () => {
    expect(parseToolchainVersion('pnpm', '9.15.0')).toEqual({
      number: '9.15.0',
      label: 'v9.15.0',
      url: 'https://github.com/pnpm/pnpm/releases/tag/v9.15.0',
    });
  });

  it('parses moon version output', () => {
    expect(parseToolchainVersion('moon', 'moon 2.3.4')).toEqual({
      number: '2.3.4',
      label: 'v2.3.4',
      url: 'https://github.com/moonrepo/moon/releases/tag/v2.3.4',
    });
  });

  it('handles empty or missing version gracefully', () => {
    expect(parseToolchainVersion('node', null)).toBeNull();
    expect(parseToolchainVersion('node', undefined)).toBeNull();
    expect(parseToolchainVersion('node', '')).toBeNull();
    expect(parseToolchainVersion('node', 'no version here')).toBeNull();
  });
});

describe('TOOLCHAIN_TOOLS metadata', () => {
  it('has valid documentation and repository URLs for every tool', () => {
    const keys = Object.keys(TOOLCHAIN_TOOLS) as (keyof typeof TOOLCHAIN_TOOLS)[];
    expect(keys).toEqual(['homebrew', 'node', 'pnpm', 'moon']);
    for (const key of keys) {
      const meta = TOOLCHAIN_TOOLS[key];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.docsUrl).toMatch(/^https:\/\//);
      expect(meta.repoUrl).toMatch(/^https:\/\/github\.com\//);
    }
  });
});
