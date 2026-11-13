/**
 * The ledger feature's renderer half (Phase 129): the books workspace. Needs the frame (bridge, chrome port).
 * Theme D fills the Overview, Journal and Accounts tabs; Themes E, F and G the rest.
 */
export { ledgerManifest, type LedgerManifest } from '../manifest';
export { LEDGER_TABS, LedgerWorkspace, type LedgerTab } from './ledger-workspace';
export { createMemoryLedger, type MemoryLedgerOptions } from './memory-ledger';
export { useLedgerUiStore, resolveBookId } from './ledger-ui-store';
