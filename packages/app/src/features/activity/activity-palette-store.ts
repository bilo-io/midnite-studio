// Moved to the frame — `packages/frame/src/prefs` (Phase 123 Theme L.2). This re-export keeps the
// app's existing import paths working; new code imports from `@midnite/studio-frame`.
export {
  useActivityPaletteStore,
  type ActivityPaletteState,
  type AgentStyleMode,
  type ShellStyleMode,
} from '@midnite/studio-frame';
