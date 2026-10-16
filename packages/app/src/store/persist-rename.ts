// Moved to the frame — `packages/frame/src/lib/persist-rename.ts` (Phase 113 Theme P), so a
// feature package can adopt a renamed persist key. This re-export keeps the app's existing
// import paths working; new code imports from `@midnite/studio-frame`.
export { adoptRenamedPersistKey } from '@midnite/studio-frame';
