import { DEFAULT_KEYMAP } from '@midnite/git-shared';

import { useStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';

/**
 * The status footer: branch, sync counts, change count, and the terminal toggle.
 *
 * The shortcut is rendered from the keymap rather than typed as a literal, so
 * the hint can never disagree with the binding that actually fires.
 */
const toggleChord = DEFAULT_KEYMAP.find((b) => b.command === 'terminal.toggle')?.chord ?? 'Ctrl+`';

export function FooterBar() {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);
  const worktreePath = useUiStore((s) => s.selectedWorktreePath);
  const { data: status } = useStatus();

  const branch = status?.branch;
  const changes = status?.entries.length ?? 0;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-card/50 px-3 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={toggleTerminal}
        title={`Toggle terminal (${toggleChord})`}
        aria-pressed={terminalOpen}
        className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
          terminalOpen ? 'bg-accent text-foreground' : ''
        }`}
      >
        {'>_'} Terminal
        <span className="ml-1.5 opacity-60">{toggleChord}</span>
      </button>

      {branch ? (
        <>
          <span className="truncate" title={worktreePath ?? undefined}>
            {branch.detached ? 'detached' : (branch.head ?? '—')}
          </span>
          {branch.upstream ? (
            <span className="tabular-nums">
              ↑{branch.ahead} ↓{branch.behind}
            </span>
          ) : null}
          {changes > 0 ? <span>{changes} changed</span> : null}
          {status?.inProgress ? (
            <span className="text-destructive">{status.inProgress} in progress</span>
          ) : null}
        </>
      ) : null}
    </footer>
  );
}
