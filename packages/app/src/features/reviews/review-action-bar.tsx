import type {
  ForgeMergeMethod,
  ForgeProjectWriteResult,
  ForgePull,
  ForgePullDetail,
  ForgeReviewEvent,
} from '@midnite/studio-shared';
import {
  LuCheck,
  LuFileSearch,
  LuGitMerge,
  LuKanban,
  LuMessageSquare,
  LuMessageSquareReply,
  LuMessagesSquare,
  LuScanEye,
  LuSend,
  LuUserPlus,
  LuX,
} from 'react-icons/lu';
import { useState, type MouseEvent } from 'react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import {
  useAddProjectItem,
  useCommentPull,
  useForgeProjects,
  useMarkPullReady,
  useMergePull,
  useRepos,
  useRequestReview,
  useReviewPull,
} from '../../services/queries';
import { Spinner } from '../../components/skeleton';
import { useUiStore, type AgentCommandId } from '../../store/ui-store';
import { useSkillHandoff } from '../agent/use-skill-handoff';
import { MergeDialog } from './merge-dialog';

/**
 * Everything this app can change about a pull request, in one row.
 *
 * **One composer, not three forms.** Approve, Request changes and Comment all
 * open the same textarea; which button opened it decides the verb, and the
 * verb is restated on the submit button so it is never ambiguous what pressing
 * it will publish. That is GitHub's own model, and the alternative — three
 * boxes whose contents have to be kept in sync, or thrown away on a switch —
 * is more UI for a worse outcome.
 *
 * **The gate is here rather than in the mutation.** `forgeWritesEnabled` is off
 * by default, and a disabled control that explains itself is the whole point of
 * gating at the surface: a mutation that silently refused would be a dead click
 * with nothing to read. See the store field's own note for why this is a switch
 * in Settings and not Phase 18's per-repo trust prompt.
 *
 * **Nothing here is optimistic.** Every action leaves its button disabled until
 * `gh` answers, then either invalidates (see `usePullInvalidator`) or renders
 * `gh`'s own sentence. A review that appears in the conversation before the
 * forge accepted it is the one failure mode that would make the app untrustworthy
 * at exactly the moment trust matters.
 */
const EVENT_LABEL: Record<ForgeReviewEvent, string> = {
  APPROVE: 'Approve',
  REQUEST_CHANGES: 'Request changes',
  COMMENT: 'Comment',
};

