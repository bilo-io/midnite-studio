import { useState } from 'react';

import type { Remote } from '@midnite/git-shared';
import { pickForgeRemote } from '@midnite/git-shared';
import { GitPullRequest, MoreVertical, Play, RefreshCw } from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { TreeSection } from '../../components/tree-section';
import { cascadeStyle } from '../../lib/cascade';
import { openExternal, useForgePulls, useForgeRuns, useRefreshForge } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { checksStatus, pullStatus, runStatus, StatusPill } from '../forge/forge-status';

/**
 * A repository's CI runs and open pull requests, in the sidebar tree.
 *
 * Both sections are lazy on their own fold state: an unopened section issues no
 * query, and a query is a `gh` subprocess plus an API request against the
 * user's rate limit. That is a stronger gate than the rest of the tree needs —
 * refs cost a local `for-each-ref` — and it is why these default to CLOSED
 * while Local and Worktrees default to open.
 *
 * Absent entirely for a repository with no GitHub remote. `gh` speaks GitHub
 * only, so for a GitLab or local-path remote there is nothing here that could
 * ever load; the same reasoning keeps the forge link off a `RemoteGroup` it
 * cannot resolve. A section that is permanently empty is not a section.
 */
export function ForgeSections({
  repoId,
  remotes,
  index,
}: {
  repoId: string;
  remotes: readonly Remote[];
  /** Cascade offset, so these animate in with the rest of the tree. */
  index: number;
}) {
  const forge = pickForgeRemote(remotes)?.forge ?? null;
  if (forge?.kind !== 'github') return null;

  return (
    <>
      <ActionsSection repoId={repoId} index={index} />
      <ReviewsSection repoId={repoId} index={index + 1} />
    </>
  );
}

function ActionsSection({ repoId, index }: { repoId: string; index: number }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useForgeRuns(repoId, open);
  const refresh = useRefreshForge(repoId);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const dialogs = useDialogs();

  const runs = data?.runs ?? [];

  return (
    <TreeSection
      title="Actions"
      count={open ? runs.length : undefined}
      icon={<Play aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={1}
      // A section that hid itself when empty could never show the "gh is not
      // signed in" card, which is the one state the user can actually fix.
      hideWhenEmpty={false}
      action={
        open
          ? {
              icon: RefreshCw,
              label: 'Refresh workflow runs',
              onClick: refresh,
            }
          : undefined
      }
    >
      <Unavailable result={data} isFetching={isFetching} empty="No workflow runs yet." />

      {runs.map((run, i) => (
        <ForgeRow
          key={run.id}
          index={i + index}
          status={runStatus(run)}
          title={run.name}
          subtitle={run.headBranch ?? 'detached'}
          menu={forgeRowMenu(run.url, 'run')}
          dialogs={dialogs}
          onOpen={() => {
            openTab({
              kind: 'run',
              repoId,
              runId: run.id,
              label: `${run.name} · ${run.headBranch ?? 'detached'}`,
              url: run.url,
            });
            setActiveView('changes');
          }}
        />
      ))}
    </TreeSection>
  );
}

function ReviewsSection({ repoId, index }: { repoId: string; index: number }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useForgePulls(repoId, open);
  const refresh = useRefreshForge(repoId);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const dialogs = useDialogs();

  const pulls = data?.pulls ?? [];

  return (
    <TreeSection
      title="Reviews"
      count={open ? pulls.length : undefined}
      icon={<GitPullRequest aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={1}
      hideWhenEmpty={false}
      action={
        open ? { icon: RefreshCw, label: 'Refresh pull requests', onClick: refresh } : undefined
      }
    >
      <Unavailable result={data} isFetching={isFetching} empty="No open pull requests." />

      {pulls.map((pull, i) => (
        <ForgeRow
          key={pull.number}
          index={i + index}
          status={pullStatus(pull)}
          extra={checksStatus(pull)}
          title={pull.title}
          subtitle={`#${pull.number} · ${pull.headBranch}`}
          menu={forgeRowMenu(pull.url, 'pull request')}
          dialogs={dialogs}
          onOpen={() => {
            openTab({
              kind: 'review',
              repoId,
              number: pull.number,
              label: `#${pull.number} ${pull.title}`,
              url: pull.url,
            });
            setActiveView('changes');
          }}
        />
      ))}
    </TreeSection>
  );
}

const forgeRowMenu = (url: string, what: string): MenuItem[] => [
  { label: `Open ${what} on GitHub`, onSelect: () => openExternal(url) },
  {
    label: 'Copy link',
    onSelect: () => void navigator.clipboard?.writeText(url).catch(() => undefined),
  },
];

/**
 * Why a section has nothing in it — which is never just "nothing".
 *
 * Four different empties, and conflating them is the difference between a user
 * running `gh auth login` and a user assuming the feature is broken: the CLI is
 * missing, the CLI is signed out, the call failed, or the repository genuinely
 * has no runs yet. Only the last one is a normal state.
 */
function Unavailable({
  result,
  isFetching,
  empty,
}: {
  result: { cli: { reason: string; hint: string }; error: string | null } | undefined;
  isFetching: boolean;
  empty: string;
}) {
  if (!result) {
    return isFetching ? <Note>Asking GitHub…</Note> : null;
  }

  if (result.cli.reason !== 'ready') {
    return <Note>{result.cli.hint || 'The GitHub CLI is unavailable.'}</Note>;
  }

  if (result.error) {
    return <Note tone="destructive">{result.error}</Note>;
  }

  return <EmptyIfNoRows>{empty}</EmptyIfNoRows>;
}

/**
 * The "no rows" line, rendered as a sibling of the rows rather than instead of
 * them. `TreeSection`'s children are a fragment, so this cannot know whether
 * any rows follow it — CSS can: the note hides itself whenever a row is present.
 */
function EmptyIfNoRows({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-8 py-1.5 text-xs text-muted-foreground [&:not(:last-child)]:hidden">
      {children}
    </p>
  );
}

function Note({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <p
      className={`px-8 py-1.5 text-xs leading-relaxed ${
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}

function ForgeRow({
  index,
  status,
  extra,
  title,
  subtitle,
  menu,
  dialogs,
  onOpen,
}: {
  index: number;
  status: { tone: 'ok' | 'fail' | 'busy' | 'idle' | 'warn'; label: string };
  extra?: { tone: 'ok' | 'fail' | 'busy' | 'idle' | 'warn'; label: string } | null;
  title: string;
  subtitle: string;
  menu: MenuItem[];
  dialogs: ReturnType<typeof useDialogs>;
  onOpen: () => void;
}) {
  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        dialogs.openMenu(event, menu);
      }}
      style={cascadeStyle(index)}
      className="group flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pl-8 pr-2 text-[13px] transition-colors hover:bg-accent/30"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <StatusPill status={status} />
          {extra ? <StatusPill status={extra} /> : null}
          <span className="truncate">{title}</span>
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
      </button>

      <IconButton
        icon={MoreVertical}
        label={`Actions for ${title}`}
        size="sm"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          dialogs.openMenu(
            { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom },
            menu,
          );
        }}
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}
