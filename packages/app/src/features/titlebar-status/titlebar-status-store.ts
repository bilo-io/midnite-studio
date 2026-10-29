// Moved to the frame — `packages/frame/src/prefs` (Phase 123 Theme L.2). This re-export keeps the
// app's existing import paths working; new code imports from `@midnite/studio-frame`.
export {
  DEFAULT_WORLD_CLOCK_ZONES,
  useTitlebarStatusStore,
  type StatusPillItem,
  type TitlebarStatusState,
} from '@midnite/studio-frame';
