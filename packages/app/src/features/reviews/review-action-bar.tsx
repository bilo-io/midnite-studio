import type {
  ForgeMergeMethod,
  ForgePull,
  ForgePullDetail,
  ForgeReviewEvent,
} from '@midnite/studio-shared';
import { Check, GitMerge, MessageSquare, Send, UserPlus, X } from 'lucide-react';
import { useState } from 'react';

import {
  useCommentPull,
  useMarkPullReady,
  useMergePull,
  useRequestReview,
  useReviewPull,
} from '../../services/queries';
import { Spinner } from '../../components/skeleton';
import { useUiStore } from '../../store/ui-store';
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
    One line of feedback for the whole bar.

    Whichever mutation last answered with a problem owns it, because only one
    action can be in flight at a time — the controls disable while pending. A
    per-button error slot would mean five empty regions reserving space for a
    sentence that appears in one of them.
  */
  const problem =
    failureOf(review) ?? failureOf(comment) ?? failureOf(requestReview) ?? failureOf(markReady);

  const closed = pull.state !== 'open';
  const busy =
    review.isPending || comment.isPending || requestReview.isPending || markReady.isPending;

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
      <div className="flex flex-wrap items-center gap-1.5">
        {(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] as const).map((event) => (
          <ActionButton
            key={event}
            icon={event === 'APPROVE' ? Check : event === 'REQUEST_CHANGES' ? X : MessageSquare}
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
          icon={MessageSquare}
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
            icon={Send}
            label="Mark ready for review"
            shortLabel="Ready for review"
            enabled={enabled}
            disabled={busy}
            onClick={() => markReady.mutate()}
          />
        ) : null}

        <ActionButton
          icon={UserPlus}
          label="Request a review"
          shortLabel="Request review"
          enabled={enabled}
          disabled={busy}
          pressed={requesting}
          onClick={() => setRequesting((open) => !open)}
        />

        <ActionButton
          icon={GitMerge}
          label="Merge this pull request"
          shortLabel="Merge"
          enabled={enabled}
          disabled={busy}
          danger
          onClick={() => setMerging(true)}
        />

        {!enabled ? (
          <span className="text-[11px] text-muted-foreground">
            Review actions are off — turn them on in Settings → Reviews.
          </span>
        ) : null}
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
  danger,
  onClick,
}: {
  icon: typeof Check;
  label: string;
  shortLabel?: string;
  enabled: boolean;
  disabled: boolean;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled || disabled}
      aria-pressed={pressed}
      onClick={onClick}
      title={enabled ? label : `${label} — enable review actions in Settings → Reviews`}
      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed
          ? 'border-primary bg-primary/10 text-foreground'
          : danger
            ? 'border-destructive/50 text-destructive hover:bg-destructive/10'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {shortLabel ?? label}
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
