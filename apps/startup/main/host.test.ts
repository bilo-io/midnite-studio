// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { accountantModuleMain } from '@midnite/studio-module-accountant/main';
import { startupModuleMain } from '@midnite/studio-module-startup/main';
import { CHANNELS, STARTUP_AGENTS_OFF_MESSAGE, STARTUP_MCP_TOOL_IDS } from '@midnite/studio-shared';

import { registerStartupHost } from './host';

describe('registerStartupHost', () => {
  it('mounts Startup and Accountant: every declared channel is registered, each exactly once', async () => {
    const handlers = new Map<string, number>();
    const on = new Set<string>();
    const base = mkdtempSync(join(tmpdir(), 'startup-host-'));
    const host = registerStartupHost({
      ipcMain: {
        handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
        on: (c) => void on.add(c),
      },
      trashItem: async () => undefined,
      send: () => undefined,
      userData: join(base, 'userData'),
      appDataBase: join(base, 'appData'),
      pickCsv: async () => null,
      saveCsv: async () => null,
    });
    const all = new Set([...handlers.keys(), ...on]);
    for (const module of [startupModuleMain, accountantModuleMain]) {
      expect(module.channels.length).toBeGreaterThan(0);
      for (const channel of module.channels) expect(all, channel).toContain(channel);
    }
    expect(handlers.get(CHANNELS.startup)).toBe(1);
    expect(handlers.get(CHANNELS.ledger)).toBe(1);
    for (const count of handlers.values()) expect(count).toBe(1);
    await host.dispose();
  });

  it('serves Startup\'s MCP tools from the window\'s own store, gated by the Agents switches (Phase 153 Theme C)', async () => {
    const fns = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const base = mkdtempSync(join(tmpdir(), 'startup-host-'));
    const host = registerStartupHost({
      ipcMain: { handle: (c, fn) => void fns.set(c, fn as never), on: () => undefined },
      trashItem: async () => undefined,
      send: () => undefined,
      userData: join(base, 'userData'),
      appDataBase: join(base, 'appData'),
      pickCsv: async () => null,
      saveCsv: async () => null,
    });
    const ipc = async (request: unknown) => fns.get(CHANNELS.startup)?.({}, request);
    // Off by default: nothing listed, every call refused.
    expect(host.mcp.listTools()).toEqual([]);
    expect(await host.mcp.dispatch('startup_summary', {})).toEqual({ ok: false, kind: 'refused', message: STARTUP_AGENTS_OFF_MESSAGE });
    // The window's own switch, over the one startup channel, turns reads on...
    await ipc({ op: 'setAgentConsent', consent: { read: true, write: false } });
    expect(host.mcp.listTools()).toEqual(STARTUP_MCP_TOOL_IDS.slice(0, 5));
    expect((await host.mcp.dispatch('startup_milestones', {})).ok).toBe(true);
    expect(await host.mcp.dispatch('startup_upsert_milestone', {})).toMatchObject({ ok: false, kind: 'refused' });
    // ...and changes; an agent's write is then what the window reads back.
    await ipc({ op: 'setAgentConsent', consent: { read: true, write: true } });
    expect(host.mcp.listTools()).toEqual([...STARTUP_MCP_TOOL_IDS]);
    const milestone = { id: '00000000-0000-4000-8000-000000000001', title: 'Launch', description: '', status: 'planned', due: '2027-01-01', dependsOn: [], tags: [] };
    expect((await host.mcp.dispatch('startup_upsert_milestone', milestone)).ok).toBe(true);
    const snapshot = (await ipc({ op: 'get' })) as { value: { workspace: { milestones: { id: string }[] } } };
    expect(snapshot.value.workspace.milestones.map((m) => m.id)).toEqual([milestone.id]);
    await host.dispose();
  });
});
