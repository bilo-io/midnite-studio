import { describe, expect, it, vi } from 'vitest';

import {
  DEV_SERVER_PROBE_TIMEOUT_MS,
  probeLoopbackPort,
  type ProbeSocket,
} from './dev-server-probe';

/**
 * A stand-in for `net.connect` that never opens a socket — the seam exists so
 * this suite needs no listening port and no network.
 */
function fakeConnect(behaviour: 'connect' | 'error' | 'hang') {
  const destroy = vi.fn();
  const seen: string[] = [];
  const connect = vi.fn((_port: number, _host: string): ProbeSocket => {
    const listeners = new Map<string, () => void>();
    queueMicrotask(() => {
      if (behaviour === 'connect') listeners.get('connect')?.();
      if (behaviour === 'error') listeners.get('error')?.();
      // 'hang' does nothing at all — the deadline is the only way out.
    });
    return {
      once: (event: string, listener: () => void) => {
        seen.push(event);
        listeners.set(event, listener);
        return undefined;
      },
      destroy,
    };
  });
  return { connect, destroy, seen };
}

describe('probeLoopbackPort (Phase 71 Theme C)', () => {
  it('answers true when the connection is accepted', async () => {
    const { connect, destroy } = fakeConnect('connect');
    await expect(probeLoopbackPort(5173, { connect })).resolves.toBe(true);
    // Connect-and-drop: nothing is ever sent, and the socket does not linger.
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('answers false on a refused connection without throwing', async () => {
    const { connect, destroy } = fakeConnect('error');
    await expect(probeLoopbackPort(3000, { connect })).resolves.toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('answers within the deadline when the connection hangs', async () => {
    vi.useFakeTimers();
    try {
      const { connect, destroy } = fakeConnect('hang');
      const pending = probeLoopbackPort(8080, { connect, timeoutMs: 40 });

      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(39);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      await expect(pending).resolves.toBe(false);
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('always dials loopback, whatever the caller asked for', async () => {
    const { connect } = fakeConnect('error');
    await probeLoopbackPort(4200, { connect });
    expect(connect).toHaveBeenCalledWith(4200, '127.0.0.1');
  });

  it('resolves false rather than throwing when connect itself throws', async () => {
    const connect = vi.fn(() => {
      throw new Error('EMFILE');
    });
    await expect(probeLoopbackPort(3000, { connect })).resolves.toBe(false);
  });

  it('resolves exactly once even if both events fire', async () => {
    const destroy = vi.fn();
    const listeners = new Map<string, () => void>();
    const connect = vi.fn(
      (): ProbeSocket => ({
        once: (event: string, listener: () => void) => {
          listeners.set(event, listener);
          return undefined;
        },
        destroy,
      }),
    );

    const pending = probeLoopbackPort(3000, { connect });
    listeners.get('connect')?.();
    listeners.get('error')?.();

    await expect(pending).resolves.toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps a deadline short enough to probe five ports without a visible pause', () => {
    expect(DEV_SERVER_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(250);
  });
});
