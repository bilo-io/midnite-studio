import { useRef } from 'react';

import { useFocusTrap } from '../../components/use-focus-trap';
import { Deck } from './deck';
import { parseDeck } from './deck-parser';
import { useSlidesStore } from './slides-store';

/**
 * The fullscreen host, mounted once from `app.tsx` beside `<DialogHost>` —
 * the `fixed inset-0 z-dialog` convention already shared by `confirm-dialog.tsx`
 * / `prompt-dialog.tsx` / `merge-dialog.tsx`. Deliberately not folded into
 * `DialogHost` itself: that host arbitrates "only one of confirm/prompt/menu
 * open at a time," and a fullscreen deck is a different shape than any of the
 * three it already juggles.
 *
 * Reparses the source on every open rather than caching a `Deck` in the store
 * — this is a viewer, not an editor, and a deck is cheap enough to build that
 * memoizing it would only be a cache to keep correct for no real cost saved.
 */
export function SlidesModal() {
  const source = useSlidesStore((state) => state.deck);
  const close = useSlidesStore((state) => state.close);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, source !== null);

  if (source === null) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={source.label ? `Presenting ${source.label}` : 'Presenting'}
      className="fixed inset-0 z-dialog bg-background"
    >
      <Deck deck={parseDeck(source.content)} onClose={close} />
    </div>
  );
}
