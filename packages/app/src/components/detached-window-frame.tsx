import { createContext, useContext, useState, type ReactNode } from 'react';

import { TitleBar } from '@bilo-io/shell';
import { isPageWindowRole, type WindowRole } from '@midnite/studio-shared';
import { FaGitAlt } from 'react-icons/fa';
import { LuSquareArrowDownLeft, LuTerminal } from 'react-icons/lu';

import { MidniteMenu } from '../features/agent/midnite-menu';
import { ProjectActions } from '../features/agent/project-actions';
import { RepoLifecycleActions } from '../features/repos/repo-lifecycle-actions';
import { primaryTarget } from '../features/repos/use-repo-actions';
import { LivenessSegment } from '../features/status-bar/liveness-segment';
import { bridge } from '../services/bridge';
import { useRepos } from '../services/queries';
import { useUiStore } from '../store/ui-store';
import { IconButton } from './icon-button';
import type { IconComponent } from './icon-button';
import { MidniteIcon } from './icons/midnite-icon';

import { VIEW_ICON } from './nav-icons';
import { Breadcrumbs, ReloadButton } from './title-bar-nav';

/** The last path segment — `packages/app` may not import `node:path`. */
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

type MergedRole = 'terminal' | 'repos' | 'browser' | 'graph';

/** A role gets the merged bar only if there is a bespoke header to merge in. */
function isMergedRole(role: WindowRole): role is MergedRole {
  return role === 'terminal' || role === 'repos' || role === 'browser' || role === 'graph';
}

const ROLE_ICON: Record<MergedRole, IconComponent> = {
  terminal: LuTerminal,
  repos: FaGitAlt,
  browser: MidniteIcon,
  graph: VIEW_ICON.graph,
};

/**
 * The DOM node a merged-role popout's own header portals its actions into,
 * once it has moved out of the panel body and into this bar's `right` slot —
 * `null` for the FAB popout (which keeps the plain frame below) and for the
 * main window (no `<DetachedWindowFrame>` at all).
 *
 * A portal, not a prop, because the header's *content* — the terminal's live
 * path and state dot, the repos toolbar, the whole browser tab strip — is
 * computed deep inside each panel's own tree from state this frame does not
 * have and should not fetch a second time. The portal lets that JSX keep its
 * normal parent for props and hooks while painting somewhere else.
 */
const PopoutHeaderActionsContext = createContext<HTMLDivElement | null>(null);

export function usePopoutHeaderActions(): HTMLDivElement | null {
  return useContext(PopoutHeaderActionsContext);
}

const PopoutHeaderLeadingContext = createContext<HTMLDivElement | null>(null);

export function usePopoutHeaderLeading(): HTMLDivElement | null {
  return useContext(PopoutHeaderLeadingContext);
}

/**
 * The bar's `left` slot for a merged role: the same hover-morph mark every
 * docked header already draws (a role glyph that swaps for an action on
 * hover), except here hovering reveals "dock" rather than "detach" — the
 * window is already the detached one — followed by the panel's title (except
 * for the terminal, where the state dot and path sit directly beside the mark).
 */
