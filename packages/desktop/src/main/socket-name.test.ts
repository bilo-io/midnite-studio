import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  brokerSocketName,
  fingerprintFile,
  isSocketPathTooLong,
  mcpSocketName,
  SUN_PATH_MAX_BYTES,
} from './socket-name';

describe('socket-name', () => {
  it('names a broker socket with version, build id and packaged suffix', () => {
    expect(brokerSocketName('1.2.3', 'abcd1234', true)).toBe('1.2.3-abcd1234.sock');
    expect(brokerSocketName('1.2.3', 'abcd1234', false)).toBe('1.2.3-abcd1234-dev.sock');
  });

  it('names an MCP socket the same way, in its own namespace', () => {
    expect(mcpSocketName('1.2.3', 'abcd1234', true)).toBe('1.2.3-abcd1234.sock');
    // Same scheme as the broker's — the two live under different directories
    // (`broker/`, `mcp/`), so an identical filename never collides on disk.
    expect(mcpSocketName('1.2.3', 'abcd1234', true)).toBe(brokerSocketName('1.2.3', 'abcd1234', true));
  });

  it('fingerprints a real file deterministically from its content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mstudio-socket-name-'));
    const file = join(dir, 'script.js');
    writeFileSync(file, 'console.log(1)');
    const first = fingerprintFile(file);
    const second = fingerprintFile(file);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
  });

  /*
   * Regression for the legacy-session banner appearing on every restart
   * (adhoc): `desktop/scripts/bundle.mjs` re-esbuilds `broker.js` on every
   * `moon run desktop:start`, and its output is byte-identical for an
   * unchanged source tree, but the mtime always advances. A fingerprint keyed
   * on stat metadata (the old implementation) therefore minted a new
   * `buildId` — and so a new broker socket name — on every dev restart of the
   * exact same build, which made `broker-client.ts` treat its own immediate
   * predecessor as a stale, legacy peer every single time. This asserts the
   * fingerprint survives a rewrite-with-identical-bytes at a different mtime,
   * and still changes when the bytes genuinely do.
   */
  it('does not change when a file is rewritten with the same bytes at a later mtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mstudio-socket-name-'));
    const file = join(dir, 'broker.js');
    writeFileSync(file, 'console.log("broker")');
    const first = fingerprintFile(file);

    // Same bytes, a full minute later — what `bundle.mjs` does to `broker.js`
    // on a dev restart with no source change at all.
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);
    const second = fingerprintFile(file);

    expect(second).toBe(first);
  });

  it('changes the fingerprint when the file content actually changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mstudio-socket-name-'));
    const file = join(dir, 'broker.js');
    writeFileSync(file, 'console.log("broker")');
    const first = fingerprintFile(file);

    writeFileSync(file, 'console.log("broker v2")');
    const second = fingerprintFile(file);

    expect(second).not.toBe(first);
  });

  it('reports "unknown" for a file that does not exist', () => {
    expect(fingerprintFile('/nonexistent/path/does-not-exist.js')).toBe('unknown');
  });

  it('flags a socket path at or beyond the sun_path ceiling', () => {
    const short = '/tmp/x.sock';
    const long = `/tmp/${'a'.repeat(SUN_PATH_MAX_BYTES)}.sock`;
    expect(isSocketPathTooLong(short)).toBe(false);
    expect(isSocketPathTooLong(long)).toBe(true);
    expect(Buffer.byteLength(long)).toBeGreaterThanOrEqual(SUN_PATH_MAX_BYTES);
  });
});
