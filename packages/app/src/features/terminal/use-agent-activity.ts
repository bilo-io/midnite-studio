import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useTerminalStore } from './terminal-store';

/**
 * The ONE `pty:activity` subscription in the renderer, mounted from `App` so
 * it lives as long as the window does.
 *
 * It used to sit in `use-terminal-ipc.ts`, which meant one subscription per
 * mounted `TerminalView` — and every `TerminalView` unmounts when the terminal
 * panel collapses. Main emits `pty:activity` on a CHANGE only, so any rung
 * change during a collapse was silently lost: the session list came back
 * showing the stale glyph, and stayed wrong until the agent happened to change
 * rungs again. A busy session with no spinner in the list was exactly this.
 *
 * The event names a ptyId; the store keys activity by sessionId. `ptyIds` maps
 * session → pty, so the lookup is an invert over a list that is at most a
 * handful of entries long. An event for a pty no session is bound to yet is
 * dropped — `hydrate()`'s seeded snapshot covers the reload case, and the next
 * change re-announces itself.
 *
 * `activity: null` is the detector's explicit "nothing to say" (no marker set,
 * or one disabled after tripping its time budget); `setActivity`'s own
 * `undefined` clears it back to the "not spoken" state the row draws as the
 * unknown mark.
 */
export function useAgentActivity(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return;

    return api.pty.onActivity(({ ptyId, activity }) => {
      const store = useTerminalStore.getState();
      const sessionId = Object.keys(store.ptyIds).find((id) => store.ptyIds[id] === ptyId);
      if (!sessionId) return;
      store.setActivity(sessionId, activity ?? undefined);
    });
  }, []);
}
