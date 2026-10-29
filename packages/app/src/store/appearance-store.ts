// Moved to the frame — `packages/frame/src/prefs` (Phase 123 Theme L.2). This re-export keeps the
// app's existing import paths working; new code imports from `@midnite/studio-frame`.
export {
  resolveSystemMotion,
  useAppearanceStore,
  useAppearanceSync,
  useResolvedMotion,
  type AccentId,
  type AppearanceState,
  type BgIntensity,
  type Density,
  type Motion,
  type ShimmerDirection,
  type UiFont,
  type VisualEffects,
} from '@midnite/studio-frame';
