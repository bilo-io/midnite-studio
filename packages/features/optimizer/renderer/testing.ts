/**
 * The optimizer's internals, for tests that exercise the feature *as a
 * composing app wires it* — Studio's `packages/app/src/compose/optimizer/`
 * suite renders these under its real `DialogHost`, `ui-store` adapter and
 * mock bridge (Phase 113 Theme C).
 *
 * Not for production code: an app composes the feature through
 * `@midnite/studio-feature-optimizer/renderer` and nothing else, and
 * `eslint.config.mjs` refuses this entry outside a test file.
 */
export { MemoryTab } from './memory-tab';
export { OptimizerPage } from './optimizer-page';
export { useOptimizerStore } from './optimizer-store';
export { OptimizerSettingsPage } from './settings/optimizer-settings-page';
export { TrashSafetyPage } from './settings/trash-safety-page';
export { SmartScanTab } from './smart-scan-tab';
export { StorageTab } from './storage-tab';
export { createTestOptimizerHost } from './test-host';
