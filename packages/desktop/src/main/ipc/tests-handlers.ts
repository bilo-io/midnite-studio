import { randomUUID } from 'node:crypto';

import { computeTestDiscovery } from '@midnite/git-engine';
import {
  CHANNELS,
  EVENT_CHANNELS,
  schemas,
  testSuiteFingerprint,
  type TestDiscovery,
  type TestSuite,
  type TestTrustStatus,
} from '@midnite/git-shared';
import { ipcMain, type BrowserWindow } from 'electron';

import { resolveWorkdir } from '../repo-registry';
import { nullTestTrustStore, runTestSuite, type TestTrustStore } from '../testing';
import { handle } from './handle';

/**
 * The tests channels — discovery, per-suite trust, and execution.
 *
 * The `diag-handlers.ts` shape throughout: `discover` runs nothing and is safe
 * unprompted; `run` refuses without a live grant, checked here rather than in
 * the mechanism; `trust` only records a suite this call itself just
 * re-discovered, so a compromised renderer cannot name an arbitrary command
 * and call it "trust". Every channel takes a `repoId` (and a `suiteId`), never
 * a path or a command — main resolves both from its own state.
 */

let store: TestTrustStore = nullTestTrustStore;

/** Injected at boot with a store rooted at `app.getPath('userData')`. */
export function configureTests(next: TestTrustStore): void {
  store = next;
}

const NO_TRUST: TestTrustStatus = { state: 'untrusted', trustedAt: null };

/** In-flight runs, for `cancel` — the process handle only, nothing else. */
const inFlight = new Map<string, { kill: () => void }>();

async function findSuite(repoId: string, suiteId: string): Promise<TestSuite | null> {
  const workdir = await resolveWorkdir(repoId);
  if (!workdir) return null;
  const packages = await computeTestDiscovery({ repoId, repoRoot: workdir });
  for (const pkg of packages) {
    const found = pkg.suites.find((s) => s.id === suiteId);
    if (found) return found;
  }
  return null;
}

export function registerTestsHandlers(getWindow: () => BrowserWindow | null): void {
  handle<typeof schemas.TestsDiscoverRequest, TestDiscovery>(
    CHANNELS.testsDiscover,
    schemas.TestsDiscoverRequest,
    async (req) => {
      const workdir = await resolveWorkdir(req.repoId);
      if (!workdir) return { repoId: req.repoId, packages: [], generatedAt: Date.now() };
      const packages = await computeTestDiscovery({ repoId: req.repoId, repoRoot: workdir });
      return { repoId: req.repoId, packages, generatedAt: Date.now() };
    },
    () => ({ repoId: '', packages: [], generatedAt: Date.now() }),
  );

  handle<typeof schemas.TestsTrustStatusRequest, TestTrustStatus>(
    CHANNELS.testsTrustStatus,
    schemas.TestsTrustStatusRequest,
    async (req) => {
      const suite = await findSuite(req.repoId, req.suiteId);
      if (!suite) return NO_TRUST;
      return store.status(req.repoId, req.suiteId, testSuiteFingerprint(suite));
    },
    () => NO_TRUST,
  );

  handle<typeof schemas.TestsTrustRequest, TestTrustStatus>(
    CHANNELS.testsTrust,
    schemas.TestsTrustRequest,
    async (req) => {
      const suite = await findSuite(req.repoId, req.suiteId);
      if (!suite) return NO_TRUST;
      const live = testSuiteFingerprint(suite);
      // Approve only the suite the trust prompt actually showed — the
      // `isProposedCommand` rule, for a suite instead of a proposed linter.
      if (live !== req.fingerprint) return store.status(req.repoId, req.suiteId, live);
      return store.trust(req.repoId, req.suiteId, live, Date.now());
    },
    () => NO_TRUST,
  );

  handle<typeof schemas.TestsUntrustRequest, TestTrustStatus>(
    CHANNELS.testsUntrust,
    schemas.TestsUntrustRequest,
    (req) => store.untrust(req.repoId, req.suiteId),
    () => NO_TRUST,
  );

  handle<typeof schemas.TestsRunRequest, { ok: true; runId: string } | { ok: false; reason: string }>(
    CHANNELS.testsRun,
    schemas.TestsRunRequest,
    async (req) => {
      const suite = await findSuite(req.repoId, req.suiteId);
      if (!suite) return { ok: false, reason: 'no-suite' };

      const status = await store.status(req.repoId, req.suiteId, testSuiteFingerprint(suite));
      if (status.state !== 'trusted') return { ok: false, reason: 'untrusted' };

      const runId = randomUUID();
      // Deliberately not awaited: the invoke resolves with the run id the
      // moment the suite is trusted, and output/completion arrive on their own
      // streams — a suite can run for minutes, and the Tests view has to show
      // it working rather than block on one invoke.
      void runTestSuite(suite, {
        onSpawned: (handle) => inFlight.set(runId, handle),
        onChunk: (chunk) => {
          if (!getWindow()?.isDestroyed()) {
            getWindow()?.webContents.send(EVENT_CHANNELS.testsOutput, { runId, chunk });
          }
        },
      }).then((result) => {
        inFlight.delete(runId);
        if (!getWindow()?.isDestroyed()) {
          getWindow()?.webContents.send(EVENT_CHANNELS.testsResult, {
            runId,
            suiteId: req.suiteId,
            result,
          });
        }
      });

      return { ok: true, runId };
    },
    (issue) => ({ ok: false, reason: issue }),
  );

  // One-way, like `pty:kill`: cancelling has nothing to report back, and the
  // run's own completion arrives on `testsResult` regardless of how it ended.
  ipcMain.on(CHANNELS.testsCancel, (_event, raw: unknown) => {
    const parsed = schemas.TestsCancelRequest.safeParse(raw);
    if (!parsed.success) return;
    inFlight.get(parsed.data.runId)?.kill();
  });
}
