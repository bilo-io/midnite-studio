/**
 * The Files-view editor's own preferences (Phase 64 Theme C) — mirroring
 * `features/terminal/terminal-font.ts`'s pattern: defaults live outside the
 * store, `ui-store.ts` only holds the persisted values and setters.
 */
export const DEFAULT_EDITOR_FONT_SIZE = 13;
export const DEFAULT_EDITOR_TAB_SIZE = 2;

/** The app's own `font-mono` stack — `editorFontFamily: ''` means "unset, use this". */
export const DEFAULT_EDITOR_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
