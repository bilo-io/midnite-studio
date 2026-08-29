import type { MouseEvent as ReactMouseEvent } from 'react';

import type { IconType } from 'react-icons';
import {
  LuArrowLeft,
  LuArrowRight,
  LuChevronRight,
  LuFolderGit2,
  LuGitBranch,
  LuGitCommitHorizontal,
  LuRotateCw,
  LuZap,
} from 'react-icons/lu';

import { bridge } from '../services/bridge';
import { useRepos } from '../services/queries';
import { useStatus } from '../services/use-status';
import { SETTINGS_PAGES, useUiStore, type ViewId } from '../store/ui-store';
import type { MenuItem } from './context-menu';
import { useDialogs } from './dialog-host';
import { IconButton } from './icon-button';
import { SETTINGS_PAGE_ICON, VIEW_ICON } from './nav-icons';

/**
 * Short labels for the rail's views, duplicated from `app.tsx`'s `NAV_ITEMS`
 * rather than imported: that module also carries the rail's ordering and forge
 * gating, and a breadcrumb only ever needs these eight short strings. The
 * glyphs beside them are NOT duplicated — they come from the shared
 * `nav-icons` map, so a view wears one icon everywhere.
 */
const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  files: 'Files',
  search: 'Search',
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
    { label: 'Reload', icon: LuRotateCw, onSelect: () => bridge()?.window.reload(false) },
    {
      label: 'Hard Reload',
      icon: LuZap,
      onSelect: () => bridge()?.window.reload(true),
      danger: true,
    },
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
  /**
   * The glyph shown ahead of the label. Every crumb has one: a breadcrumb where
   * only some segments carry an icon reads as a ragged list rather than a path,
   * and the glyph is what says *what kind of thing* a truncated name is when
   * the label alone has been cut to "midnite-…".
   */
  icon: IconType;
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
      icon: LuFolderGit2,
      onSelect:
        others.length > 0
          ? (event) =>
              dialogs.openMenu(
                event,
                others.map(
                  (other): MenuItem => ({
                    label: other.name,
                    icon: LuFolderGit2,
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
        icon: LuGitBranch,
        onSelect: () => {
          useUiStore.getState().setGraphRefFilter([`refs/heads/${head}`]);
          useUiStore.getState().setActiveView('graph');
        },
      });
    } else if (branch?.detached && branch.oid) {
      // A commit glyph, not the branch one: detached HEAD is precisely the
      // state of standing on a commit rather than on a branch.
      crumbs.push({
        key: 'branch',
        label: `${branch.oid.slice(0, 7)} (detached)`,
        icon: LuGitCommitHorizontal,
      });
    }
  }

  if (activeView === 'settings') {
    crumbs.push({
      key: 'settings',
      label: 'Settings',
      icon: VIEW_ICON.settings,
      onSelect: () => useUiStore.getState().setSettingsPage('appearance'),
    });
    crumbs.push({
      key: 'settings-page',
      label: SETTINGS_PAGES.find((p) => p.id === settingsPage)?.label ?? 'Settings',
      icon: SETTINGS_PAGE_ICON[settingsPage],
    });
  } else {
    crumbs.push({ key: 'view', label: VIEW_LABELS[activeView], icon: VIEW_ICON[activeView] });
  }

  return crumbs;
}

function Breadcrumbs() {
  const crumbs = useBreadcrumbs();

  return (
    <nav aria-label="Location" className="flex min-w-0 items-center text-xs">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const Icon = crumb.icon;
        /*
          `shrink-0` on the glyph and `truncate` on the label, not the other way
          round: when the strip runs out of room it is the long repo or branch
          NAME that should give way, and a half-clipped icon would read as a
          rendering fault.
        */
        const icon = <Icon aria-hidden className="h-3 w-3 shrink-0" />;
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
                className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {icon}
                <span className="max-w-[10rem] truncate">{crumb.label}</span>
              </button>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={`flex min-w-0 items-center gap-1 px-1 py-0.5 ${
                  isLast ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                {icon}
                <span className="max-w-[12rem] truncate">{crumb.label}</span>
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
