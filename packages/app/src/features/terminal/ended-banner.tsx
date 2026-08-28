import { Terminal } from 'lucide-react';

/**
 * An overlay strip shown at the foot of an ended terminal pane.
 *
 * Replaces the old `[session ended] Press Enter to start a new shell here` hint
 * in the scrollback with a clear status strip that doesn't push the scrollback
 * or disappear off the top.
 */
export function EndedStrip({
  exitCode,
  resume,
  onStartShell,
  onResume,
}: {
  exitCode: number | undefined;
  resume: string[] | undefined;
  onStartShell(): void;
  onResume(): void;
}) {
  const text = exitCode !== undefined ? `Session ended · exit ${exitCode}` : 'Session ended';

  return (
    <div
      role="status"
      data-ended-strip
      className="absolute inset-x-0 bottom-0 h-8 flex items-center justify-between gap-2 px-3 bg-background/90 border-t border-border text-xs z-10"
    >
      <div className="flex items-center gap-2 text-muted-foreground min-w-0 truncate">
        <Terminal className="size-3.5 shrink-0" />
        <span className="truncate">{text}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {resume && resume.length > 0 ? (
          <button
            type="button"
            onClick={onResume}
            className="rounded px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Resume conversation
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStartShell}
          className="rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start new shell here
        </button>
      </div>
    </div>
  );
}
