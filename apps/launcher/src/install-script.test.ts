// vitest/node: the installer is a file the release publishes verbatim; it never runs here
// (it writes /Applications). We only parse it and pin the names it must agree with the release on.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const path = fileURLToPath(new URL('../install.sh', import.meta.url));
const script = readFileSync(path, 'utf8');

describe('apps/launcher/install.sh', () => {
  it('parses as POSIX sh', () => {
    expect(spawnSync('sh', ['-n', path]).status).toBe(0);
  });

  it('names the launcher bundle, feed, tag and asset the release publishes', () => {
    expect(script).toContain('APP="Midnite Apps.app"');
    expect(script).toContain('midnite-launcher/version.json');
    expect(script).toContain('tag="midnite-launcher/v${version}"');
    expect(script).toContain('asset="midnite-launcher-${version}-arm64.zip"');
    expect(script).toContain('MIDNITE_LAUNCHER_VERSION');
  });

  it('carries no trace of Studio', () => {
    expect(script).not.toMatch(/studio/i);
  });
});
