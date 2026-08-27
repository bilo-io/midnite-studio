import { useState } from 'react';

import { Spinner } from '../../components/skeleton';

/**
 * The one box every review comment is typed into.
 *
 * One component for both the new-thread case and the reply case, differing only
 * in its labels — the same reasoning the phase doc gives for a single
 * review-body composer: two forms that must stay in sync are two forms that
 * drift, and there is nothing about a reply that needs different affordances.
 *
 * **The text is local state, and stays put on failure.** A refused write leaves
 * the box mounted with its content — losing somebody's paragraph because the
 * token had expired is the one outcome a composer must never produce. That is
 * also why `onSubmit` is fire-and-forget rather than awaited here: the caller
 * owns the mutation and hands back `busy` and `error`, so this component never
 * has to decide what a rejection means.
 */
export function CommentComposer({
  label,
  submitLabel,
  busy = false,
  error = null,
  onSubmit,
  onCancel,
  autoFocus = true,
}: {
  /** The accessible name of the textarea — what is being commented on. */
  label: string;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const trimmed = body.trim();

  return (
    <div className="mt-1.5" data-testid="comment-composer">
      <textarea
        aria-label={label}
        placeholder="Leave a comment"
        value={body}
        /*
          Focused on open, deliberately. The composer exists only because
          somebody clicked the gutter on a specific line; putting the caret in
          it continues that gesture rather than stealing focus from something
          else, and the alternative is a box that appears and then has to be
          clicked again.
        */
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Escape closes, and Cmd/Ctrl+Enter submits — the two shortcuts every
          // comment box on the web has, including the one this replaces a trip
          // to. A bare Enter stays a newline: review comments are prose.
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
            return;
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && trimmed.length > 0) {
            event.preventDefault();
            onSubmit(trimmed);
          }
        }}
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[13px] leading-relaxed outline-none focus:border-primary"
      />

      {error !== null ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}

      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSubmit(trimmed)}
          // Empty is not a comment. Disabled rather than validated on submit,
          // so the reason the button does nothing is visible before it is
          // pressed — and GitHub would reject it anyway.
          disabled={busy || trimmed.length === 0}
          className="inline-flex items-center gap-1.5 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <>
              {/* Unlabelled: the word beside it already says what is happening. */}
              <Spinner className="size-3 border-primary-foreground/30 border-r-primary-foreground border-t-primary-foreground" />
              Posting…
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
