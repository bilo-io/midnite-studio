// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createMindBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({ notes: [] })),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createMindBridge', () => {
  it('exposes only notes, and only its four calls', () => {
    const bridge = createMindBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['notes']);
    expect(Object.keys(bridge.notes).sort()).toEqual(['delete', 'list', 'reorder', 'save']);
  });

  it('lists over invoke and writes one-way', async () => {
    const ipc = fakeIpc();
    const { notes } = createMindBridge(ipc);
    await notes.list();
    notes.delete({ id: 'n', repoId: 'mind' });
    notes.reorder({ repoId: 'mind', noteIds: ['n'] });
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([CHANNELS.notesList]);
    expect(vi.mocked(ipc.send).mock.calls.map((c) => c[0])).toEqual([CHANNELS.notesDelete, CHANNELS.notesReorder]);
  });
});
