import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * When Notes is detached into its own window, the quick-access `N` row and
 * `notes.toggle` bring that window forward instead of opening the Notes modal
 * on top of a second, duplicate editing surface.
 *
 * Returns whether it handled the request, so a caller falls back to the modal
 * only when there is no detached window to focus. `detachedPages` is kept
 * current by `useWindowSync` from main's own window registry, so it is the
 * authority here rather than a flag the renderer set itself.
 */
export function focusDetachedNotes(): boolean {
  if (!useUiStore.getState().detachedPages.includes('notes')) return false;
  const api = bridge();
  if (!api) return false;
  void api.window.focusRole({ role: 'notes' });
  return true;
}

/** Open Notes: focus the detached window when there is one, else show the modal. */
export function openNotes(): void {
  if (!focusDetachedNotes()) useUiStore.getState().setNotesOpen(true);
}

/** `notes.toggle`: same as `openNotes`, except a docked modal toggles closed. */
export function toggleNotes(): void {
  if (!focusDetachedNotes()) useUiStore.getState().toggleNotes();
}
