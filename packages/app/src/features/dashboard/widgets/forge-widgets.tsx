import { useMemo } from 'react';

import type { Forge, ForgeIssue, ForgePull, ForgeRun } from '@midnite/studio-shared';

import { GoIssueClosed, GoIssueOpened } from 'react-icons/go';

import { Tooltip } from '../../../components/tooltip';
import { openLinkFromEvent } from '../../../services/open-in-midnite';
import {
  PROVIDER_BRAND_COLOR,
  PROVIDER_HOST,
  PROVIDER_ICON,
  PROVIDER_LABEL,
} from '../../settings/settings-pages/accounts-page';
import { getActionItemStyle } from '../../actions/action-status-styles';
import { checksStatus, pullStatus, runStatus, StatusPill } from '../../forge/forge-status';
import { WidgetState } from '../widget-frame';

/**
 * The three tiles that read GitHub, sharing one shape.
 *
 * The phase's read-only rule means nothing on this board merges, closes,
 * approves or re-runs, so a row's only action is to open the thing it names —
 * through `openLinkFromEvent`, tagged with the dashboard's own `repoId` so a
 * browser tab lands in its derived group (Phase 71 Theme B). Since the ad hoc
 * click-modifier theme, that is three destinations, not two: `preferInAppRoute:
 * true` means a plain click prefers Midnite's own view for the thing (a pull
 * lands on `PrDetail`, an issue on `IssueDetail`, a run in Actions) exactly
 * like `forge-sections.tsx`'s sidebar rows already do unconditionally — the
 * dashboard's rows differ only in still reading the click event, so Mod/Ctrl
 * still forces the system browser, Mod+Shift the native view (else the
 * embedded browser), and Alt/Option the embedded one even from a tile. That is why they are `<button>`s rather than anchors:
 * the renderer is a `file://` origin in the packaged app, and a real `href`
 * would either do nothing or navigate the whole window out of the application.
 */

/**
 * Four different empties, as `forge-sections.tsx` established. Same rules here.
 *
 * A plain function rather than a component: it returns the three strings a
 * `WidgetState` needs, so the caller can override one of them (a disabled issue
 * tracker) before rendering. A component could only return the finished markup,
 * and every widget would then need its own copy of the four-way distinction.
 */
function forgeEmptyState({
  result,
  isFetching,
  empty,
}: {
  result: { cli: { reason: string; hint: string }; error: string | null } | undefined;
  isFetching: boolean;
  empty: string;
}): { loading: boolean; error: string | null; emptyLabel: string } {
  if (!result) return { loading: isFetching, error: null, emptyLabel: empty };
  if (result.cli.reason !== 'ready') {
    return {
      loading: false,
      error: null,
      emptyLabel: result.cli.hint || 'The GitHub CLI is unavailable.',
    };
  }
  if (result.error) return { loading: false, error: result.error, emptyLabel: empty };
  return { loading: false, error: null, emptyLabel: empty };
}

export function PullsWidget({
  result,
  isFetching,
  repoId,
  forge = null,
}: {
  result:
    { cli: { reason: string; hint: string }; pulls: ForgePull[]; error: string | null } | undefined;
  isFetching: boolean;
  repoId: string;
  /**
   * The forge these pulls were listed from. A listing is per repository, so
   * every row shares the repo's forge remote — already on the wire as
   * `Remote.forge`, which is why no per-pull provider field exists.
   */
  forge?: Forge | null;
}) {
  const state = forgeEmptyState({ result, isFetching, empty: 'No open pull requests.' });
  const pulls = result?.pulls ?? [];

  return (
    <WidgetState
      loading={state.loading}
      error={state.error}
      empty={pulls.length === 0}
      emptyLabel={state.emptyLabel}
    >
      <ul className="flex flex-col">
        {pulls.map((pull) => (
          <ForgeListRow
            key={pull.number}
            onOpen={(event) =>
              openLinkFromEvent(pull.url, event, { originRepoId: repoId, preferInAppRoute: true })
            }
            title={pull.title}
            openLabel={`Open pull request #${pull.number}`}
            leading={<ForgeMark forge={forge} />}
            meta={<PullMeta pull={pull} />}
            subtitle={`#${pull.number} · ${pull.headBranch}${pull.author ? ` · ${pull.author}` : ''}`}
          />
        ))}
      </ul>
    </WidgetState>
  );
}

