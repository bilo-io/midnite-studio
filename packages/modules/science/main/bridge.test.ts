// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createScienceBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({})),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createScienceBridge', () => {
  it('exposes only report', () => {
    const bridge = createScienceBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['report']);
  });
});
