/**
 * The loops panel's own box (`<FabPanel>`'s root, which is `relative`),
 * or `null` when no loops panel is mounted in this document.
 *
 * What a loops-originated dialog passes as `container` so its scrim and its
 * centring stop at the panel's edge instead of spanning the window. One panel
 * per document — the main window docks it, the detached window is just it — so
 * a query is unambiguous, and callers can target it directly. `null` falls back
 * to the window-level dialog when the panel is closed.
 */
export function loopsPanelElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-loops-panel]');
}