export function IssuesWidget({
  result,
  isFetching,
  repoId,
}: {
  result:
    | {
        cli: { reason: string; hint: string };
        issues: ForgeIssue[];
        disabled: boolean;
        error: string | null;
      }
    | undefined;
  isFetching: boolean;
  repoId: string;
}) {
  const state = forgeEmptyState({ result, isFetching, empty: 'No open issues.' });
  const issues = result?.issues ?? [];

  /*
    A disabled tracker outranks every other empty. It is not a failure, not a
    missing CLI and not "no issues yet" — it is a repository that has chosen to
    track its work somewhere else, and saying so is the difference between the
    user shrugging and the user going looking for a bug.
  */
  const emptyLabel = result?.disabled
    ? 'Issues are disabled for this repository.'
    : state.emptyLabel;

  return (
    <WidgetState
      loading={state.loading}
      error={result?.disabled ? null : state.error}
      empty={issues.length === 0}
      emptyLabel={emptyLabel}
    >
      <ul className="flex flex-col">
        {issues.map((issue) => (
          <ForgeListRow
            key={issue.number}
            onOpen={(event) =>
              openLinkFromEvent(issue.url, event, { originRepoId: repoId, preferInAppRoute: true })
            }
            title={issue.title}
            openLabel={`Open issue #${issue.number}`}
            leading={<IssueMark state={issue.state} />}
            meta={
              <span className="flex shrink-0 items-center gap-1">
                {issue.labels.slice(0, 3).map((label) => (
                  <span
                    key={label.name}
                    title={label.name}
                    className="max-w-[6rem] truncate rounded-full px-1.5 py-px text-[9px] font-medium"
                    style={
                      label.color
                        ? {
                            backgroundColor: `#${label.color}33`,
                            // The forge's own colour as the text, over a 20%
                            // wash of itself — legible on either theme's ground
                            // without the app having to know how dark it is.
                            color: `#${label.color}`,
                          }
                        : { backgroundColor: 'hsl(var(--muted))' }
                    }
                  >
                    {label.name}
                  </span>
                ))}
              </span>
            }
            subtitle={`#${issue.number}${issue.author ? ` · ${issue.author}` : ''}`}
          />
        ))}
      </ul>
    </WidgetState>
  );
}

