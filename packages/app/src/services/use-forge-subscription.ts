/**
 * Registers this window's interest in one `{repoId, kind}` forge listing
 * (Phase 84 Theme C.5) — mounted by the Actions (`runs`), Reviews (`pulls`),
 * Issues (`issues`) and Projects (`projects`) views and the status-bar forge
 * chip. Moved into the forge feature with the forge query hooks (Phase 113
 * Theme O); re-exported so the app's importers do not move.
 */
export { useForgeSubscription } from '@midnite/studio-feature-forge/renderer';
