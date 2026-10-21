/**
 * The finance feature's internals, for tests that exercise it *as a composing
 * app wires it* — Studio's `packages/app/src/compose/finance/` suite renders
 * these under its real providers and mock bridge (Phase 113 Theme P).
 *
 * Not for production code: an app composes the feature through
 * `@midnite/studio-feature-finance/renderer` and nothing else.
 */
export { DEFAULT_NEWS, useFinanceUiStore } from './dashboard/finance-ui-store';
