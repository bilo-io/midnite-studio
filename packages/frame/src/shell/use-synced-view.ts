import { useEffect, useRef } from 'react';

/**
 * Keeps a module's own view state (a zustand tab, a media host's active tab) and the host rail's view in
 * step (Phase 124 Theme E.3). The rail wins on arrival — `view` is pushed into the module's state — and a
 * change the module makes itself (its own tab strip, an in-page link) is reported up through `onView`.
 * Only a change of `own` after mount reports, so a stale persisted value never overrides the rail.
 */
export function useSyncedView(view: string, onView: (view: string) => void, own: string, setOwn: (view: string) => void): void {
  const last = useRef(view);
  const prev = useRef(own);
  useEffect(() => {
    last.current = view;
    if (own !== view) setOwn(view);
    // `own` is read once per arrival of a new rail view; its own changes are the second effect's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  useEffect(() => {
    if (prev.current === own) return;
    prev.current = own;
    if (own === last.current) return;
    last.current = own;
    onView(own);
  }, [own, onView]);
}
