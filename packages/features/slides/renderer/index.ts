/**
 * Slides' renderer half (Phase 113 Theme Q) — what an app's entry chunk imports: the store every
 * markdown surface presents through, the shared Present button, the title typewriter, and the host
 * port. Deliberately NOT the deck or `SlidesModal`: those are `./modal` (a lazy entry), so importing
 * this file stays cheap.
 */
export { slidesManifest, type SlidesManifest } from '../manifest';
export { PresentButton } from './present-button';
export {
  SlidesHostProvider,
  useAutoFocus,
  useEscapeDismiss,
  useSlidesHost,
  type SlidesHost,
} from './host';
export { useSlidesStore, type MarkdownSource } from './slides-store';
export { useTitleTypewriter } from './use-title-typewriter';
export { parseDeck, type Deck, type DeckSlide, type DeckStep } from './deck-parser';
export { HelpOverlay } from './help-overlay';
