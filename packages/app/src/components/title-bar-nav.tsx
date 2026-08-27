import type { MouseEvent as ReactMouseEvent } from 'react';

import { LuArrowLeft, LuArrowRight, LuChevronRight, LuRotateCw } from 'react-icons/lu';

import { bridge } from '../services/bridge';
import { useRepos } from '../services/queries';
import { useStatus } from '../services/use-status';
import { SETTINGS_PAGES, useUiStore, type ViewId } from '../store/ui-store';
import type { MenuItem } from './context-menu';
import { useDialogs } from './dialog-host';
import { IconButton } from './icon-button';

/**
 * Short labels for the rail's views, duplicated from `app.tsx`'s `NAV_ITEMS`
 * rather than imported: that module also carries the rail's icons and
 * ordering, and a breadcrumb only ever needs these seven short strings.
 */
const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  files: 'Files',
  graph: 'Graph',
  changes: 'Changes',
  actions: 'Actions',
  tests: 'Tests',
  reviews: 'Reviews',
  settings: 'Settings',
};

function HistoryButtons() {
  const canGoBack = useUiStore((s) => s.viewHistoryIndex > 0);
  const canGoForward = useUiStore((s) => s.viewHistoryIndex < s.viewHistory.length - 1);

  return (
    <div className="flex shrink-0 items-center">
      <IconButton
        icon={LuArrowLeft}
        label="Back"
        size="sm"
        disabled={!canGoBack}
        onClick={() => useUiStore.getState().goBack()}
      />
      <IconButton
        icon={LuArrowRight}
        label="Forward"
        size="sm"
        disabled={!canGoForward}
        onClick={() => useUiStore.getState().goForward()}
      />
    </div>
  );
}

/**
 * Left-click reloads the way a plain browser refresh does; right-click opens
 * a menu for the hard-refresh variant that bypasses the HTTP cache — the same
 * split a browser's own reload button makes.
 */
function ReloadButton() {
  const dialogs = useDialogs();

  const items: MenuItem[] = [
    { label: 'Reload', onSelect: () => bridge()?.window.reload(false) },
    { label: 'Hard Reload', onSelect: () => bridge()?.window.reload(true), danger: true },
  ];

  return (
    <div
      className="shrink-0"
      onContextMenu={(event) => {
        event.preventDefault();
        dialogs.openMenu(event, items);
      }}
    >
      <IconButton
        icon={LuRotateCw}
        label="Reload window (right-click for hard reload)"
        size="sm"
        onClick={() => bridge()?.window.reload(false)}
      />
    </div>
  );
}

type Crumb = {
  key: string;
  label: string;
  onSelect?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

/**
 * Repo → branch → view/settings-page, built from state the app already
 * tracks rather than a route. The parts a plain breadcrumb would leave inert
 * act: the repo crumb opens a switcher when more than one repo is open (a
 * sideways jump a strict "ancestor path" breadcrumb couldn't offer), and the
 * branch crumb takes you to the Graph filtered to it.
 */
function useBreadcrumbs(): Crumb[] {
  const activeView = useUiStore((s) => s.activeView);
  const settingsPage = useUiStore((s) => s.settingsPage);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const { data: repos } = useRepos();
  const { data: status } = useStatus();
  const dialogs = useDialogs();

  const crumbs: Crumb[] = [];
  const repo = repos?.find((r) => r.id === selectedRepoId);

  if (repo) {
    const others = (repos ?? []).filter((r) => r.id !== selectedRepoId);
    crumbs.push({
      key: 'repo',
      label: repo.name,
      onSelect:
        others.length > 0
          ? (event) =>
              dialogs.openMenu(
                event,
                others.map(
                  (other): MenuItem => ({
                    label: other.name,
                    onSelect: () => useUiStore.getState().selectRepo(other.id),
                  }),
                ),
              )
          : undefined,
    });

    const branch = status?.branch;
    if (branch?.head) {
      const head = branch.head;
      crumbs.push({
        key: 'branch',
        label: head,
        onSelect: () => {
          useUiStore.getState().setGraphRefFilter([`refs/heads/${head}`]);
          useUiStore.getState().setActiveView('graph');
        },
      });
    } else if (branch?.detached && branch.oid) {
      crumbs.push({ key: 'branch', label: `${branch.oid.slice(0, 7)} (detached)` });
    }
  }

  if (activeView === 'settings') {
    crumbs.push({
      key: 'settings',
      label: 'Settings',
      onSelect: () => useUiStore.getState().setSettingsPage('appearance'),
    });
    crumbs.push({
      key: 'settings-page',
      label: SETTINGS_PAGES.find((p) => p.id === settingsPage)?.label ?? 'Settings',
    });
  } else {
    crumbs.push({ key: 'view', label: VIEW_LABELS[activeView] });
  }

  return crumbs;
}

function Breadcrumbs() {
  const crumbs = useBreadcrumbs();

  return (
    <nav aria-label="Location" className="flex min-w-0 items-center text-xs">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={crumb.key} className="flex min-w-0 items-center">
            {index > 0 ? (
              <LuChevronRight
                aria-hidden
                className="mx-0.5 h-3 w-3 shrink-0 text-muted-foreground/60"
              />
            ) : null}
            {crumb.onSelect ? (
              <button
                type="button"
                onClick={crumb.onSelect}
                className="max-w-[10rem] shrink truncate rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {crumb.label}
              </button>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={`max-w-[12rem] shrink truncate px-1 py-0.5 ${
                  isLast ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * The title bar's navigation cluster — back/forward, reload, breadcrumbs —
 * mounted in `<TitleBar>`'s `left` slot right after the wordmark.
 */
export function TitleBarNav() {
  return (
    <div className="flex min-w-0 items-center">
      <div aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
      <HistoryButtons />
      <ReloadButton />
      <div aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
      <Breadcrumbs />
    </div>
  );
}
