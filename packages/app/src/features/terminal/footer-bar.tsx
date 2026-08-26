import { ArrowDown, ArrowUp, GitBranch, SquareTerminal } from 'lucide-react';
import { DEFAULT_KEYMAP } from '@midnite/git-shared';

import { DiagnosticsSegment } from '../diagnostics/diagnostics-segment';
import { FooterCluster, MonitorCluster } from '../monitor/monitor-cluster';
import { useStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';

/**
 * The status footer: branch, sync counts, change count, the terminal toggle —
 * and, since Phase 18, the machine's vitals in the right half.
 *
 * Everything on the left is unchanged. The cluster is an `ml-auto` sibling, so
 * filling the empty right half cost no repositioning of what was already here.
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
        <SquareTerminal aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Terminal
        <span className="ml-1.5 opacity-60">{toggleChord}</span>
      </button>

      {branch ? (
        <>
          <span className="flex min-w-0 items-center gap-1 truncate" title={worktreePath ?? undefined}>
            <GitBranch aria-hidden className="h-3 w-3 shrink-0" />
            {branch.detached ? 'detached' : (branch.head ?? '—')}
          </span>
          {branch.upstream ? (
            <span className="flex items-center gap-0.5 tabular-nums">
              <ArrowUp aria-hidden className="h-3 w-3" />
              {branch.ahead}
              <ArrowDown aria-hidden className="ml-1 h-3 w-3" />
              {branch.behind}
            </span>
          ) : null}
          {changes > 0 ? <span>{changes} changed</span> : null}
          {status?.inProgress ? (
            <span className="text-destructive">{status.inProgress} in progress</span>
          ) : null}
        </>
      ) : null}

      {/*
        Slots, not a fixed list. Theme D left this container taking children
        precisely so Theme F could arrive as an insertion — which it did, one
        line below, with nothing in the monitor changed.

        Diagnostics sits LEFT of the monitor: it is about this repository and
        belongs nearer the branch segment it agrees with, while the machine's
        vitals stay hard against the window edge where they do not move as
        things are added. Phase 17's checks-verdict indicator slots in here too.
      */}
      <FooterCluster>
        <DiagnosticsSegment />
        <MonitorCluster />
      </FooterCluster>
    </footer>
  );
}
