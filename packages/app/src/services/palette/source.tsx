// Moved to the frame — `packages/frame/src/commands` (Phase 123 Theme D). This re-export keeps the
// app's existing import paths working; new code imports from `@midnite/studio-frame`.
export {
  SOURCE_WEIGHTS,
  highlightMatches,
  scorePaletteItem,
  type PaletteItem,
  type PaletteSource,
  type PaletteSourceKey,
  type ScoredPaletteItem,
} from '@midnite/studio-frame';
