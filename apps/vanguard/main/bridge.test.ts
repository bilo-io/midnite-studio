// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createVanguardBridge, type RendererIpc } from './bridge';

function fakeIpc() {
  const listeners = new Map<string, Set<(e: unknown, p: unknown) => void>>();
  const ipc: RendererIpc = {
    invoke: vi.fn(async () => 'answer'),
    send: vi.fn(),
    on: (c, l) => void (listeners.get(c) ?? listeners.set(c, new Set()).get(c))!.add(l),
    removeListener: (c, l) => void listeners.get(c)?.delete(l),
  };
  return { ipc, listeners };
}

describe('createVanguardBridge', () => {
  it('exposes exactly vanguard, the report feature, the session list and a read-only pty', () => {
    const bridge = createVanguardBridge(fakeIpc().ipc);
    expect(Object.keys(bridge).sort()).toEqual(['pty', 'report', 'terminal', 'vanguard']);
    expect(Object.keys(bridge.terminal)).toEqual(['list']);
    // No create and no kill: Vanguard starts nothing, so it kills nothing.
    // The security app renders untrusted evidence: no keystrokes into a terminal.
    expect(bridge.pty).not.toHaveProperty('input');
    expect(Object.keys(bridge.pty).sort()).toEqual([
      'onData',
      'onExit',
      'snapshot',
      'subscribe',
      'unsubscribe',
    ]);
    expect(Object.keys(bridge.vanguard).sort()).toEqual([
      'findings',
      'onChanged',
      'openQuarantine',
      'runSensor',
      'sensors',
      'setSettings',
      'settings',
      'viewOpened',
    ]);
    expect(Object.keys(bridge.vanguard.findings).sort()).toEqual([
      'act',
      'list',
      'onChanged',
      'setStatus',
    ]);
  });

  it('invokes the findings, sensor and settings channels', async () => {
    const { ipc } = fakeIpc();
    const bridge = createVanguardBridge(ipc);
    await bridge.vanguard.findings.list({});
    await bridge.vanguard.sensors();
    await bridge.vanguard.setSettings({ cadenceSeconds: 60 });
    await bridge.vanguard.viewOpened();
    expect(vi.mocked(ipc.invoke).mock.calls.map((call) => call[0])).toEqual([
      CHANNELS.securityFindingsList,
      CHANNELS.vanguardSensors,
      CHANNELS.vanguardSettingsSet,
      CHANNELS.vanguardViewOpened,
    ]);
  });

  it('returns a teardown that removes the findings-changed listener', () => {
    const { ipc, listeners } = fakeIpc();
    const off = createVanguardBridge(ipc).vanguard.findings.onChanged(() => undefined);
    expect(listeners.get(EVENT_CHANNELS.securityFindingsChanged)?.size).toBe(1);
    off();
    expect(listeners.get(EVENT_CHANNELS.securityFindingsChanged)?.size).toBe(0);
  });
});
