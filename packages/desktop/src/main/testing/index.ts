/**
 * A repository's own test suites — trust, execution, reporter parsing.
 *
 * The Phase 18 diagnostics module's shape, widened for suites: `trust-store.ts`
 * grants per suite rather than per repo, `runner.ts` spawns through the shared
 * `../process-runner.ts` engine, and `reporters.ts` reads what vitest and
 * playwright's JSON reporters actually write — one blob at close, not a
 * stream. See `../../../../todo/phase-19-dashboard-actions-tests.md` Theme G.
 */

export { createTestTrustStore, nullTestTrustStore, parseTrustState, type TestTrustStore } from './trust-store';
export { parseStructuredResult, type ParsedCounts } from './reporters';
export { runTestSuite, TEST_RUN_TIMEOUT_MS, type RunSuiteDeps } from './runner';
