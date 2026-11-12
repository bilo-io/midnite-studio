// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createHealthBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({})),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createHealthBridge', () => {
  it('exposes only report', () => {
    const bridge = createHealthBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['report']);
  });
});
