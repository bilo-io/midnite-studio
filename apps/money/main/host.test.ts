// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { financeManifest } from '@midnite/studio-feature-finance/main';
import { accountantModuleMain } from '@midnite/studio-module-accountant/main';
import { createFakeCipher, startTestVaultHost, testPairingIdentity, type TestVaultHost } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerMoneyHost } from './host';

let dir: string;
let host: TestVaultHost | null = null;
afterEach(async () => {
  await host?.close();
  host = null;
  rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  dir = mkdtempSync(join(tmpdir(), 'money-host-'));
  mkdirSync(join(dir, 'runtime'));
  host = await startTestVaultHost({ runtimeDirectory: join(dir, 'runtime'), cipher: createFakeCipher() });
  const handlers = new Map<string, number>();
  const registered = registerMoneyHost({
    ipcMain: { handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1), on: () => undefined },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: join(dir, 'userData'),
    vaultDirectory: join(dir, 'runtime'),
    pairing: () => testPairingIdentity(),
    appDataBase: dir,
    pickCsv: async () => null,
    saveCsv: async () => null,
  });
  return { handlers, registered };
}

describe('registerMoneyHost', () => {
  it('registers the ledger channel and every finance channel, each exactly once', async () => {
    const { handlers, registered } = await setup();
    for (const channel of [CHANNELS.ledger, ...financeManifest.ipc]) expect(handlers.get(channel), channel).toBe(1);
    expect(accountantModuleMain.channels).toEqual([CHANNELS.ledger]);
    registered.stopRates();
    await registered.dispose();
  });

  it('hands back a books service that answers the envelope', async () => {
    const { registered } = await setup();
    expect(await registered.ledger.listBooks()).toMatchObject({ ok: false });
    registered.stopRates();
    await registered.dispose();
  });
});
