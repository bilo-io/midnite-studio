import { defineFeatureMain } from '@midnite/studio-runtime';

import { testsManifest } from '../manifest';
import { registerTestsHandlers, type TestsPorts } from './tests-handlers';

export { testsManifest, type TestsManifest } from '../manifest';
export { configureTests, type TestsPorts } from './tests-handlers';
export { createTestTrustStore, nullTestTrustStore, type TestTrustStore } from './testing';

/**
 * The tests feature's main half (Phase 113 Theme O): discovery, per-suite
 * trust and the runner. The composer hands over where a repository's checkout
 * is (`workdir`) and a logger; the trust store is configured separately
 * ({@link configureTests}) at boot, over a directory the composer chose.
 * Output and results stream to the composer's window through `ctx.emit`.
 */
export type TestsMainServices = TestsPorts;

export const testsMain = defineFeatureMain<TestsMainServices>({
  feature: testsManifest.feature,
  channels: testsManifest.ipc,
  register(ctx, services) {
    registerTestsHandlers(ctx, services);
  },
});
