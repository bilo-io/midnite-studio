import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { appDataDirectory } from '@midnite/studio-runtime/data-directory';
import { SUITE_APP_DISPLAY_NAMES } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveSuiteSockets } from './suite-sockets';
import { makeAppDataBase, startFakeApp } from './suite-test-helpers';

let base = '';
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  if (base) rmSync(base, { recursive: true, force: true });
  base = '';
});

describe('resolveSuiteSockets', () => {
  it('returns [] when no suite app has a socket', async () => {
    base = makeAppDataBase();
    expect(await resolveSuiteSockets({ appDataBase: base })).toEqual([]);
  });

  it('finds every running app, in table order, with its display name', async () => {
    base = makeAppDataBase();
    const money = await startFakeApp(base, 'money', ['a']);
    const startup = await startFakeApp(base, 'startup', ['b']);
    closers.push(money.close, startup.close);
    const found = await resolveSuiteSockets({ appDataBase: base });
    expect(found).toEqual([
      { app: 'money', displayName: SUITE_APP_DISPLAY_NAMES.money, socketPath: money.socketPath },
      { app: 'startup', displayName: SUITE_APP_DISPLAY_NAMES.startup, socketPath: startup.socketPath },
    ]);
  });

  it('skips a stale .sock file that accepts no connection', async () => {
    base = makeAppDataBase();
    const dir = join(appDataDirectory(base, 'startup'), 'mcp');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'dead.sock'), '');
    expect(await resolveSuiteSockets({ appDataBase: base })).toEqual([]);
  });

  it('looks only at the apps it is given', async () => {
    base = makeAppDataBase();
    const money = await startFakeApp(base, 'money', []);
    closers.push(money.close);
    expect(await resolveSuiteSockets({ appDataBase: base, apps: { startup: 'Midnite Startup' } })).toEqual([]);
  });
});
