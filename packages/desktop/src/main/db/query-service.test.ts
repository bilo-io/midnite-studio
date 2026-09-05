import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { countOf } from '../stream-registry';
import { cancelQuery, MAX_QUERY_ROWS, startQuery } from './query-service';

/** Minimal mock of `BrowserWindow`, matching `stream-registry.test.ts`'s own. */
function fakeWindow() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    once: (event: string, fn: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event]?.push(fn);
    },
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  } as unknown as import('electron').BrowserWindow;
}

/** Let every currently-queued microtask settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('startQuery', () => {
  it('forwards every batch and sends a done event with the final row count', async () => {
    const win = fakeWindow();
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(async (_sql: string, onBatch: (b: { columns: string[]; rows: unknown[][] }) => void) => {
        onBatch({ columns: ['id'], rows: [[1], [2]] });
        return { rowCount: 2 };
      }),
    };

    startQuery(win, driver, { requestId: 'c1#1', sql: 'SELECT 1' });
    await flush();

    expect(win.webContents.send).toHaveBeenCalledWith(
      EVENT_CHANNELS.dbQueryBatch,
      { requestId: 'c1#1', columns: ['id'], rows: [[1], [2]] },
    );
    expect(win.webContents.send).toHaveBeenCalledWith(
      EVENT_CHANNELS.dbQueryDone,
      expect.objectContaining({ requestId: 'c1#1', rowCount: 2, truncated: false }),
    );
    expect(countOf(win, 'query')).toBe(0);
  });

  it('caps the stream at MAX_QUERY_ROWS and marks the done event truncated', async () => {
    const win = fakeWindow();
    const oneRowOver = MAX_QUERY_ROWS + 1;
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(async (_sql: string, onBatch: (b: { columns: string[]; rows: unknown[][] }) => void, opts: { signal: AbortSignal }) => {
        let sent = 0;
        // Feed batches of 1000 until the cap trips the abort signal — mirrors
        // how a real driver's loop notices cancellation between batches.
        while (sent < oneRowOver && !opts.signal.aborted) {
          const rows = [[sent]];
          onBatch({ columns: ['n'], rows });
          sent += 1;
        }
        return { rowCount: sent };
      }),
    };

    startQuery(win, driver, { requestId: 'c1#1', sql: 'SELECT * FROM huge' });
    await flush();

    const doneCall = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([channel]) => channel === EVENT_CHANNELS.dbQueryDone,
    );
    expect(doneCall?.[1]).toMatchObject({ truncated: true, rowCount: MAX_QUERY_ROWS });
  });

  it('sends no batch after cancellation, and releases the stream registry entry', async () => {
    const win = fakeWindow();
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn((_sql: string, onBatch: (b: { columns: string[]; rows: unknown[][] }) => void, opts: { signal: AbortSignal }) => {
        onBatch({ columns: ['n'], rows: [[1]] });
        return new Promise<{ rowCount: number }>((resolve) => {
          opts.signal.addEventListener('abort', () => {
            // A real driver stops issuing batches the instant it sees abort.
            resolve({ rowCount: 1 });
          });
        });
      }),
    };

    startQuery(win, driver, { requestId: 'c1#1', sql: 'SELECT * FROM huge' });
    await flush();
    expect(countOf(win, 'query')).toBe(1);

    cancelQuery(win, 'c1#1');
    await flush();

    expect(countOf(win, 'query')).toBe(0);
    // No `dbQueryDone` — cancellation is a clean stop, not a reported result.
    const doneCall = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([channel]) => channel === EVENT_CHANNELS.dbQueryDone,
    );
    expect(doneCall).toBeUndefined();
  });

  it('reports a driver rejection as a dbQueryDone error rather than an unhandled rejection', async () => {
    const win = fakeWindow();
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(async () => {
        throw new Error('connection reset');
      }),
    };

    startQuery(win, driver, { requestId: 'c1#1', sql: 'SELECT 1' });
    await flush();

    expect(win.webContents.send).toHaveBeenCalledWith(
      EVENT_CHANNELS.dbQueryDone,
      expect.objectContaining({ requestId: 'c1#1', error: 'connection reset' }),
    );
    expect(countOf(win, 'query')).toBe(0);
  });
});