export function RunsWidget({
  result,
  isFetching,
  repoId,
}: {
  result:
    { cli: { reason: string; hint: string }; runs: ForgeRun[]; error: string | null } | undefined;
  isFetching: boolean;
  repoId: string;
}) {
  const state = forgeEmptyState({ result, isFetching, empty: 'No workflow runs yet.' });

  /*
    Grouped by the workflow's display name, which is what `gh run list` gives
    today. Theme C adds the workflow FILE to the payload and the grouping key
    moves to it — at which point two workflows that happen to share a display
    name stop being one group. Doing it by name now is the honest version of
    what this data can support, not a shortcut around the better key.

    Keyed on `result?.runs` rather than on a `?? []` default: the default is a
    fresh array on every render, so the memo would rebuild the whole grouping
    each time and be no memo at all.
  */
  const runs = result?.runs;
  const groups = useMemo(() => {
    const byName = new Map<string, ForgeRun[]>();
    for (const run of runs ?? []) {
      const list = byName.get(run.name);
      if (list) list.push(run);
      else byName.set(run.name, [run]);
    }
    return [...byName.entries()];
  }, [runs]);

  return (
    <WidgetState
      loading={state.loading}
      error={state.error}
      empty={(runs?.length ?? 0) === 0}
      emptyLabel={state.emptyLabel}
    >
      <div className="flex flex-col gap-2">
        {groups.map(([name, groupRuns]) => (
          <div key={name}>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {name}
            </p>
            <ul className="mt-0.5 flex flex-col gap-1">
              {groupRuns.slice(0, 5).map((run) => (
                <RunListRow
                  key={run.id}
                  run={run}
                  onOpen={(event) =>
                    openLinkFromEvent(run.url, event, {
                      originRepoId: repoId,
                      preferInAppRoute: true,
                    })
                  }
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </WidgetState>
  );
}

/**
/**
 * A run row styled exactly like the Actions view's `RunRow`: `StatusPill`,
 * plus `getActionItemStyle` for the tone text colour, glow and the
 * running/queued row animation. No dashboard-specific run styling.
 */
export function RunListRow({
  run,
  onOpen,
}: {
  run: ForgeRun;
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const status = runStatus(run);
  const style = getActionItemStyle(status);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open run"
        className={`flex w-full min-w-0 items-start gap-1.5 border-l-2 border-transparent px-1.5 py-1 text-left transition-colors hover:bg-accent/20 ${style.rowClass}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-xs font-medium ${style.textClass} ${style.glowClass}`}>
            {run.headBranch ?? 'detached'}
          </span>
          <span className={`block truncate text-[10px] ${style.subtextClass} ${style.glowClass}`}>
            {new Date(run.createdAt).toLocaleString()}
          </span>
        </span>
        <StatusPill status={status} />
      </button>
    </li>
  );
}

/**
 * The forge a row came from, as its brand mark with a tooltip naming it. The
 * host is appended only when it is not the provider's public one — a
 * self-hosted instance is the case where "GitHub" alone is ambiguous.
 * A plain `span` rather than a focusable trigger: the whole row is already a
 * button, and nesting a second interactive element inside it is invalid.
 */
export function ForgeMark({ forge }: { forge: Forge | null }) {
  if (!forge || forge.kind === 'unknown') return null;
  const Icon = PROVIDER_ICON[forge.kind];
  const name = PROVIDER_LABEL[forge.kind];
  const label = forge.host === PROVIDER_HOST[forge.kind] ? name : `${name} · ${forge.host}`;
  return (
    <Tooltip label={label}>
      <span
        role="img"
        aria-label={label}
        data-forge={forge.kind}
        className="forge-provider-option mt-0.5 flex shrink-0"
        style={
          {
            '--brand-light': PROVIDER_BRAND_COLOR[forge.kind].light,
            '--brand-dark': PROVIDER_BRAND_COLOR[forge.kind].dark,
            color: 'var(--forge-brand)',
          } as React.CSSProperties
        }
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
    </Tooltip>
  );
}

/** GitHub's own open (green) / closed (violet) issue glyphs, as the sidebar section uses. */
export function IssueMark({ state }: { state: ForgeIssue['state'] }) {
  const Icon = state === 'closed' ? GoIssueClosed : GoIssueOpened;
  return (
    <span
      role="img"
      aria-label={state === 'closed' ? 'Closed issue' : 'Open issue'}
      data-issue-state={state}
      className={`mt-0.5 flex shrink-0 ${
        state === 'closed'
          ? 'text-violet-500 dark:text-violet-400'
          : 'text-emerald-500 dark:text-emerald-400'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/** The review verdict and, where the PR has any checks at all, their rollup. */
function PullMeta({ pull }: { pull: ForgePull }) {
  const checks = checksStatus(pull);
  return (
    <>
      <StatusPill status={pullStatus(pull)} />
      {checks ? <StatusPill status={checks} /> : null}
    </>
  );
}

function ForgeListRow({
  onOpen,
  openLabel,
  title,
  subtitle,
  leading,
  meta,
}: {
  /** Reads the click's modifiers, so the shared Mod/Alt grammar reaches these rows too. */
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
  openLabel: string;
  title: string;
  subtitle: string;
  /** Optional mark before the title — the pulls tile's forge icon. */
  leading?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <li className="border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className="flex w-full min-w-0 items-start gap-1.5 py-1 text-left transition-colors hover:bg-accent/30"
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{title}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>
        </span>
        {meta}
      </button>
    </li>
  );
}
