import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';

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

import { chordFor, displayChord } from '../features/status-bar/chord-hint';
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
  landing: 'Home',
  dashboard: 'Dashboard',
  files: 'Explorer',
  search: 'Search',
  tests: 'Tests',
  graph: 'Graph',
  changes: 'Changes',
  actions: 'Actions',
  reviews: 'Reviews',
  issues: 'Issues',
  projects: 'Projects',
  history: 'History',
  councils: 'Councils',
  workflows: 'Workflows',
  video: 'Video',
  sessions: 'Sessions',
  optimizer: 'Optimizer',
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
 *
 * Both rows carry their chord as a `description`, read from the keymap rather
 * than written out here: this button is where someone discovers that the app
 * reloads at all, and `Mod+R`/`Mod+Shift+R` are the gesture they will reach
 * for the second time.
 */
function ReloadButton() {
  const dialogs = useDialogs();

  const softChord = displayChord(chordFor('app.reload', 'Mod+r'));
  const hardChord = displayChord(chordFor('app.hardReload', 'Mod+Shift+r'));

  const items: MenuItem[] = [
    {
      label: 'Reload',
      icon: LuRotateCw,
      description: softChord,
      onSelect: () => bridge()?.window.reload(false),
    },
    {
      label: 'Hard Reload',
      icon: LuZap,
      description: hardChord,
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
        label={`Reload window (${softChord} · right-click for hard reload)`}
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
   * Whether the label folds away once it has been read. True for the crumbs
   * that name the page you are already on — they are the ones whose text is
   * redundant a few seconds after arrival; the repo and branch crumbs answer
   * "which of my things is this?", which never stops being worth showing.
   */
  collapsible?: boolean;
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
      collapsible: true,
      onSelect: () => useUiStore.getState().setSettingsPage('appearance'),
    });
    crumbs.push({
      key: 'settings-page',
      label: SETTINGS_PAGES.find((p) => p.id === settingsPage)?.label ?? 'Settings',
      icon: SETTINGS_PAGE_ICON[settingsPage],
      collapsible: true,
    });
  } else {
    crumbs.push({
      key: 'view',
      label: VIEW_LABELS[activeView],
      icon: VIEW_ICON[activeView],
      collapsible: true,
    });
  }

  return crumbs;
}

/**
 * How long a freshly-navigated page keeps its name on screen before the label
 * folds away and leaves only the glyph. Three seconds is long enough to read a
 * one-word label without being long enough to feel like a stuck banner.
 */
export const PAGE_LABEL_REVEAL_MS = 3000;

/**
 * `true` for the first {@link PAGE_LABEL_REVEAL_MS} after each navigation.
 *
 * Keyed on the page itself rather than on the crumb list, so re-selecting a
 * repo or landing on a new branch does not re-announce a page you never left.
 */
function usePageLabelReveal(): boolean {
  const activeView = useUiStore((s) => s.activeView);
  const settingsPage = useUiStore((s) => s.settingsPage);
  const pageKey = activeView === 'settings' ? `settings:${settingsPage}` : activeView;

  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    setRevealed(true);
    const timer = window.setTimeout(() => setRevealed(false), PAGE_LABEL_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [pageKey]);

  return revealed;
}

function Breadcrumbs() {
  const crumbs = useBreadcrumbs();
  const revealed = usePageLabelReveal();

  return (
    <nav aria-label="Location" className="flex min-w-0 items-center text-xs">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const isRepo = crumb.key === 'repo';
        const isBranch = crumb.key === 'branch';
        const Icon = crumb.icon;
        /*
          `shrink-0` on the glyph and `truncate` on the label, not the other way
          round: when the strip runs out of room it is the long repo or branch
          NAME that should give way, and a half-clipped icon would read as a
          rendering fault.
        */
        const icon = (
          <Icon
            aria-hidden
            className={`h-3 w-3 shrink-0 ${isBranch ? 'text-primary' : ''}`}
          />
        );

        /*
          The label carries its own left margin (via `ml-1`, or via
          `.breadcrumb-page-label` for the folding ones) instead of the row
          using a flex `gap`: a gap survives its label collapsing to zero
          width and leaves a hanging space after the icon.
        */
        const emphasis = isBranch ? 'font-bold text-primary' : '';
        const label = crumb.collapsible ? (
          <span className={`breadcrumb-page-label ${emphasis}`} data-revealed={revealed}>
            {crumb.label}
          </span>
        ) : (
          <span className={`ml-1 max-w-[9rem] truncate ${emphasis}`}>{crumb.label}</span>
        );

        const base = 'breadcrumb-crumb flex min-w-0 items-center';
        let buttonClass = `${base} rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground`;
        let spanClass = `${base} px-1 py-0.5 ${
          isLast ? 'font-medium text-foreground' : 'text-muted-foreground'
        }`;

        if (isRepo) {
          buttonClass = `breadcrumb-repo-pill ${base} cursor-pointer rounded-full px-2 py-0.5 text-foreground transition-all`;
          spanClass = `breadcrumb-repo-pill ${base} rounded-full px-2 py-0.5 text-foreground transition-all`;
        } else if (isBranch) {
          buttonClass = `${base} rounded px-1 py-0.5 font-bold text-primary transition-colors hover:bg-accent/50`;
          spanClass = `${base} px-1 py-0.5 font-bold text-primary`;
        }

        return (
          <span key={crumb.key} className="flex min-w-0 items-center">
            {index > 0 ? (
              <LuChevronRight
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60"
              />
            ) : null}
            {crumb.onSelect ? (
              <button type="button" onClick={crumb.onSelect} className={buttonClass}>
                {icon}
                {label}
              </button>
            ) : (
              <span aria-current={isLast ? 'page' : undefined} className={spanClass}>
                {icon}
                {label}
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
 * and, since the wordmark left the title bar, the first thing in its `left`
 * slot. There is no leading divider any more for the same reason: it was
 * separating this cluster from the brand, not opening the bar.
 */
export function TitleBarNav() {
  return (
    <div className="flex min-w-0 items-center">
      <HistoryButtons />
      <ReloadButton />
      <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
      <Breadcrumbs />
    </div>
  );
}
