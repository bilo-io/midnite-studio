// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, LedgerRequestSchema } from '@midnite/studio-shared';

import { createAccountantBridge, type RendererIpc } from './bridge';

const id = '00000000-0000-4000-8000-000000000001';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => ({ ok: true })), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

describe('createAccountantBridge', () => {
  it('exposes only ledger, one method per op of the request union', () => {
    const bridge = createAccountantBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['ledger']);
    expect(Object.keys(bridge.ledger).sort()).toEqual(
      [...LedgerRequestSchema.options.map((o) => o.shape.op.value)].sort(),
    );
  });

  it('invokes CHANNELS.ledger with the op and its payload', async () => {
    const ipc = fakeIpc();
    const { ledger } = createAccountantBridge(ipc);
    await ledger.listBooks();
    await ledger.balances({ bookId: id, asOf: '2026-11-12' });
    expect(vi.mocked(ipc.invoke).mock.calls).toEqual([
      [CHANNELS.ledger, { op: 'listBooks' }],
      [CHANNELS.ledger, { op: 'balances', bookId: id, asOf: '2026-11-12' }],
    ]);
  });
});
