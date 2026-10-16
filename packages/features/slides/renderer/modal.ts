/**
 * The fullscreen deck host, as its own entry (Phase 113 Theme Q) — so an app can load it lazily.
 * `SlidesModal` pulls the deck, react-markdown and the syntax highlighter's glue; the barrel
 * (`index.ts`) is what an app's entry chunk imports for the store, the Present button and the
 * title typewriter, and it must not reach these. A dynamic `import()` of the barrel would not split
 * (the same module is statically imported), a dynamic `import()` of this file does.
 */
export { SlidesModal } from './slides-modal';
