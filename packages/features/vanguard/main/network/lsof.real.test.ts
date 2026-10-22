// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection, createServer, type AddressInfo } from 'node:net';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { parseLsof } from './lsof';

const exec = promisify(execFile);
const LSOF = '/usr/sbin/lsof';

// The fixtures in lsof.test.ts are hand-written to the format's documentation. This one runs the real
// binary against a socket this test opens, so a field order the fixtures got wrong shows up here.
describe.skipIf(!existsSync(LSOF))('parseLsof against the real lsof', () => {
  it('reads an established loopback connection this process holds, from both ends', async () => {
    const server = createServer((socket) => socket.on('error', () => undefined));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const client = createConnection({ port, host: '127.0.0.1' });
    await new Promise<void>((resolve) => client.once('connect', resolve));
    try {
      const { stdout } = await exec(LSOF, ['-a', '-p', String(process.pid), '-i', '-nP', '-F', 'pcnPT']);
      const mine = parseLsof(stdout).filter((c) => c.pid === process.pid);
      expect(mine.find((c) => c.state === 'LISTEN' && c.local?.port === port)).toMatchObject({ remote: null });
      const established = mine.filter((c) => c.state === 'ESTABLISHED' && (c.remote?.port === port || c.local?.port === port));
      expect(established).toHaveLength(2);
      for (const c of established) {
        expect(c.protocol).toBe('TCP');
        expect(c.remote?.host).toBe('127.0.0.1');
      }
    } finally {
      client.destroy();
      server.close();
    }
  });
});
