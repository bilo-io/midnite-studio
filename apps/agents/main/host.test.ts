// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { agentsModuleMain } from '@midnite/studio-module-agents/main';
import { coderModuleMain } from '@midnite/studio-module-coder/main';
import { creatorModuleMain } from '@midnite/studio-module-creator/main';

import { registerAgentsHost } from './host';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'agents-host-'));
  const handlers = new Map<string, number>();
  const on = new Map<string, number>();
  const registered = registerAgentsHost({
    ipcMain: {
      handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
      on: (c) => void on.set(c, (on.get(c) ?? 0) + 1),
    },
    trashItem: async () => undefined,
    send: () => undefined,
    report: { sink: () => null, homeDir: () => dir, openExternal: async () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
    userData: dir,
    vaultDirectory: join(dir, 'runtime'),
    pairing: () => null,
    loginPath: async () => undefined,
    coder: {
      pickDirectory: async () => null,
      senderWindowId: () => null,
      onWindowClosed: () => undefined,
      windows: { anyWindowVisible: () => true, idleState: () => 'active' },
      dialogs: { pickFile: async () => null, pickSavePath: async () => null },
    },
    creator: {
      videoTemplateRoot: join(dir, 'templates'),
      openPath: async () => '',
      revealPath: () => undefined,
      pickSavePath: async () => null,
      pickImportFiles: async () => null,
      printToPdf: async () => Buffer.alloc(0),
      ffmpegStatus: async () => ({ found: false, reason: 'test' }),
    },
  });
  return { handlers, on, registered };
}

describe('registerAgentsHost', () => {
  it('mounts Agents, Coder and Creator: every module’s channels are registered, each exactly once', async () => {
    const { handlers, on, registered } = setup();
    const all = new Set([...handlers.keys(), ...on.keys()]);
    for (const module of [agentsModuleMain, coderModuleMain, creatorModuleMain]) {
      for (const channel of module.channels) expect(all, `${module.feature}: ${channel}`).toContain(channel);
    }
    // Report an Issue is each module's too (the same report feature): one handler, the first mount's.
    expect(Math.max(...handlers.values())).toBe(1);
    expect([...on].filter(([, n]) => n > 1)).toEqual([]);
    // Every invoke handler is declared by a module (the features' `channels` list invoke channels only; their
    // one-way channels are checked above for double registration instead).
    const declared = new Set([...agentsModuleMain.channels, ...coderModuleMain.channels, ...creatorModuleMain.channels]);
    expect([...handlers.keys()].filter((channel) => !declared.has(channel))).toEqual([]);
    await registered.shutdown();
  });
});
