/**
 * `@midnite/studio-frame/diff` — the diff view and its hooks (Phase 113 Theme O).
 *
 * Its own entry so an app that never shows a diff carries none of it. Reached through the same
 * `GitHost` port as the graph (`@midnite/studio-frame`): the persisted layout and gutter toggles, the
 * composer's query keys and active checkout, and — optionally — its syntax highlighter.
 */
export { DiffView } from './diff-view';
export { DiffToolbar } from './diff-toolbar';
export { DiffCell } from './diff-cell';
export { ImageDiff, IMAGE_CHECKERBOARD } from './image-diff';
export * from './diff-rows';
export * from './describe-empty';
export * from './image-sources';
export * from './use-diff-split-width';
export * from './use-file-diff';
