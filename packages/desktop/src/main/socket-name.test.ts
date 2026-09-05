import { mkdtempSync, writeFileSync } from 'node:fs';
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

  it('fingerprints a real file deterministically from its size and mtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mstudio-socket-name-'));
    const file = join(dir, 'script.js');
    writeFileSync(file, 'console.log(1)');
    const first = fingerprintFile(file);
    const second = fingerprintFile(file);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
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
