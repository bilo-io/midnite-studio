import { describe, expect, it } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createUnavailableLedgerService, ledgerMain } from './index';

type Handler = (payload: unknown) => Promise<unknown>;

function register(appId: 'money' | 'studio' = 'money') {
  const handlers = new Map<string, { schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { message: string } } }; handler: Handler; onInvalid: (i: string) => unknown }>();
  const ipc = {
    handle: (channel: string, schema: never, handler: Handler, onInvalid: (i: string) => unknown) => void handlers.set(channel, { schema, handler, onInvalid }),
    handleBare: () => {},
    send: () => {},
  };
  ledgerMain.register({ ipc: ipc as never, emit: () => {}, trashItem: async () => {} }, { service: createUnavailableLedgerService(), appId, pickCsv: async () => null, saveCsv: async () => null });
  return handlers.get(CHANNELS.ledger)!;
}

describe('ledgerMain', () => {
  it('registers exactly the ledger channel', () => {
    expect(ledgerMain.channels).toEqual([CHANNELS.ledger]);
  });

  it('answers the envelope and never throws, even with no store behind it', async () => {
    const { handler } = register();
    expect(await handler({ op: 'listBooks' })).toMatchObject({ ok: false, kind: 'io' });
  });

  it('answers ops with no service method yet as invalid', async () => {
    const { handler } = register();
    expect(await handler({ op: 'importPick', bookId: '00000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('reports a bad payload through the envelope', () => {
    const { onInvalid } = register();
    expect(onInvalid('nope')).toEqual({ ok: false, kind: 'invalid', message: 'nope' });
  });
});
