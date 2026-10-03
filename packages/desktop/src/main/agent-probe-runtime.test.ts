import { beforeEach, describe, expect, it, vi } from 'vitest';

const start = vi.fn(async () => ({ status: [], probe: 'ready' as const }));
vi.mock('./agent-probe-service', () => ({
  createAgentProbeService: () => ({ start, snapshot: vi.fn(), started: vi.fn() }),
}));
vi.mock('./terminal-service', () => ({ listAgents: vi.fn() }));
vi.mock('./window-manager', () => ({ broadcastToAllWindows: vi.fn() }));
vi.mock('./log', () => ({ defaultLogger: vi.fn() }));

import { bindAgentProbeToWindow, startAgentProbeAtBoot } from './agent-probe-runtime';

describe('agent probe wiring', () => {
  beforeEach(() => start.mockClear());

  it('startAgentProbeAtBoot kicks one non-forced probe without awaiting it', () => {
    startAgentProbeAtBoot();
    expect(start).toHaveBeenCalledWith();
  });

  it('every did-finish-load forces a TTL-bypassing probe', () => {
    let onLoad: () => void = () => undefined;
    const win = {
      webContents: { on: (event: string, cb: () => void) => event === 'did-finish-load' && (onLoad = cb) },
    };
    bindAgentProbeToWindow(win as never);
    expect(start).not.toHaveBeenCalled();
    onLoad();
    onLoad();
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith({ force: true });
  });
});
