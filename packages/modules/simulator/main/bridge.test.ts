import { describe, expect, it, vi } from 'vitest';

import { createSimulatorBridge } from './bridge';

describe('createSimulatorBridge', () => {
  it('contributes exactly the simulator namespace and never a report key', () => {
    const bridge = createSimulatorBridge({ invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() } as never);
    expect(Object.keys(bridge)).toEqual(['simulator']);
    expect(Object.keys(bridge.simulator).sort()).toEqual(['list', 'read', 'remove', 'rename', 'save']);
  });

  it('sends each op on the scenario channel', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const bridge = createSimulatorBridge({ invoke, on: vi.fn(), removeListener: vi.fn() } as never);
    await bridge.simulator.list({ kind: 'life' });
    expect(invoke).toHaveBeenCalledWith('mstudio:simulator:scenario', { op: 'list', kind: 'life' });
  });
});
