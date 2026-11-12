import { describe, expect, it, vi } from 'vitest';

import { createSimulatorBridge } from './bridge';

describe('createSimulatorBridge', () => {
  it('contributes no namespace yet and never a report key', () => {
    const bridge = createSimulatorBridge({ invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() } as never);
    expect(Object.keys(bridge)).toEqual([]);
  });
});
