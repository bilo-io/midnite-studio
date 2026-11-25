// vitest/jsdom: the device-flow state machine with injected fetch, sleep and clock (Phase 146 E3). No real timers.
import { describe, expect, it } from 'vitest';
import { runDeviceFlow, type DeviceFlowState } from './device-flow';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function harness(replies: unknown[], opts: { expiresIn?: number; step?: number } = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const states: DeviceFlowState[] = [];
  const queue = [...replies];
  const requests: { url: string; body: Record<string, string> }[] = [];
  const run = runDeviceFlow({
    clientId: 'client-1',
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      if (url.endsWith('/device/code')) {
        return json({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: opts.expiresIn ?? 900 });
      }
      return json(queue.shift());
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms + (opts.step ?? 0);
    },
    now: () => clock,
    onState: (s) => states.push(s),
  });
  return { run, sleeps, states, requests };
}

describe('runDeviceFlow', () => {
  it('requests the code with the scopes, then polls to done', async () => {
    const h = harness([{ error: 'authorization_pending' }, { access_token: 'tok' }]);
    expect(await h.run).toEqual({ phase: 'done', token: 'tok' });
    expect(h.requests[0]!.body).toEqual({ client_id: 'client-1', scope: 'repo read:org read:project project' });
    expect(h.requests[1]!.body.device_code).toBe('dc');
    expect(h.states.map((s) => s.phase)).toEqual(['awaiting-user', 'polling', 'polling', 'done']);
    expect(h.sleeps).toEqual([5000, 5000]);
  });

  it('slow_down adds five seconds to the interval', async () => {
    const h = harness([{ error: 'slow_down' }, { error: 'slow_down' }, { access_token: 't' }]);
    await h.run;
    expect(h.sleeps).toEqual([5000, 10000, 15000]);
  });

  it('expired_token ends in expired', async () => {
    expect(await harness([{ error: 'expired_token' }]).run).toEqual({ phase: 'expired' });
  });

  it('the local clock passing expires_in also ends in expired, without polling', async () => {
    const h = harness([], { expiresIn: 4 });
    expect(await h.run).toEqual({ phase: 'expired' });
    expect(h.requests).toHaveLength(1);
  });

  it('access_denied ends in denied', async () => {
    expect(await harness([{ error: 'access_denied' }]).run).toEqual({ phase: 'denied' });
  });

  it('an unknown error ends in error with GitHub\'s description', async () => {
    expect(await harness([{ error: 'incorrect_client_credentials', error_description: 'bad client' }]).run).toEqual({ phase: 'error', message: 'bad client' });
  });

  it('a network failure ends in error', async () => {
    const result = await runDeviceFlow({
      clientId: 'c',
      fetch: async () => {
        throw new TypeError('offline');
      },
      sleep: async () => {},
      now: () => 0,
    });
    expect(result).toEqual({ phase: 'error', message: 'Network request failed' });
  });
});
