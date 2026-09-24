import { LuBot, LuOctagonX } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';

/**
 * The board header's Auto-mate toggle and its neighbouring kill switch
 * button (Phase 95 Theme H) — the toggle wears `.activity-glow` while on,
 * `data-activity-status="running"`, the same ring family every other live
 * indicator in the app already uses (`terminal-session-list.tsx`'s own
 * session-row glow is the closest sibling); `idle` renders no ring at all,
 * matching that file's own "idle draws nothing" rule.
 */
export function AutomateToggle({ projectId }: { projectId: string }) {
  const enabled = useUiStore((s) => s.automateEnabledByProject[projectId] ?? false);

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => useUiStore.getState().setAutomateEnabled(projectId, !enabled)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        <span
          data-activity-status={enabled ? 'running' : 'idle'}
          className="activity-glow flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        >
          <LuBot aria-hidden className="h-3.5 w-3.5" />
        </span>
        Auto-mate
      </button>
      <button
        type="button"
        aria-label="Kill switch"
        title="Kill switch"
        onClick={() => useUiStore.getState().openKillSwitch()}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
      >
        <LuOctagonX aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
