import { useEffect } from 'react';

import { useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { AllChangesView } from '../changes/all-changes-view';
import { ReviewView, RunView } from '../forge/forge-detail';
import { StatusPanel } from '../status/status-panel';
import { TabStrip } from './tab-strip';

/**
 * The Changes view, as a tabbed workbench.
 *
 * The sidebar stays the app's global object list and the content area becomes
 * the place things open INTO — the split `app.tsx` already draws between the
 * nav rail and the repositories panel, extended one level down. Without it,
 * every new surface this phase adds (a whole-checkout diff, a workflow run, a
 * pull request) would have to fight the working-tree panel for the same pane.
 *
 * The working-tree tab is not in the store and cannot be closed: it follows
 * whatever the sidebar has selected, it is where the commit box lives, and a
 * strip that can be emptied to nothing is a view with no content.
 */
export function Workbench() {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTabId = useWorkbenchStore((s) => s.activeTabId);
  const focusTab = useWorkbenchStore((s) => s.focusTab);
  const closeTab = useWorkbenchStore((s) => s.closeTab);
  const closeRepoTabs = useWorkbenchStore((s) => s.closeRepoTabs);

  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const { data: repos } = useRepos();

  /**
   * A closed repository takes its tabs with it.
   *
   * Driven off the repo list rather than the close mutation, because a repo can
   * also leave the list without anyone clicking Close — a failed restore, a
   * registry rewrite. Reconciling against the truth covers both; hooking the
   * mutation would cover one and look like it covered both.
   */
  useEffect(() => {
    if (!repos) return;
    const open = new Set(repos.map((repo) => repo.id));
    for (const tab of useWorkbenchStore.getState().tabs) {
      if (!open.has(tab.repoId)) closeRepoTabs(tab.repoId);
    }
  }, [repos, closeRepoTabs]);

  const active = tabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip
        tabs={tabs}
        activeTabId={active ? active.id : null}
        workingTreeLabel={workingTreeLabel(selectedWorktreePath)}
        onFocus={focusTab}
        onClose={closeTab}
      />

      <div className="min-h-0 flex-1">
        {/*
          Keyed on the tab so switching cross-fades and each body mounts fresh
          — the same entrance treatment the view switcher uses, for the same
          reason: without the key React reuses the element and the animation,
          having already run, never replays.
        */}
        <div key={active?.id ?? 'working-tree'} className="h-full min-h-0 animate-fade-in">
          {active === null ? (
            <StatusPanel />
          ) : active.kind === 'all-changes' ? (
            <AllChangesView
              repoId={active.repoId}
              worktreePath={active.worktreePath}
              label={active.label}
            />
          ) : active.kind === 'run' ? (
            <RunView repoId={active.repoId} runId={active.runId} />
          ) : (
            <ReviewView repoId={active.repoId} number={active.number} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The last path segment — a full absolute path would fill the whole strip. */
function workingTreeLabel(worktreePath: string | null): string {
  if (!worktreePath) return 'Working tree';
  const name = worktreePath.slice(worktreePath.lastIndexOf('/') + 1);
  return name.length > 0 ? name : 'Working tree';
}
