// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { describe, expect, it, vi } from 'vitest';

import { optimizerManifest } from '@midnite/studio-feature-optimizer/main';
import { reportManifest } from '@midnite/studio-feature-report/main';
import { CHANNELS } from '@midnite/studio-shared';

import { registerCleanerHandlers, type CleanerElectron } from './context';
import { NOT_PORTED } from './services';

function fake() {
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const send = vi.fn();
  const trashItem = vi.fn(async () => undefined);
  const el: CleanerElectron = {
    ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener), on: () => undefined },
    report: { sink: () => null, homeDir: () => '/home', openExternal: () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
    trashItem,
    send,
    pickDirectory: async () => '/picked',
  };
  registerCleanerHandlers(el);
  const invoke = (channel: string, raw?: unknown) => {
    const h = handlers.get(channel);
    if (h === undefined) throw new Error(`no handler for ${channel}`);
    return Promise.resolve(h({}, raw));
  };
  return { handlers, invoke, send };
}

describe('registerCleanerHandlers', () => {
  it('registers every channel the optimizer feature declares, plus trash and the picker', () => {
    const { handlers } = fake();
    for (const channel of optimizerManifest.ipc) expect(handlers.has(channel), channel).toBe(true);
    for (const channel of [CHANNELS.optimizerTrashSummary, CHANNELS.optimizerTrashEmpty, CHANNELS.repoPickDirectory]) {
      expect(handlers.has(channel), channel).toBe(true);
    }
  });

  it('registers nothing else — no git, pty or browser channel', () => {
    const { handlers } = fake();
    const allowed = new Set<string>([
      ...optimizerManifest.ipc,
      ...reportManifest.ipc,
      ...reportManifest.sends,
      CHANNELS.optimizerTrashSummary,
      CHANNELS.optimizerTrashEmpty,
      CHANNELS.repoPickDirectory,
    ]);
    expect([...handlers.keys()].filter((c) => !allowed.has(c))).toEqual([]);
  });

  it('parses payloads before the feature sees them', async () => {
    const { invoke } = fake();
    const res = (await invoke(CHANNELS.optimizerClean, { paths: 'not-an-array' })) as { ok: boolean; message?: string };
    expect(res.ok).toBe(false);
    expect(res.message).toContain(CHANNELS.optimizerClean);
  });

  it('answers a host-bound operation with a message, never a rejection', async () => {
    const { invoke } = fake();
    expect(await invoke(CHANNELS.optimizerProcesses)).toEqual({ ok: false, message: NOT_PORTED });
    expect(await invoke(CHANNELS.optimizerKill, { pid: 1, expectArgv: 'x' })).toEqual({ ok: false, message: NOT_PORTED });
  });

  it('serves the scanners from the feature package — the catalogue and a workspace scan are real', async () => {
    const { invoke } = fake();
    const catalogue = (await invoke(CHANNELS.optimizerSystemCatalogue)) as { ok: boolean; value: unknown[] };
    expect(catalogue.ok).toBe(true);
    expect(catalogue.value.length).toBeGreaterThan(0);
    // No repo registry and no extra root: a scan has nothing to walk, and says so rather than failing.
    expect(await invoke(CHANNELS.optimizerScan, {})).toMatchObject({ ok: true, value: { items: [], totalBytes: 0 } });
  });

  it('answers the directory picker from the injected dialog', async () => {
    expect(await fake().invoke(CHANNELS.repoPickDirectory)).toBe('/picked');
  });
});
