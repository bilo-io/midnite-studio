import { LuTerminal, LuX } from 'react-icons/lu';

import { useTerminalStore } from '../terminal/terminal-store';

export function noteText(count: number): string | null {
  if (count <= 0) return null;
  return `Reattached ${count} session${count === 1 ? '' : 's'}`;
}

export function ReattachedNote() {
  const reattachedCount = useTerminalStore((s) => s.reattachedCount);
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
      <LuTerminal className="h-3 w-3 shrink-0 text-primary" />
      <span>{text}</span>
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
