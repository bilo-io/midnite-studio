import { useEffect } from 'react';

import { useUiStore } from '../store/ui-store';

/**
 * Registers an active overlay as an occluder so that any live `WebContentsView`
 * (embedded browser pane) is hidden while the overlay is mounted/open.
 */
export function useOccluder(active = true): void {
  useEffect(() => {
    if (!active) return;
    const store = useUiStore.getState();
    store.incrementOccluders();
    return () => {
      store.decrementOccluders();
    };
  }, [active]);
}
