import { useTerminalHost } from './host';
import { PanelNotice } from './panel-notice';
import { useTerminalStore } from './terminal-store';

export function noteText(count: number): string | null {
  if (count <= 0) return null;
  return `Reattached ${count} session${count === 1 ? '' : 's'}`;
}

/**
 * Notice shown when sessions survive and reattach across a relaunch. It docks
 * in the session list's notices stack under the legacy notice, or at the panel
 * bottom when the list isn't shown. Show reveals the first reattached session.
 */
export function ReattachedNote() {
  const reattachedCount = useTerminalStore((s) => s.reattachedCount);
  const reattachedSessionIds = useTerminalStore((s) => s.reattachedSessionIds);
  const reattachedDismissed = useTerminalStore((s) => s.reattachedDismissed);
  const dismissReattachedNote = useTerminalStore((s) => s.dismissReattachedNote);
  const host = useTerminalHost();
  const { listOpen } = host.usePanelPrefs();

  if (reattachedCount <= 0 || reattachedDismissed) {
    return null;
  }

  const text = noteText(reattachedCount);
  if (!text) return null;

  return (
    <PanelNotice tone="info" role="status" testId="reattached-note" className="animate-fade-in">
      <p className="font-medium">{text}</p>
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={dismissReattachedNote}
          aria-label="Dismiss reattached note"
          className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => {
            const [firstId] = reattachedSessionIds;
            if (!firstId) return;
            if (host.actions.revealSession) {
              host.actions.revealSession(firstId);
              return;
            }
            // Revealing = make the session active and make sure the list naming it is showing.
            useTerminalStore.getState().setActive(firstId);
            if (!listOpen) host.actions.toggleList();
          }}
          aria-label={`${text} — reveal`}
          className="rounded px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground"
        >
          Show
        </button>
      </div>
    </PanelNotice>
  );
}
