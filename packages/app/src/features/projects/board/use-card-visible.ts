import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether a card is currently scrolled into view within its column (Phase 41
 * Theme E) — there is no viewport-driven mount precedent anywhere else in
 * this app; both existing multi-xterm hosts (the main panel, the FAB) mount
 * everything they own and rely on the whole host unmounting to stop.
 *
 * Feature-detected: an environment with no `IntersectionObserver` — today
 * only the Vitest/jsdom unit suite, since every real target (Electron's own
 * Chromium included) has it — is treated as permanently off-screen rather
 * than permanently on, so a card never tries to mount xterm/WebGL somewhere
 * that cannot support either. The genuinely-visible path is covered by
 * `e2e/kanban.spec.ts`, which runs in a real browser.
 */
export function useCardVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return visible;
}
