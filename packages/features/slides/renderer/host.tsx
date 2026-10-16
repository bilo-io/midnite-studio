import { createContext, useContext, useEffect, useRef, type ComponentType, type ReactNode, type RefObject } from 'react';

/**
 * The Slides feature's host port (Phase 113 Theme Q) — what the deck presenter
 * needs from the app that composes it, beyond the frame.
 *
 * The deck is a fullscreen overlay, so it lives by its host's overlay rules:
 * Studio's dismiss stack (Escape closes help before the deck, and a browser
 * pane under an open deck hides), its focus trap, its guarded external-link
 * opener and its one shiki instance. None of that may be imported by a
 * feature, so each is a seam: Studio's adapter is
 * `packages/app/src/compose/slides-host.tsx`, installed by `StudioProviders`
 * because the modal is mounted at the app's root, not under a view. Every
 * member is optional — an app that leaves them out gets Escape-to-close, a
 * focused dialog, plain anchors and unhighlighted code.
 */
export type SlidesHost = {
  /**
   * Closes the overlay on the host's dismissal key while `active`. Called twice by the deck (the help
   * overlay and the deck itself); the host decides the order — Studio's stack closes the most recent first.
   * A hook.
   */
  useDismiss?: (active: boolean, onClose: () => void) => void;
  /** Keeps keyboard focus inside `ref` while `active`. A hook. */
  useFocusTrap?: (ref: RefObject<HTMLElement | null>, active: boolean) => void;
  /** Tells the host an overlay is covering native views (Studio hides its browser pane under it). A hook. */
  useOccluder?: (active: boolean) => void;
  /** A markdown link inside a slide. Absent → an anchor that opens in a new window. */
  ExternalLink?: ComponentType<{ href?: string; children?: ReactNode }>;
  /** Highlighted HTML for a fenced block, or a rejection (the block then shows as plain text). */
  highlight?: (code: string, language: string | null, dark: boolean) => Promise<string>;
  /** Whether the app is in its dark theme. A hook. Absent → read from the document's `dark` class. */
  useIsDark?: () => boolean;
};

const SlidesHostContext = createContext<SlidesHost | null>(null);

export function SlidesHostProvider({ host, children }: { host: SlidesHost; children: ReactNode }) {
  return <SlidesHostContext.Provider value={host}>{children}</SlidesHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the overlay could neither be closed nor kept in focus. */
export function useSlidesHost(): SlidesHost {
  const host = useContext(SlidesHostContext);
  if (!host) throw new Error('The deck must be rendered inside <SlidesHostProvider>');
  return host;
}

/** The overlays currently open, oldest first — so one Escape closes only the top one (help before the deck). */
const escapeStack: symbol[] = [];

/** Escape closes the topmost overlay — what the deck does with no dismiss stack of its own to join. */
export function useEscapeDismiss(active: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const entry = Symbol('deck-overlay');
    escapeStack.push(entry);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escapeStack[escapeStack.length - 1] === entry) latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      escapeStack.splice(escapeStack.indexOf(entry), 1);
    };
  }, [active]);
}

/**
 * Moves focus into the container when it opens, unless something inside already holds it (a control's
 * `autoFocus`) — the least an app without a trap owes a dialog.
 */
export function useAutoFocus(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const container = ref.current;
    if (active && container && !container.contains(document.activeElement)) container.focus();
  }, [ref, active]);
}

/** No overlay registration — an app with nothing native to hide has nothing to tell. */
export function useNoOccluder(): void {}
