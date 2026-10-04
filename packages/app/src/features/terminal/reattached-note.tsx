import { LuTerminal, LuX } from 'react-icons/lu';

import { revealSession } from './reveal-session';
import { useTerminalStore } from './terminal-store';

export function noteText(count: number): string | null {
  if (count <= 0) return null;
  return `Reattached ${count} session${count === 1 ? '' : 's'}`;
}

/**
 * Notice displayed at the bottom of the terminal panel when sessions survive
 * and reattach across a relaunch.
 *
 * Clicking it reveals the first reattached session and opens the session list.
 */
export function ReattachedNote() {
  const reattachedCount = useTerminalStore((s) => s.reattachedCount);
  const reattachedSessionIds = useTerminalStore((s) => s.reattachedSessionIds);
  const reattachedDismissed = useTerminalStore((s) => s.reattachedDismissed);
  const dismissReattachedNote = useTerminalStore((s) => s.dismissReattachedNote);

  if (reattachedCount <= 0 || reattachedDismissed) {
    return null;
  }

  const text = noteText(reattachedCount);
  if (!text) return null;

  return (
    <div
      role="status"
      data-testid="reattached-note"
      className="animate-fade-in flex items-center justify-between border-t border-border/40 bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => {
          const [firstId] = reattachedSessionIds;
          if (firstId) revealSession(firstId);
        }}
        aria-label={`${text} — reveal`}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <LuTerminal className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{text}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismissReattachedNote();
        }}
        aria-label="Dismiss reattached note"
        className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
      >
        <LuX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
