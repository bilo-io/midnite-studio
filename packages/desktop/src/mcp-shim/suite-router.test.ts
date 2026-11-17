import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { callMcpTool, MCP_NOT_RUNNING_MESSAGE } from './client';
import { RELIST_MIN_MS, SuiteRouter } from './suite-router';
import { resolveSuiteSockets } from './suite-sockets';
import { makeAppDataBase, startFakeApp } from './suite-test-helpers';

let base = '';
const closers: Array<() => Promise<void>> = [];
const logs: string[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  if (base) rmSync(base, { recursive: true, force: true });
  base = '';
  logs.length = 0;
});

function router(known: readonly string[], ownerOf: (id: string) => string = () => 'frame'): SuiteRouter {
  return new SuiteRouter({
    resolve: () => resolveSuiteSockets({ appDataBase: base, probeTimeoutMs: 300 }),
    call: (socketPath, tool, input, timeoutMs) => callMcpTool(tool, input, { socketPath, ...(timeoutMs ? { timeoutMs } : {}) }),
    isKnown: (id) => known.includes(id),
    ownerOf,
    log: (line) => logs.push(line),
  });
}

describe('SuiteRouter', () => {
  it('with no suite app running adds nothing and routes everything to Studio', async () => {
    base = makeAppDataBase();
    const r = router(['x']);
    expect(await r.extraTools(new Set(['repo.list']))).toEqual([]);
    expect(await r.routeOf('repo.list')).toBeNull();
  });

  it('lists the union of two apps and routes each call to its owner', async () => {
    base = makeAppDataBase();
    closers.push((await startFakeApp(base, 'money', ['money_a'])).close, (await startFakeApp(base, 'startup', ['startup_a', 'startup_b'])).close);
    const r = router(['money_a', 'startup_a', 'startup_b']);
    expect(await r.extraTools(new Set(['repo.list', 'money_a']))).toEqual(['startup_a', 'startup_b']);
    const startup = await r.routeOf('startup_b');
    expect(startup?.app).toBe('startup');
    expect(await r.call(startup!, 'startup_b', {})).toMatchObject({ ok: true, value: { from: 'startup', tool: 'startup_b' } });
    const money = await r.routeOf('money_a');
    expect(await r.call(money!, 'money_a', {})).toMatchObject({ ok: true, value: { from: 'money' } });
  });

  it('skips an id the shim has no definition for', async () => {
    base = makeAppDataBase();
    closers.push((await startFakeApp(base, 'startup', ['startup_a', 'mystery'])).close);
    expect(await router(['startup_a']).extraTools(new Set())).toEqual(['startup_a']);
  });

  it('keeps the owner when two apps offer one id, and logs the clash', async () => {
    base = makeAppDataBase();
    closers.push((await startFakeApp(base, 'money', ['shared_t'])).close, (await startFakeApp(base, 'startup', ['shared_t'])).close);
    const r = router(['shared_t'], () => 'startup');
    await r.extraTools(new Set());
    expect((await r.routeOf('shared_t'))?.app).toBe('startup');
    expect(logs.join('\n')).toContain('shared_t');
  });

  it('answers "<App> is not running." for a socket that died after the list, and drops it', async () => {
    base = makeAppDataBase();
    const startup = await startFakeApp(base, 'startup', ['startup_a']);
    const r = router(['startup_a']);
    await r.extraTools(new Set());
    const owner = await r.routeOf('startup_a');
    await startup.close();
    const reply = await r.call(owner!, 'startup_a', {});
    expect(reply).toMatchObject({ ok: false, message: 'Midnite Startup is not running.' });
    expect(reply.ok === false && reply.message).not.toBe(MCP_NOT_RUNNING_MESSAGE);
    // Dropped: with the app gone and the re-list throttled, the next call falls back to Studio's path.
    expect(await r.routeOf('startup_a')).toBeNull();
  });

  it('re-lists once on a miss after the throttle window', async () => {
    base = makeAppDataBase();
    const r = router(['startup_a']);
    await r.extraTools(new Set());
    closers.push((await startFakeApp(base, 'startup', ['startup_a'])).close);
    expect(await r.routeOf('startup_a')).toBeNull(); // inside the window: no re-list
    const realNow = Date.now;
    Date.now = () => realNow() + RELIST_MIN_MS + 1;
    try {
      expect((await r.routeOf('startup_a'))?.app).toBe('startup');
    } finally {
      Date.now = realNow;
    }
  });
});
