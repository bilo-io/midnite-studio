import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useTerminalStore } from './terminal-store';

/**
 * The one always-mounted `pty:exit` subscription, mounted from `App` so it
 * lives as long as the window does.
 *
 * `use-terminal-ipc.ts` also listens, but per mounted `TerminalView` — and a
 * `TerminalView` unmounts whenever its host does. That was harmless while
 * every host was the terminal panel, whose sessions you are by definition
 * looking at; it stopped being harmless with Phase 35's FAB loops, which are
 * meant to run *unattended* with the panel closed. Main emits an exit once, so
 * an exit missed during a collapse was missed for the life of the app run: the
 * collapsed FAB kept glowing, its dot stayed lit, and the tab offered Stop for
 * a process that had been dead for an hour — while the run history, finalised
 * in main off the same pty exit, correctly said `exit 0`.
 *
 * The exact shape `use-agent-activity.ts` was extracted into, for the same
 * reason and after the same bug. Ordering with the per-view listener does not
 * matter: both write the same terminal state, and `setState`/`unbindPty` are
 * idempotent.
 */
export function useSessionExits(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return;

    return api.pty.onExit(({ ptyId, exitCode }) => {
      const store = useTerminalStore.getState();
      const sessionId = Object.keys(store.ptyIds).find((id) => store.ptyIds[id] === ptyId);
      if (!sessionId) return;
      store.setExitCode(sessionId, exitCode);
      store.unbindPty(sessionId);
      store.setState(sessionId, 'exited');
      // The dead shell's directory and whatever was running in it die with it —
      // see `use-terminal-ipc.ts` for why `undefined` rather than `null`.
      store.setLiveCwd(sessionId, undefined);
      store.setLiveAgentId(sessionId, undefined);
    });
  }, []);
}
