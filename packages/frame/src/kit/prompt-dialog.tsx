import { useState } from 'react';

import type { FramePromptRequest } from '../chrome/types';

/**
 * The suite kit's one-field prompt (Phase 113 Theme Q) — what `createDialogs().prompt` renders,
 * so an app on the kit can name a new project or doc. Enter confirms, Escape cancels, and the
 * request's `validate` blocks a bad value with its message.
 */
export function KitPromptDialog({ request, onCancel }: { request: FramePromptRequest; onCancel: () => void }) {
  const [value, setValue] = useState(request.initialValue ?? '');
  const error = value.length > 0 ? (request.validate?.(value) ?? null) : null;
  const canConfirm = value.trim().length > 0 && error === null;
  const confirm = () => {
    if (!canConfirm) return;
    onCancel();
    request.onConfirm(value);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        className="w-80 rounded-lg border border-border bg-background p-4 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 className="mb-3 text-sm font-semibold">{request.title}</h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {request.label}
          <input
            autoFocus
            value={value}
            placeholder={request.placeholder}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
        {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs hover:bg-accent">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
