import { useEffect, useRef } from 'react';

import { AlertTriangle } from 'lucide-react';

/**
 * Confirmation for a destructive operation, with its blast radius.
 *
 * The number is the entire point. "Are you sure?" is a question nobody can
 * answer — it asks the user to re-derive what the app already knows. "This will
 * orphan 14 commits, including 'fix the parser'" is a decision.
 *
 * Rendered in-app rather than as a native dialog for the same reason as the
 * context menu: it has to carry the app's own tokens and its own content.
 */
export type BlastRadius = {
  count: number;
  sample: { sha: string; subject: string }[];
};

export type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Absent while still being counted; null when there is nothing to lose. */
  blastRadius?: BlastRadius | null;
  /**
   * Consequences that are not measured in commits.
   *
   * `blastRadius` speaks one sentence — "N commits will no longer be reachable"
   * — which is exactly right for a delete or a reset and exactly wrong for
   * "this checkout has 3 uncommitted files" or "the branch is 2 ahead of its
   * upstream". Rather than bend that sentence, a destructive op can hand over
   * its own lines; they render in the same alarming box, so the user reads one
   * warning region either way.
   */
  warnings?: string[];
  /**
   * Drop the Cancel button, for a dialog with nothing to cancel.
   *
   * A notice — "this is not built yet" — has one way out, and offering both
   * Cancel and OK asks the reader to choose between two words that mean the
   * same thing here. See `notify` in `dialog-host`.
   */
  hideCancel?: boolean;
  onConfirm: () => void;
  /**
   * A third way out, between Cancel and the primary action — Discard beside
   * Save/Cancel on the unsaved-changes guard, the only caller today. Absent
   * everywhere else, which keeps every existing two-button confirm unchanged.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    // Focus Cancel, not Confirm: for a destructive action the safe option is
    // the one a stray Return should hit.
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const radius = request.blastRadius;

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {/*
        A destructive confirm has to LOOK destructive before it is read.
        Tinting only the confirm button (which is what this did) puts the one
        signal on the control furthest from where the eye starts, so the dialog
        reads as routine right up to the moment of clicking. The ring, the
        header tint and the glyph move that signal to the top.
      */}
      <div
        className={`w-full max-w-md overflow-hidden rounded-lg border bg-popover shadow-xl ${
          request.danger ? 'border-destructive/60 ring-1 ring-destructive/25' : 'border-border'
        }`}
      >
        <div className={`p-4 ${request.danger ? 'bg-destructive/5' : ''}`}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {request.danger ? (
              <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-destructive" />
            ) : null}
            <span className={request.danger ? 'text-destructive' : ''}>{request.title}</span>
          </h2>
          {request.body ? (
            /*
              `whitespace-pre-line`, because a body that took the trouble to
              contain a line break meant it. The diagnostics prompt puts the
              literal command on one line and the directory it runs in on the
              next; collapsed into a paragraph they read as one run-on string,
              which is the opposite of what a consent dialog is for.
            */
            <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
              {request.body}
            </p>
          ) : null}

          {request.warnings && request.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
              {request.warnings.map((warning) => (
                <li key={warning} className="text-xs font-medium text-destructive">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {radius === undefined ? (
            <p className="mt-3 text-xs text-muted-foreground">Checking what this affects…</p>
          ) : radius && radius.count > 0 ? (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
              <p className="text-xs font-medium text-destructive">
                {radius.count} commit{radius.count === 1 ? '' : 's'} will no longer be reachable
                from any branch.
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {radius.sample.map((commit) => (
                  <li key={commit.sha} className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{commit.sha.slice(0, 7)}</span> {commit.subject}
                  </li>
                ))}
                {radius.count > radius.sample.length ? (
                  <li className="text-xs text-muted-foreground">
                    …and {radius.count - radius.sample.length} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : radius ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No commits become unreachable — every one is still on another branch.
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            {request.hideCancel ? null : (
              <button
                type="button"
                onClick={onCancel}
                autoFocus
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
            )}
            {request.secondaryLabel ? (
              <button
                type="button"
                onClick={request.onSecondary}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {request.secondaryLabel}
              </button>
            ) : null}
            <button
              ref={confirmRef}
              type="button"
              // With Cancel gone this is the only control, so it takes the
              // focus Cancel would otherwise hold — the safe-option rule above
              // has nothing left to protect.
              autoFocus={request.hideCancel === true}
              onClick={request.onConfirm}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 ${
                request.danger
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