export function ReviewActionBar({
  repoId,
  pull,
  detail,
}: {
  repoId: string;
  pull: ForgePull;
  /** Null while the detail fetch is in flight — see `MergeDialog`'s `detail`. */
  detail: ForgePullDetail | null;
}) {
  const enabled = useUiStore((s) => s.forgeWritesEnabled);

  /**
   * Which verb the open composer will publish, or null when it is closed.
   *
   * `'discussion'` is the fourth arm and not a `ForgeReviewEvent`: posting a
   * conversation comment is `gh pr comment`, a different endpoint from
   * `gh pr review --comment`, and collapsing them would post reviews where the
   * user asked for discussion. See `commentCommand`'s doc comment.
   */
  const [composing, setComposing] = useState<ForgeReviewEvent | 'discussion' | null>(null);
  const [body, setBody] = useState('');
  const [merging, setMerging] = useState(false);
  const [reviewers, setReviewers] = useState('');
  const [requesting, setRequesting] = useState(false);

  const review = useReviewPull(repoId, pull.number);
  const comment = useCommentPull(repoId, pull.number);
  const merge = useMergePull(repoId, pull.number);
  const requestReview = useRequestReview(repoId, pull.number);
  const markReady = useMarkPullReady(repoId, pull.number);

  /*
    "Add to tasks" (Phase 50 Theme E) reuses exactly the data
    `tasks-view.tsx`'s own board picker reads — the repo's boards and the
    per-repo `boardByRepo` memory — rather than a second picker component.
    Fetched unconditionally like `list`/`detail` above (not gated behind the
    menu opening): the boards call is one cheap `gh project list`, already
    cached under the same `keys.forgeProjects(repoId)` key the Projects view
    itself warms, and gating it would leave the very first click on a cold
    cache building its menu from an empty, still-loading list.
  */
  const boards = useForgeProjects(repoId, true);
  const boardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const setProjectBoard = useUiStore((s) => s.setProjectBoard);
  const addToProject = useAddProjectItem();
  const dialogs = useDialogs();

  // "with AI" group: hands this PR to the configured agent as a typed-not-sent
  // skill command. Not gated on `forgeWritesEnabled` — nothing is written to
  // the forge from here; the agent's own session does whatever the user sends.
  const repos = useRepos();
  const handoff = useSkillHandoff();
  const repo = repos.data?.find((r) => r.id === repoId);
  const askAgent = (skillId: AgentCommandId, title: string) => {
    handoff({
      skillId,
      repoId,
      ...(repo ? { repo } : {}),
      body: pull.url.length > 0 ? pull.url : `#${pull.number}`,
      title: `${title} #${pull.number}`,
    });
  };

  const openProjectMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const list = boards.data?.projects ?? [];
    const lastPicked = boardByRepo[repoId];
    const items: MenuItem[] =
      list.length > 0
        ? list.map((board) => ({
            label: board.title + (board.id === lastPicked ? ' (last used)' : ''),
            onSelect: () => {
              setProjectBoard(repoId, board.id);
              addToProject.mutate({ projectId: board.id, contentId: pull.id });
            },
          }))
        : [
            // Reached only once the button's own `boards.isLoading` gate has
            // already cleared — an empty list at that point is a real "this
            // owner has no boards", never a still-loading one.
            { label: 'No task boards for this repo', disabled: true, onSelect: () => {} },
          ];
    dialogs.openMenu({ clientX: rect.left, clientY: rect.bottom }, items);
  };

  /*
    One line of feedback for the whole bar.

    Whichever mutation last answered with a problem owns it, because only one
    action can be in flight at a time — the controls disable while pending. A
    per-button error slot would mean five empty regions reserving space for a
    sentence that appears in one of them.
  */
  const problem =
    failureOf(review) ??
    failureOf(comment) ??
    failureOf(requestReview) ??
    failureOf(markReady) ??
    projectWriteFailure(addToProject.data);

  const closed = pull.state !== 'open';
  const busy =
    review.isPending ||
    comment.isPending ||
    requestReview.isPending ||
    markReady.isPending ||
    addToProject.isPending;

  const submit = () => {
    if (composing === null) return;
    const done = (ok: boolean) => {
      // The composer closes only on success. A refused review with the body
      // thrown away would mean retyping it to find out what was wrong with it.
      if (!ok) return;
      setComposing(null);
      setBody('');
    };
    if (composing === 'discussion') {
      comment.mutate({ body }, { onSuccess: (result) => done(result.ok) });
      return;
    }
    review.mutate({ event: composing, body }, { onSuccess: (result) => done(result.ok) });
  };

  if (closed) {
    /*
      A merged or closed PR is read-only, and says so rather than showing five
      buttons that would all be refused by GitHub. `gh pr review` on a merged
      pull request is not a permission error the user can act on — it is an
      action that stopped making sense.
    */
    return (
      <p className="text-[11px] text-muted-foreground">
        This pull request is {pull.state === 'merged' ? 'merged' : 'closed'} — there is nothing left
        to review.
      </p>
    );
  }

  return (
    /* The `py-2` on this bar's slot in `PrDetail` owns the gap above and below
       it — a margin here as well is what left a visible band of nothing between
       the header rule and the Approve row. */
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] as const).map((event) => (
            <ActionButton
              key={event}
              variant={
                event === 'APPROVE'
                  ? 'approve'
                  : event === 'REQUEST_CHANGES'
                    ? 'requestChanges'
                    : 'comment'
              }
              icon={
                event === 'APPROVE' ? LuCheck : event === 'REQUEST_CHANGES' ? LuX : LuMessageSquare
              }
              label={EVENT_LABEL[event]}
              enabled={enabled}
              disabled={busy}
              pressed={composing === event}
              onClick={() => {
                setComposing((current) => (current === event ? null : event));
              }}
            />
          ))}

          <ActionButton
            variant="discuss"
            icon={LuMessagesSquare}
            label="Comment on the conversation"
            shortLabel="Discuss"
            enabled={enabled}
            disabled={busy}
            pressed={composing === 'discussion'}
            onClick={() => {
              setComposing((current) => (current === 'discussion' ? null : 'discussion'));
            }}
          />

          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

          {/*
          Draft → Ready appears only on a draft and disappears once flipped,
          rather than staying as a dead toggle: `gh pr ready --undo` exists, but
          offering it would be a second state change with no affordance for
          getting back — see `readyCommand`.
        */}
          {pull.isDraft ? (
            <ActionButton
              variant="ready"
              icon={LuSend}
              label="Mark ready for review"
              shortLabel="Ready for review"
              enabled={enabled}
              disabled={busy}
              onClick={() => markReady.mutate()}
            />
          ) : null}

          <ActionButton
            variant="requestReview"
            icon={LuUserPlus}
            label="Request a review"
            shortLabel="Request review"
            enabled={enabled}
            disabled={busy}
            pressed={requesting}
            onClick={() => setRequesting((open) => !open)}
          />

          <ActionButton
            variant="tasks"
            icon={LuKanban}
            label="Add to tasks ▸"
            shortLabel="Add to tasks"
            enabled={enabled}
            /*
            `boards.isLoading` only — not `isFetching` — so a background
            refetch of an already-warm cache never disables this: `isLoading`
            is react-query's own "no data yet" signal, true only for the very
            first fetch this repo has ever made (often already settled by the
            time a human reads the tab and reaches for this button, since it
            fires the moment the PR opens). Disabling for the whole
            first-load window rather than opening the menu straight into a
            "Loading…" placeholder that can never update itself — the menu's
            `items` are a plain array, fixed at open time, not a live view.
          */
            disabled={busy || boards.isLoading}
            onClick={openProjectMenu}
          />

          <ActionButton
            variant="merge"
            icon={LuGitMerge}
            label="Merge this pull request"
            shortLabel="Merge"
            enabled={enabled}
            disabled={busy}
            onClick={() => setMerging(true)}
          />

          {!enabled ? (
            <span className="text-[11px] text-muted-foreground">
              Review actions are off — turn them on in Settings → Reviews.
            </span>
          ) : null}
        </div>

        <div
          className="ml-auto flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="AI actions"
        >
          <span className="select-none text-[11px] font-medium text-muted-foreground">
            AI powered:
          </span>
          <AiButton
            icon={LuScanEye}
            label="Review"
            variant="violet"
            onClick={() => askAgent('prReview', 'PR Review')}
          />
          <AiButton
            icon={LuFileSearch}
            label="Audit"
            variant="purple"
            onClick={() => askAgent('prAudit', 'PR Audit')}
          />
          <AiButton
            icon={LuMessageSquareReply}
            label="Address Feedback"
            variant="fuchsia"
            onClick={() => askAgent('prFeedback', 'PR Feedback')}
          />
        </div>
      </div>

      {composing !== null ? (
        <div className="flex flex-col gap-1.5 rounded border border-border bg-muted/30 p-2">
          <label htmlFor="review-body" className="text-[11px] text-muted-foreground">
            {composing === 'discussion'
              ? 'Comment on the conversation'
              : `${EVENT_LABEL[composing]} — leave a note`}
            {composing === 'APPROVE' ? ' (optional)' : ' (required)'}
          </label>
          <textarea
            id="review-body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Markdown, as GitHub renders it."
            className="resize-y rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposing(null);
                setBody('');
              }}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              /*
                Approve is the only verb that may be submitted empty.

                GitHub's review endpoint documents `body` as required for both
                REQUEST_CHANGES and COMMENT and refuses either without one, so
                the contract encodes that and this button agrees with it —
                rather than the user discovering the COMMENT half from a failed
                subprocess. A discussion comment with no body is meaningless
                too, and that rule is ours.
              */
              disabled={busy || (composing !== 'APPROVE' && body.trim().length === 0)}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Spinner className="size-3 border-primary-foreground/30 border-r-primary-foreground border-t-primary-foreground" />
                  Submitting…
                </>
              ) : composing === 'discussion' ? (
                'Comment'
              ) : (
                EVENT_LABEL[composing]
              )}
            </button>
          </div>
        </div>
      ) : null}

      {requesting ? (
        <ReviewerPicker
          suggested={detail?.reviewRequests ?? []}
          value={reviewers}
          onChange={setReviewers}
          pending={requestReview.isPending}
          onSubmit={(logins) => {
            requestReview.mutate(
              { reviewers: logins },
              {
                onSuccess: (result) => {
                  if (!result.ok) return;
                  setRequesting(false);
                  setReviewers('');
                },
              },
            );
          }}
        />
      ) : null}

      {problem !== null ? (
        <p role="alert" className="text-[11px] leading-relaxed text-destructive">
          {problem}
        </p>
      ) : null}

      {merging ? (
        <MergeDialog
          pullNumber={pull.number}
          title={pull.title}
          baseBranch={detail?.baseBranch ?? ''}
          detail={detail}
          pending={merge.isPending}
          error={failureOf(merge)}
          onCancel={() => {
            setMerging(false);
            merge.reset();
          }}
          onMerge={(method: ForgeMergeMethod) => {
            merge.mutate(
              { method },
              {
                onSuccess: (result) => {
                  // Stays open on refusal so `gh`'s reason is read where the
                  // decision was made, rather than behind a dialog that closed.
                  if (result.ok) setMerging(false);
                },
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}

type ActionButtonVariant =
  | 'approve'
  | 'requestChanges'
  | 'comment'
  | 'discuss'
  | 'ready'
  | 'requestReview'
  | 'tasks'
  | 'merge';

const ACTION_BUTTON_STYLES: Record<
  ActionButtonVariant,
  {
    pressed: string;
    hover: string;
  }
> = {
  approve: {
    pressed: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    hover:
      'enabled:hover:border-emerald-600 enabled:hover:bg-emerald-600 enabled:hover:text-white dark:enabled:hover:border-emerald-500 dark:enabled:hover:bg-emerald-500 dark:enabled:hover:text-white',
  },
  requestChanges: {
    pressed: 'border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-400',
    hover:
      'enabled:hover:border-red-600 enabled:hover:bg-red-600 enabled:hover:text-white dark:enabled:hover:border-red-500 dark:enabled:hover:bg-red-500 dark:enabled:hover:text-white',
  },
  comment: {
    pressed: 'border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400',
    hover:
      'enabled:hover:border-blue-600 enabled:hover:bg-blue-600 enabled:hover:text-white dark:enabled:hover:border-blue-500 dark:enabled:hover:bg-blue-500 dark:enabled:hover:text-white',
  },
  discuss: {
    pressed: 'border-teal-500/50 bg-teal-500/15 text-teal-600 dark:text-teal-400',
    hover:
      'enabled:hover:border-teal-600 enabled:hover:bg-teal-600 enabled:hover:text-white dark:enabled:hover:border-teal-500 dark:enabled:hover:bg-teal-500 dark:enabled:hover:text-white',
  },
  ready: {
    pressed: 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400',
    hover:
      'enabled:hover:border-amber-600 enabled:hover:bg-amber-600 enabled:hover:text-white dark:enabled:hover:border-amber-500 dark:enabled:hover:bg-amber-500 dark:enabled:hover:text-white',
  },
  requestReview: {
    pressed: 'border-indigo-500/50 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    hover:
      'enabled:hover:border-indigo-600 enabled:hover:bg-indigo-600 enabled:hover:text-white dark:enabled:hover:border-indigo-500 dark:enabled:hover:bg-indigo-500 dark:enabled:hover:text-white',
  },
  tasks: {
    pressed: 'border-slate-500/50 bg-slate-500/15 text-slate-700 dark:text-slate-300',
    hover:
      'enabled:hover:border-slate-700 enabled:hover:bg-slate-700 enabled:hover:text-white dark:enabled:hover:border-slate-600 dark:enabled:hover:bg-slate-600 dark:enabled:hover:text-white',
  },
  merge: {
    pressed: 'border-purple-500/50 bg-purple-500/15 text-purple-600 dark:text-purple-400',
    hover:
      'enabled:hover:border-purple-600 enabled:hover:bg-purple-600 enabled:hover:text-white dark:enabled:hover:border-purple-500 dark:enabled:hover:bg-purple-500 dark:enabled:hover:text-white',
  },
};

type AiButtonVariant = 'violet' | 'purple' | 'fuchsia';

const AI_BUTTON_STYLES: Record<AiButtonVariant, string> = {
  violet:
    'hover:border-violet-600 hover:bg-violet-600 hover:text-white dark:hover:border-violet-500 dark:hover:bg-violet-500 dark:hover:text-white hover:shadow-sm hover:shadow-violet-500/25',
  purple:
    'hover:border-purple-600 hover:bg-purple-600 hover:text-white dark:hover:border-purple-500 dark:hover:bg-purple-500 dark:hover:text-white hover:shadow-sm hover:shadow-purple-500/25',
  fuchsia:
    'hover:border-fuchsia-600 hover:bg-fuchsia-600 hover:text-white dark:hover:border-fuchsia-500 dark:hover:bg-fuchsia-500 dark:hover:text-white hover:shadow-sm hover:shadow-fuchsia-500/25',
};

/** Same look as the other "with AI" entry points (`PlanWithAiBar`). */
function AiButton({
  icon: Icon,
  label,
  variant = 'violet',
  onClick,
}: {
  icon: typeof LuCheck;
  label: string;
  variant?: AiButtonVariant;
  onClick: () => void;
}) {
  const hoverStyle = AI_BUTTON_STYLES[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`group inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-2 text-[11px] font-medium text-muted-foreground transition-all duration-150 ease-out ${hoverStyle}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 transition-transform duration-150" aria-hidden />
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-150 ease-out group-hover:ml-1.5 group-hover:max-w-48 group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-48 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

/**
 * Ask for reviews, by login.
 *
 * The suggestions are `reviewRequests` — whoever has been asked and has not
 * answered — because "re-request" is the common case and GitHub has no separate
 * verb for it: adding a reviewer who is already requested re-asks them. Beyond
 * that it is a free-text field, which is what the phase doc settled on rather
 * than spending a `gh api` call on a collaborator listing for a picker that is
 * usually one name long.
 */
function ReviewerPicker({
  suggested,
  value,
  onChange,
  pending,
  onSubmit,
}: {
  suggested: string[];
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  onSubmit: (logins: string[]) => void;
}) {
  // Commas or spaces, because a user typing two names will use one of them and
  // guessing which is a worse experience than accepting both.
  const typed = value
    .split(/[\s,]+/)
    .map((login) => login.trim())
    .filter((login) => login.length > 0);

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-muted/30 p-2">
      {suggested.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Awaiting review:</span>
          {suggested.map((login) => (
            <button
              key={login}
              type="button"
              disabled={pending}
              onClick={() => onSubmit([login])}
              /*
                An explicit label, because the content is a bare login and a
                bare login does not say what clicking it does. `title` alone
                would not fix that: content wins over `title` for the accessible
                name, so a screen reader would announce "ana, button".
              */
              aria-label={`Re-request a review from ${login}`}
              title={`Re-request a review from ${login}`}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent disabled:opacity-40"
            >
              {login}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="GitHub usernames, comma separated"
          aria-label="GitHub usernames to request a review from"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={pending || typed.length === 0}
          onClick={() => onSubmit(typed)}
          className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <>
              <Spinner className="size-3 border-primary-foreground/30 border-r-primary-foreground border-t-primary-foreground" />
              Requesting…
            </>
          ) : (
            'Request'
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * One button, and the reason it is not clickable when it is not.
 *
 * `enabled` (the settings switch) and `disabled` (something is in flight) are
 * separate props on purpose: they disable the button identically but they mean
 * different things, and only the first one has somewhere for the user to go.
 * The title carries that sentence, so hovering a greyed control explains it.
 */
function ActionButton({
  icon: Icon,
  label,
  shortLabel,
  enabled,
  disabled,
  pressed,
  variant,
  onClick,
}: {
  icon: typeof LuCheck;
  label: string;
  shortLabel?: string;
  enabled: boolean;
  disabled: boolean;
  pressed?: boolean;
  variant: ActionButtonVariant;
  /**
   * Widened to accept the click event (the DOM always passes one; most
   * callers just ignore it) so `openProjectMenu` below can read
   * `event.currentTarget`'s rect to anchor its menu, without a second button
   * component that duplicates this one's className.
   */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const styles = ACTION_BUTTON_STYLES[variant];
  const displayLabel = shortLabel ?? label;

  return (
    <button
      type="button"
      disabled={!enabled || disabled}
      aria-pressed={pressed}
      aria-label={displayLabel}
      onClick={onClick}
      title={enabled ? label : `${label} — enable review actions in Settings → Reviews`}
      className={`group inline-flex h-7 shrink-0 items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-all duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? styles.pressed : 'border-border bg-transparent text-muted-foreground'
      } ${styles.hover}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 transition-transform duration-150" aria-hidden />
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-150 ease-out group-hover:ml-1.5 group-hover:max-w-48 group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-48 group-focus-visible:opacity-100">
        {displayLabel}
      </span>
    </button>
  );
}

/**
 * The sentence a finished-and-refused mutation has to say, if any.
 *
 * Reads `data` rather than `error`, because these mutations never reject —
 * `ForgeWriteResult` carries the refusal as a value. `error` is `gh`'s own words
 * when it ran and said no; `cli.hint` is the install-or-sign-in sentence when it
 * could not be asked at all. A generic fallback covers the third case, which is
 * a non-zero exit `describeFailure` found no complaint in.
 */
function failureOf(mutation: {
  data?: { ok: boolean; error: string | null; cli: { reason: string; hint: string } };
}): string | null {
  const result = mutation.data;
  if (result === undefined || result.ok) return null;
  if (result.error !== null) return result.error;
  if (result.cli.reason !== 'ready') {
    return result.cli.hint.length > 0 ? result.cli.hint : 'The GitHub CLI is not available.';
  }
  return 'The GitHub CLI could not complete that request.';
}

/**
 * `ForgeProjectWriteResult` is a different envelope from `ForgeWriteResult`
 * above (`kind`-discriminated, no `cli`/`error` pair) — `field-editor.tsx`'s
 * own `failureOf` reads the identical shape for the board table's writes.
 */
function projectWriteFailure(result: ForgeProjectWriteResult | undefined): string | null {
  if (result === undefined || result.ok) return null;
  return result.kind === 'insufficient-scope' ? result.hint : result.message;
}
