// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createStartupBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({})),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createStartupBridge', () => {
  it('exposes only Report an Issue so far, and only its calls', () => {
    const bridge = createStartupBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['report']);
    expect(Object.keys(bridge.report).sort()).toEqual(['bundle', 'copy', 'error', 'ghStatus', 'logPath', 'onOpen', 'openUrl', 'reveal', 'submitIssue']);
  });
});
