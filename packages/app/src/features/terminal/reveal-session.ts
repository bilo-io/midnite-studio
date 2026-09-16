import { bridge } from '../../services/bridge';
import { useUiStore, type FabTab } from '../../store/ui-store';
import { inMainPanel, useTerminalStore } from './terminal-store';

/**
 * Open the terminal panel and put one session in front of you.
 *
 * The action behind a Kanban card's `>_` button. Before this, a card could
 * start an agent and then say nothing about where it went — the pty ran with
 * no xterm mounted anywhere, and the only route to it was `rehomeSession`,
 * which unbinds the card. `inMainPanel` is the other half of the fix (the
 * panel now renders `'kanban'` sessions); this is the navigation.
 *
 * Lifted from `LiveAgentCount`'s own click handler in `agent-count.tsx`,
 * which does exactly these three things inline — hoisted here rather than
 * copied a second time, and made a pure-ish function so a test can call it
 * against the two stores without mounting a board.
 *
 * The list is only *opened*, never closed: a user who shut it does not want
 * it back, and the panel's own `listable` rule already hides it below two
 * sessions regardless.
 *
 * Returns whether it found something to reveal, so a caller can stay silent
 * rather than opening an empty panel on a stale id.
 */
export function revealSession(sessionId: string): boolean {
  const terminal = useTerminalStore.getState();
  const session = terminal.sessions.find((s) => s.id === sessionId);
  // A session the panel cannot render is not somewhere to send anyone — a
  // FAB loop's row would leave the panel blank with nothing highlighted.
  if (!session || !inMainPanel(session)) return false;

  const ui = useUiStore.getState();
  ui.setTerminalOpen(true);
  terminal.setActive(sessionId);
  if (!ui.terminalListOpen) ui.toggleTerminalList();
  return true;
}

/**
 * `revealSession`'s sibling for the other surface (Phase 86 Theme E's
 * Sessions-page live pane): open the Loops panel and switch to the tab a
 * `'fab'`-surface session is bound to, instead of the terminal panel
 * `revealSession` targets.
 *
 * The reverse of `use-loop-session.ts`'s own write: a loop's `start()` records
 * `sessionId` under `fabSessions[loopId]`, so the only way back from a raw
 * session id to "which tab" is scanning that map — there is no reference
 * on `TerminalSession` itself pointing the other way.
 *
 * Detached (the panel popped into its own window, `fabDetached`): opening it
 * docked here would draw a second copy nobody asked for, so this focuses that
 * window instead, the same branch the FAB button's own click handler takes
 * (`app.tsx`). `setActiveFabTab` is still called — the detached window reads
 * the same persisted store, so the right tab comes to front there too, on
 * whatever cadence the store's own IPC sync runs; if it lands a beat later
 * the popout still opens once with the loop it's bound to on the next look.
 */
export function revealFabSession(sessionId: string): boolean {
  const ui = useUiStore.getState();
  const loopId = Object.entries(ui.fabSessions).find(([, id]) => id === sessionId)?.[0];
  if (!loopId) return false;

  if (ui.fabDetached) {
    ui.setActiveFabTab(loopId as FabTab);
    bridge()?.window.focusRole({ role: 'fab' });
  } else {
    ui.openFabTab(loopId as FabTab);
  }
  return true;
}
