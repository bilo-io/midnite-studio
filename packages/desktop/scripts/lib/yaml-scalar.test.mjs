import { describe, expect, it } from 'vitest';
import { extractYamlScalar } from './yaml-scalar.mjs';

const SAMPLE = `version: 0.1.0
files:
  - url: midnite-studio-0.1.0-arm64.zip
    sha512: abc123==
    size: 123456789
path: midnite-studio-0.1.0-arm64.zip
sha512: abc123==
releaseDate: '2026-09-05T12:34:56.789Z'
`;

describe('extractYamlScalar', () => {
  it('reads a top-level scalar', () => {
    expect(extractYamlScalar(SAMPLE, 'version')).toBe('0.1.0');
    expect(extractYamlScalar(SAMPLE, 'path')).toBe('midnite-studio-0.1.0-arm64.zip');
    expect(extractYamlScalar(SAMPLE, 'sha512')).toBe('abc123==');
  });

  it('strips a quoted scalar', () => {
    expect(extractYamlScalar(SAMPLE, 'releaseDate')).toBe('2026-09-05T12:34:56.789Z');
  });

  it('does not match an indented (nested) key of the same name', () => {
    // `files:` nests its own `url`/`sha512` — only the top-level `sha512`
    // (electron-updater's actual signal) should ever be returned.
    const nestedOnly = 'files:\n  - url: a.zip\n    sha512: nested-should-not-match\n';
    expect(extractYamlScalar(nestedOnly, 'sha512')).toBeNull();
  });

  it('is null for a missing key', () => {
    expect(extractYamlScalar(SAMPLE, 'notAKey')).toBeNull();
  });
});
