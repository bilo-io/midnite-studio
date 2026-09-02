import { useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../components/use-focus-trap';

/**
 * The Changes view's own stash prompt (Phase 22 Theme E).
 *
 * Not `dialogs.prompt` (`prompt-dialog.tsx`): that shape is one text field,
 * and this needs two more decisions surfaced as their own labelled controls
 * rather than defaults silently chosen for the user — `--keep-index` and
 * `--include-untracked` per the phase doc. Sidebar's own stash prompt
 * (`use-repo-actions.ts`'s `promptStashPush`) stays on the plain one-field
 * prompt; this is the richer one Theme E specifically calls for.
 *
 * Styled to match `PromptDialog` exactly — same backdrop, box and button
 * grammar — so it reads as the same modal family, not a second one.
 */
export type StashPushRequest = {
  /** Present with files selected (that selection's rows); absent for the whole worktree. */
  paths?: string[];
  onConfirm: (args: { message?: string; keepIndex: boolean; includeUntracked: boolean }) => void;
};

export function StashPushDialog({ request, onCancel }: { request: StashPushRequest; onCancel: () => void }) {
  const [message, setMessage] = useState('');
  const [keepIndex, setKeepIndex] = useState(false);
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useFocusTrap(containerRef, true);

  useEffect(() => {
    inputRef.current?.select();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const submit = () => {
    request.onConfirm({ message: message.trim() || undefined, keepIndex, includeUntracked });
  };

  const scopeLabel =
    request.paths && request.paths.length > 0
      ? request.paths.length === 1
        ? request.paths[0]
        : `${request.paths.length} selected files`
      : 'the whole worktree';

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Stash changes"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-border bg-popover p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 className="text-sm font-semibold">Stash changes</h2>
        <p className="mt-1 text-xs text-muted-foreground">Scope: {scopeLabel}</p>

        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="stash-message">
          Message (optional)
        </label>
        <input
          id="stash-message"
          ref={inputRef}
          value={message}
          autoFocus
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={keepIndex}
              onChange={(event) => setKeepIndex(event.target.checked)}
            />
            Keep staged changes staged
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(event) => setIncludeUntracked(event.target.checked)}
            />
            Include untracked files
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Create stash
          </button>
        </div>
      </form>
    </div>
  );
}
