// @vitest-environment node
// vitest: registration and subscription logic over injected electron shapes.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createBridgeSlice, type RendererIpc } from './bridge-slice';
import { createIpcContext } from './ipc-context';

function ctx() {
  const handlers = new Map<string, (e: unknown, raw: unknown) => unknown>();
  const send = vi.fn();
  const trashItem = vi.fn(async () => undefined);
  const context = createIpcContext({
    ipcMain: { handle: (c, l) => void handlers.set(c, l) },
    send,
    trashItem,
  });
  return { context, handlers, send, trashItem };
}

describe('createIpcContext', () => {
  it('answers an invalid payload with onInvalid, naming the channel', async () => {
    const { context, handlers } = ctx();
    const handler = vi.fn();
    context.ipc.handle('a:b', z.object({ n: z.number() }), handler, (issue) => ({ bad: issue }));
    const out = (await handlers.get('a:b')?.({}, { n: 'x' })) as { bad: string };
    expect(out.bad.startsWith('a:b: ')).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes parsed data to the handler, and bare handlers take none', async () => {
    const { context, handlers } = ctx();
    context.ipc.handle(
      'a:ok',
      z.object({ n: z.coerce.number() }),
      ({ n }) => n + 1,
      () => -1,
    );
    context.ipc.handleBare('a:bare', () => 'hi');
    expect(await handlers.get('a:ok')?.({}, { n: '2' })).toBe(3);
    expect(await handlers.get('a:bare')?.({}, undefined)).toBe('hi');
  });

  it('forwards emit and trashItem', async () => {
    const { context, send, trashItem } = ctx();
    context.emit('evt', 1);
    await context.trashItem('/x');
    expect(send).toHaveBeenCalledWith('evt', 1);
    expect(trashItem).toHaveBeenCalledWith('/x');
  });
});

describe('createBridgeSlice', () => {
  function fakeIpc() {
    const listeners = new Set<(e: unknown, p: unknown) => void>();
    const ipc: RendererIpc = {
      invoke: vi.fn(async (_c, r) => ({ echoed: r })),
      send: vi.fn(),
      on: (_c, l) => void listeners.add(l),
      removeListener: (_c, l) => void listeners.delete(l),
    };
    return { ipc, listeners };
  }

  it('subscribe delivers payloads and its teardown removes the listener', () => {
    const { ipc, listeners } = fakeIpc();
    const slice = createBridgeSlice(ipc);
    const seen: unknown[] = [];
    const off = slice.subscribe('evt', (p) => seen.push(p));
    for (const l of listeners) l({}, 'one');
    off();
    expect(listeners.size).toBe(0);
    expect(seen).toEqual(['one']);
  });

  it('call invokes and send forwards', async () => {
    const { ipc } = fakeIpc();
    const slice = createBridgeSlice(ipc);
    expect(await slice.call('c', 5)).toEqual({ echoed: 5 });
    slice.send('s', 1);
    expect(ipc.send).toHaveBeenCalledWith('s', 1);
  });
});
