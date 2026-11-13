// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '@midnite/studio-shared';

import { createHealthBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc & { invoke: ReturnType<typeof vi.fn> } {
  return {
    invoke: vi.fn(async () => ({ ok: true })),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createHealthBridge', () => {
  it('exposes only health and report, with one method per op', () => {
    const bridge = createHealthBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['health', 'report']);
    expect(Object.keys(bridge.health).sort()).toEqual([
      'eraseAll',
      'exportAll',
      'getFoods',
      'getMonths',
      'getProfile',
      'listPlans',
      'putDay',
      'putProfile',
      'removeFood',
      'removePlan',
      'upsertFood',
      'writePlan',
    ]);
  });

  it('sends each call as { op, ...req } on the health channel', async () => {
    const ipc = fakeIpc();
    const { health } = createHealthBridge(ipc);
    await health.getProfile();
    await health.getMonths({ from: '2026-10', to: '2026-11' });
    expect(ipc.invoke.mock.calls).toEqual([
      [CHANNELS.health, { op: 'getProfile' }],
      [CHANNELS.health, { op: 'getMonths', from: '2026-10', to: '2026-11' }],
    ]);
  });
});
