// @vitest-environment node
import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { cancelQuery, createQueryStreams, MAX_QUERY_ROWS, startQuery } from './query-service';

/** What the composer's `emit` records: the events a window would have been sent. */
function harness() {
  const sent: { channel: string; payload: unknown }[] = [];
  const streams = createQueryStreams();
  return {
    sent,
    streams,
    ports: { emit: (channel: string, payload: unknown) => void sent.push({ channel, payload }), streams },
    ofChannel: (channel: string) => sent.filter((event) => event.channel === channel),
  };
}

/** Let every currently-queued microtask settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('startQuery', () => {
  it('forwards every batch and sends a done event with the final row count', async () => {
    const { ports, ofChannel, streams } = harness();
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(async (_sql: string, onBatch: (b: { columns: string[]; rows: unknown[][] }) => void) => {
        onBatch({ columns: ['id'], rows: [[1], [2]] });
        return { rowCount: 2 };
      }),
    };

    startQuery(ports, driver, { requestId: 'c1#1', sql: 'SELECT 1' });
    await flush();

    expect(ofChannel(EVENT_CHANNELS.dbQueryBatch)).toEqual([
      { channel: EVENT_CHANNELS.dbQueryBatch, payload: { requestId: 'c1#1', columns: ['id'], rows: [[1], [2]] } },
    ]);
    expect(ofChannel(EVENT_CHANNELS.dbQueryDone)[0]?.payload).toMatchObject({ requestId: 'c1#1', rowCount: 2, truncated: false });
    expect(streams.size()).toBe(0);
  });

  it('caps the stream at MAX_QUERY_ROWS and marks the done event truncated', async () => {
    const { ports, ofChannel } = harness();
    const oneRowOver = MAX_QUERY_ROWS + 1;
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(async (_sql: string, onBatch: (b: { columns: string[]; rows: unknown[][] }) => void, opts: { signal: AbortSignal }) => {
        let sent = 0;
        // Feed batches until the cap trips the abort signal — mirrors
        // how a real driver's loop notices cancellation between batches.
        while (sent < oneRowOver && !opts.signal.aborted) {
          onBatch({ columns: ['n'], rows: [[sent]] });
          sent += 1;
        }
        return { rowCount: sent };
      }),
    };

    startQuery(ports, driver, { requestId: 'c1#1', sql: 'SELECT * FROM huge' });
    await flush();

    expect(ofChannel(EVENT_CHANNELS.dbQueryDone)[0]?.payload).toMatchObject({ truncated: true, rowCount: MAX_QUERY_ROWS });
  });

  it('sends no batch after cancellation, and releases the stream registry entry', async () => {
    const { ports, ofChannel, streams } = harness();
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

    startQuery(ports, driver, { requestId: 'c1#1', sql: 'SELECT * FROM huge' });
    await flush();
    expect(streams.size()).toBe(1);

    cancelQuery(streams, 'c1#1');
    await flush();

    expect(streams.size()).toBe(0);
    // No `dbQueryDone` — cancellation is a clean stop, not a reported result.
    expect(ofChannel(EVENT_CHANNELS.dbQueryDone)).toEqual([]);
  });

  it('reports a driver rejection as a dbQueryDone error rather than an unhandled rejection', async () => {
    const { ports, ofChannel, streams } = harness();
    const driver = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(async () => {
        throw new Error('connection reset');
      }),
    };

    startQuery(ports, driver, { requestId: 'c1#1', sql: 'SELECT 1' });
    await flush();

    expect(ofChannel(EVENT_CHANNELS.dbQueryDone)[0]?.payload).toMatchObject({ requestId: 'c1#1', error: 'connection reset' });
    expect(streams.size()).toBe(0);
  });

  it('a new run supersedes the earlier one, which is cancelled without a result', async () => {
    const { ports, ofChannel } = harness();
    const aborted: string[] = [];
    const hanging = (id: string) => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(
        (_sql: string, _onBatch: unknown, opts: { signal: AbortSignal }) =>
          new Promise<{ rowCount: number }>((resolve) => {
            opts.signal.addEventListener('abort', () => {
              aborted.push(id);
              resolve({ rowCount: 0 });
            });
          }),
      ),
    });

    startQuery(ports, hanging('first'), { requestId: 'c1#1', sql: 'SELECT 1' });
    startQuery(ports, hanging('second'), { requestId: 'c1#2', sql: 'SELECT 2' });
    await flush();

    expect(aborted).toEqual(['first']);
    expect(ofChannel(EVENT_CHANNELS.dbQueryDone)).toEqual([]);
  });
});

describe('createQueryStreams', () => {
  it('cancels an unknown id as a no-op, and every run on cancelAll', () => {
    const streams = createQueryStreams();
    const cancelled: string[] = [];
    expect(() => streams.cancel('nope')).not.toThrow();
    streams.register({ requestId: 'a', cancel: () => void cancelled.push('a') });
    streams.cancelAll();
    expect(cancelled).toEqual(['a']);
    expect(streams.size()).toBe(0);
  });
});
