// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { browserManifest } from '@midnite/studio-feature-browser/main';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createBrowserBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => 'answer'), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

async function callEverything(bridge: Record<string, Record<string, unknown>>): Promise<void> {
  for (const group of Object.values(bridge)) {
    for (const member of Object.values(group)) if (typeof member === 'function') await (member as (req?: unknown) => unknown)({});
  }
}

describe('createBrowserBridge', () => {
  it('exposes exactly browser, webApps, clipboard and menu — no fs, secrets, window or ops namespace', () => {
    const bridge = createBrowserBridge(fakeIpc()) as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(bridge).sort()).toEqual(['browser', 'clipboard', 'menu', 'webApps']);
    for (const name of ['fs', 'fsWrite', 'secrets', 'window', 'ops', 'repos']) expect(name in bridge).toBe(false);
    // Write-only: nothing reads what the user last copied.
    expect(Object.keys(bridge['clipboard']!)).toEqual(['writeText']);
  });

  it('invokes, sends and subscribes only to the channels the feature declares, plus the clipboard', async () => {
    const ipc = fakeIpc();
    await callEverything(createBrowserBridge(ipc) as unknown as Record<string, Record<string, unknown>>);
    const invoked = vi.mocked(ipc.invoke).mock.calls.map((c) => c[0]).sort();
    // The web-app sign-in channels are the browser feature's to answer, but Vault's to call (Phase 113 Theme J
    // slice 3): Browser's renderer is never handed them, so it cannot list or clear a partition's sign-in.
    const vaultOnly = new Set<string>([CHANNELS.webAppsSignIns, CHANNELS.webAppsSignOut]);
    expect(invoked).toEqual([...browserManifest.ipc.filter((c) => !vaultOnly.has(c)), CHANNELS.clipboardWriteText].sort());
    expect(invoked.some((c) => vaultOnly.has(c))).toBe(false);
    const sent = vi.mocked(ipc.send).mock.calls.map((c) => c[0]).sort();
    expect(sent).toEqual([...browserManifest.sends].sort());
    const subscribed = vi.mocked(ipc.on).mock.calls.map((c) => c[0]).sort();
    expect(subscribed).toEqual([EVENT_CHANNELS.browserEvent, EVENT_CHANNELS.menuCommand].sort());
  });
});