function PopoutHeaderMark({ role, title }: { role: MergedRole; title: string }) {
  const Icon = ROLE_ICON[role];
  return (
    <div
      data-page-detach-mark={role}
      className="group flex min-w-0 shrink-0 items-center gap-1.5"
    >
      <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center transition-opacity group-hover:opacity-0"
        >
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${role === 'repos' ? 'text-[#F05032]' : ''}`}
          />
        </span>
        <IconButton
          icon={LuSquareArrowDownLeft}
          label={`Dock ${title}`}
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => bridge()?.window.dock({ role })}
        />
      </div>
      {role !== 'terminal' && role !== 'browser' && (
        <span className="truncate text-xs font-medium">{title}</span>
      )}
    </div>
  );
}

/**
 * The chrome every popout window (Phase 55) draws around its one panel.
 *
 * Wraps `@bilo-io/shell`'s `<TitleBar>` rather than drawing its own —
 * `WindowChromeBridge` is already implemented in the preload and already
 * per-window, so re-implementing traffic-light spacing here would fork
 * chrome behaviour between the main window and popouts for no gain.
 * `<TitleBar>` itself renders nothing when the platform keeps its native
 * frame, so there is no per-platform branch here either.
 *
 * Terminal, Git Repos and Browser merge their own bespoke header into this
 * bar (traffic lights, then the hover-mark, then the title, then a gap,
 * then everything the docked header's own row would have shown) instead of
 * stacking a second header row below it — see `usePopoutHeaderActions`.
 * The FAB popout keeps the plain frame below (title, selected repo, a
 * dedicated re-dock button): undocked FAB behaviour is unchanged for now.
 *
 * The terminal popout additionally gets the main window's repo-action
 * cluster and the midnite menu, ahead of its own portaled buttons — see the
 * `right` slot below. `selectedRepoId`/`selectedWorktreePath` already reach
 * every window live (`useBroadcastSync`'s `'ui'` `SyncKind`, mounted once per
 * window by `DetachedShell`), so this frame reads them the same way the main
 * window's own title bar does rather than capturing a repo at detach time —
 * the cluster tracks whatever repo is selected in the main window as it
 * changes. There is no separate "this popout's own repo": the terminal panel
 * this same bar sits above resolves its `cwd` from this identical state
 * (`DetachedContent` in `detached-root.tsx`), so the bar and the session it
 * controls can never disagree.
 */
export function DetachedWindowFrame({
  role,
  title,
  children,
}: {
  role: WindowRole;
  title: string;
  children: ReactNode;
}) {
  const windowChrome = bridge()?.windowChrome ?? null;
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const { data: repos } = useRepos();
  const selectedRepo = repos?.find((repo) => repo.id === selectedRepoId) ?? null;
  const [leadingEl, setLeadingEl] = useState<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  const merged = isMergedRole(role);
  // Same resolution app.tsx's `centerActions` uses: prefer the selected
  // worktree, then the repo's primary checkout, then its root path.
  const repoCwd = selectedRepo
    ? (selectedWorktreePath ?? primaryTarget(selectedRepo).worktreePath ?? selectedRepo.path)
    : null;

  return (
    <div
      /*
        Theme K.4: a popout's first paint fades in through `DetachedShell`,
        which renders this frame exactly once for the life of the window —
        there is no reveal/hide cycle to key off, so a permanent
        `animate-fade-in` plays once on the window's own first paint and
        never needs to replay.
      */
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground animate-fade-in"
      style={{ paddingTop: 'var(--titlebar-h, 0px)' }}
    >
      <TitleBar
        windowChrome={windowChrome}
        left={
          merged ? (
            <div className="flex min-w-0 items-center gap-2">
              <PopoutHeaderMark role={role} title={title} />
              {role === 'graph' ? (
                <>
                  <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
                  <ReloadButton />
                  <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
                  <Breadcrumbs />
                </>
              ) : null}
              <div
                ref={setLeadingEl}
                className="flex min-w-0 items-center gap-2 overflow-x-auto text-xs text-muted-foreground"
              />
            </div>
          ) : (
            <span className="truncate px-1 text-xs font-medium">{title}</span>
          )
        }
        right={
          merged ? (
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              {/*
                Terminal only, and only once a repo is selected: with none
                selected there is no checkout for these to act on or for the
                midnite menu to run a skill against, so — mirroring
                `app.tsx`'s `centerActions`, which renders `null` the same
                way — the whole cluster (both delimiters included) is left
                out rather than shown disabled, so no hairline is ever
                stranded with nothing beside it.
              */}
              {role === 'terminal' && selectedRepo && repoCwd ? (
                <>
                  <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <ProjectActions
                      repoId={selectedRepo.id}
                      repoName={selectedRepo.name}
                      cwd={repoCwd}
                      {...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {})}
                    />
                    <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
                    <RepoLifecycleActions
                      repoId={selectedRepo.id}
                      repoName={selectedRepo.name}
                      cwd={repoCwd}
                      {...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {})}
                    />
                  </div>
                  <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
                  <MidniteMenu
                    repo={selectedRepo}
                    repoId={selectedRepo.id}
                    repoName={selectedRepo.name}
                    cwd={repoCwd}
                  />
                </>
              ) : null}
              {/*
                The merged header's own actions portal in here
                (`usePopoutHeaderActions`). `overflow-x-auto` plus a
                viewport-relative cap is what keeps a wide row (the browser's
                tab strip, in particular) from blowing out the bar instead of
                scrolling within it — the slot itself is `shrink-0` upstream.
              */}
              <div
                ref={setActionsEl}
                className="flex min-w-0 items-center gap-2 overflow-x-auto"
                style={{ maxWidth: '60vw' }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {selectedRepo ? (
                <span className="truncate text-xs text-muted-foreground">
                  {basename(selectedRepo.path)}
                </span>
              ) : null}
              {/*
                "Close", not "Re-dock", for a page: a page popout is a
                DUPLICATE of a view the main window never stopped rendering,
                so there is nothing to dock back and the word would promise a
                move that does not happen. Same IPC either way — `dock` on a
                page role just closes the window.
              */}
              <IconButton
                icon={LuSquareArrowDownLeft}
                label={isPageWindowRole(role) ? `Close ${title}` : `Re-dock ${title}`}
                size="sm"
                onClick={() => bridge()?.window.dock({ role })}
              />
            </div>
          )
        }
      />
      <PopoutHeaderActionsContext.Provider value={merged ? actionsEl : null}>
        <PopoutHeaderLeadingContext.Provider value={merged ? leadingEl : null}>
          <div className="min-h-0 flex-1">{children}</div>
        </PopoutHeaderLeadingContext.Provider>
      </PopoutHeaderActionsContext.Provider>
      {/*
        Phase 84 Theme I: every popout gets the liveness dot too, not just
        the main window. A popout has no `<StatusBar>` — that component's
        whole zoned-segment apparatus is main-window furniture — so this is
        a slim footer of its own rather than pulling that machinery in here.
      */}
      <footer className="flex shrink-0 items-center justify-end border-t border-border px-2 py-1">
        <LivenessSegment />
      </footer>
    </div>
  );
}
