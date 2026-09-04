import { LuTerminal, LuX } from 'react-icons/lu';

import { revealSession } from '../terminal/reveal-session';
import { useTerminalStore } from '../terminal/terminal-store';

export function noteText(count: number): string | null {
  if (count <= 0) return null;
  return `Reattached ${count} session${count === 1 ? '' : 's'}`;
}

/**
 * Now actionable (Phase 51 Theme G) — clicking it used to do nothing, which
 * told you a reattach happened with nowhere to go look. Reveals the first
 * reattached session through `reveal-session.ts`'s existing panel-open path
 * rather than a second navigation mechanism; opening the panel's session
 * list from there surfaces every other reattached row too, not just the one
 * that got focus.
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
      className="animate-fade-in flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/40"
    >
      <button
        type="button"
        onClick={() => {
          const [firstId] = reattachedSessionIds;
          if (firstId) revealSession(firstId);
        }}
        aria-label={`${text} — reveal`}
        className="flex items-center gap-1.5"
      >
        <LuTerminal className="h-3 w-3 shrink-0 text-primary" />
        <span>{text}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismissReattachedNote();
        }}
        aria-label="Dismiss reattached note"
        className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
      >
        <LuX className="h-3 w-3" />
      </button>
    </div>
  );
}
