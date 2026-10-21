import { startDemoApi, stopDemoApi } from './server';

/**
 * **Test-only.** The demo API, started on an ephemeral port for the duration of
 * one suite.
 *
 * Two suites want a real HTTP server to talk to: the demo API's own tests, and
 * the `http` executor's (Theme C), which must never reach the public internet —
 * its acceptance criterion is that the whole executor suite passes with the
 * machine's network cable out. Rather than each starting the server its own
 * way, the coupling between them is this one named seam: if the demo API's
 * lifecycle ever changes, exactly one place learns about it.
 *
 * Not in a `__tests__` folder: `vitest.config.ts` includes only
 * `src/**` test files, so a helper has to live beside the thing it wraps.
 */
export type FixtureServer = {
  /** Origin with no trailing slash, e.g. `http://127.0.0.1:51234`. */
  baseUrl: string;
  port: number;
  stop: () => Promise<void>;
};

export async function startFixtureServer(): Promise<FixtureServer> {
  const status = await startDemoApi();
  if (!status.running) throw new Error('Fixture server failed to start.');
  return {
    baseUrl: `http://127.0.0.1:${status.port}`,
    port: status.port,
    stop: stopDemoApi,
  };
}
