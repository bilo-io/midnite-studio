import { LuBot } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';

/** Chips beyond this many collapse into one "+N more" — a status bar row has
 *  no business growing without bound as more boards turn Auto-mate on. */
const MAX_VISIBLE = 3;

/**
 * "A status-bar chip shows each running mate and its scope" (Phase 95 Theme
 * H) — one chip per project board with Auto-mate on, its own scope named
 * "Project" (the only scope Auto-mate runs at today; a workflow's own
 * Auto-mate, Theme I's, would add a second scope label here rather than a
 * second segment). Renders nothing when no board is running one, exactly
 * like `InProgressSegment`'s own "silent unless there's something to report"
 * rule.
 *
 * Named by project id, not title — the status bar has no project-title
 * lookup of its own, and fetching one just for this chip would be a new
 * query for a label the click-through (which opens Projects) makes
 * redundant anyway.
 */
export function AutomateChip() {
  const automateEnabledByProject = useUiStore((s) => s.automateEnabledByProject);
  const runningProjectIds = Object.entries(automateEnabledByProject)
    .filter(([, enabled]) => enabled)
    .map(([projectId]) => projectId);

  if (runningProjectIds.length === 0) return null;

  const visible = runningProjectIds.slice(0, MAX_VISIBLE);
  const overflow = runningProjectIds.length - visible.length;

  return (
    <button
      type="button"
      data-testid="status-segment-automate"
      onClick={() => useUiStore.getState().setActiveView('projects')}
      title={`Auto-mate running on: ${runningProjectIds.join(', ')}`}
      className="flex items-center gap-1 rounded px-1.5 font-medium text-foreground transition-colors hover:bg-accent"
    >
      <LuBot aria-hidden className="h-3 w-3 shrink-0" />
      {visible.map((projectId) => (
        <span key={projectId} className="rounded-full bg-accent px-1.5 py-0.5 text-[10px]">
          Project · {projectId.slice(-6)}
        </span>
      ))}
      {overflow > 0 ? <span className="text-[10px]">+{overflow} more</span> : null}
    </button>
  );
}
