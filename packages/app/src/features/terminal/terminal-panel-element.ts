/**
 * The terminal panel's own box (`<TerminalPanel>`'s root, which is `relative`),
 * or `null` when no panel is mounted in this document.
 *
 * What a terminal-originated dialog passes as `container` so its scrim and its
 * centring stop at the panel's edge instead of spanning the window. One panel
 * per document — the main window docks it, the detached window is just it — so
 * a query is unambiguous, and callers with no element in hand (the Mod+w close
 * confirm) can use it too. `null` falls back to the window-level dialog, which
 * is the right answer when the panel is closed or yielded to the Sessions page.
 */
export function terminalPanelElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-terminal-panel]');
}
