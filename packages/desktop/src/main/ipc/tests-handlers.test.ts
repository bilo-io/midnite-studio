import { CHANNELS, type TestTrustStatus } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `tests-handlers.ts` registers straight through the real `electron.ipcMain`
 * (`handle.ts`'s own doc comment), so testing it means capturing what it
 * registers — the same `vi.mock('electron', ...)` shape `browser-service.test.ts`
 * uses for its own main-process surface.
 */
const { handlers, SUITE, runTestSuite } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
  SUITE: {
    id: 'root::test',
    package: '',
    packageName: 'root',
    name: 'test',
    kind: 'unit' as const,
    source: 'package.json' as const,
    sourceFile: 'package.json',
    displayCommand: 'pnpm test',
    run: { command: 'pnpm', args: ['test'], cwd: '/repo' },
  },
  runTestSuite: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, raw: unknown) => unknown) => {
      handlers.set(channel, fn);
    }),
    on: vi.fn(),
  },
}));

vi.mock('../repo-registry', () => ({
  resolveWorkdir: vi.fn(async () => '/repo'),
}));

vi.mock('@midnite/studio-git-engine', () => ({
  computeTestDiscovery: vi.fn(async () => [
    { path: '', packageName: 'root', suites: [SUITE] },
  ]),
}));

vi.mock('../testing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../testing')>();
  return { ...actual, runTestSuite };
});

import { configureTests, inFlightSizeForTests, registerTestsHandlers } from './tests-handlers';

const TRUSTED: TestTrustStatus = { state: 'trusted', trustedAt: Date.now() };

/** Let every currently-queued microtask settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  runTestSuite.mockReset();
  configureTests({
    status: async () => TRUSTED,
    trust: async () => TRUSTED,
    untrust: async () => TRUSTED,
  });
  registerTestsHandlers(() => null);
});

/**
 * Phase 45 Theme E: `inFlight` was deleted only inside the `.then` that also
 * sends the result — a rejected `runTestSuite` skipped both, leaking the
 * `{ kill }` handle forever. `.finally` is the fix; this proves it holds even
 * when the run rejects, not just when it resolves.
 */
describe('testsRun (Phase 45 Theme E — inFlight)', () => {
  it('drops the in-flight handle once the run resolves', async () => {
    let resolveRun: (value: unknown) => void = () => {};
    runTestSuite.mockImplementation(
      (_suite, deps: { onSpawned?: (h: { kill: () => void }) => void }) =>
        new Promise((resolve) => {
          deps.onSpawned?.({ kill: vi.fn() });
          resolveRun = resolve;
        }),
    );

    const handler = handlers.get(CHANNELS.testsRun)!;
    const result = (await handler({}, { repoId: 'r1', suiteId: SUITE.id })) as { ok: true; runId: string };
    expect(result.ok).toBe(true);
    await flush();
    expect(inFlightSizeForTests()).toBe(1);

    resolveRun({ ok: true, counts: {}, output: '' });
    await flush();

    expect(inFlightSizeForTests()).toBe(0);
  });

  it('drops the in-flight handle even when the run rejects', async () => {
    let rejectRun: (reason: unknown) => void = () => {};
    runTestSuite.mockImplementation(
      (_suite, deps: { onSpawned?: (h: { kill: () => void }) => void }) =>
        new Promise((_resolve, reject) => {
          deps.onSpawned?.({ kill: vi.fn() });
          rejectRun = reject;
        }),
    );

    const handler = handlers.get(CHANNELS.testsRun)!;
    const result = (await handler({}, { repoId: 'r1', suiteId: SUITE.id })) as { ok: true; runId: string };
    expect(result.ok).toBe(true);
    await flush();
    expect(inFlightSizeForTests()).toBe(1);

    /*
      This fix (`.finally`) does not — and per the doc's own scope, need not —
      also swallow the rejection: it still propagates past the un-awaited
      `void` chain. Suppressed here so the *unrelated* unhandled-rejection
      warning does not fail this assertion about `inFlight` alone.
    */
    const onUnhandled = () => {};
    process.on('unhandledRejection', onUnhandled);
    try {
      rejectRun(new Error('spawn crashed'));
      await flush();
      expect(inFlightSizeForTests()).toBe(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
