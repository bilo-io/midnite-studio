import { LuTriangleAlert, LuX } from 'react-icons/lu';

/**
 * One toast — the presentational half of the pair, `ToastHost` (`toast-host.tsx`)
 * being the other. Split the same way `ConfirmDialog`/`DialogHost` are: this
 * component knows how to render a request, the host owns the stack, the
 * timers and the keyboard handling.
 *
 * This is deliberately a NEW, separate notion from the existing
 * `store/toast-store.ts` + `notification-bell.tsx` pair. That store is a
 * persistent, read-when-you-look notification list (bell icon, no
 * auto-dismiss) — the right shape for "an update is ready" or "a loop
 * finished". Phase 22 Theme H needs a transient, stacking, auto-dismissing
 * popup that appears the moment a write completes and can carry an inline
 * Undo — a different enough shape that folding it into the bell's list would
 * either break the bell's six existing callers or blunt this one's urgency.
 * The two are visually and conceptually distinct on purpose; a later phase
 * may want to reconcile the naming, but that is out of scope here.
 */
export type ToastAction = {
  label: string;
  onAction: () => void;
};

export type ToastRequest = {
  /** The one line the toast says. */
  message: string;
  /** Tints the toast the way a destructive `ConfirmDialog` tints itself. */
  danger?: boolean;
  /** An inline action — Theme H's Undo button. Absent means a plain notice. */
  action?: ToastAction;
};

export function Toast({
  request,
  onDismiss,
  onAction,
}: {
  request: ToastRequest;
  onDismiss: () => void;
  onAction: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex w-80 items-start gap-2 rounded-lg border bg-popover p-3 shadow-xl transition-opacity ${
        request.danger ? 'border-destructive/60 ring-1 ring-destructive/25' : 'border-border'
      }`}
    >
      {request.danger ? (
        <LuTriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : null}
      <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">{request.message}</p>
      {request.action ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          {request.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LuX aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
