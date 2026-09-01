import { useRef, useState } from 'react';

import { useFocusTrap } from '../../components/use-focus-trap';

/**
 * Name + optional description only — matching upstream's own minimal create
 * modal. Members are added afterward on the detail page, not at creation
 * time, which is why this isn't `PromptDialog` (one field) reused: a second
 * field for description is the whole difference.
 */
export function CouncilCreateDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, description: string | undefined) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const containerRef = useRef<HTMLFormElement>(null);
  useFocusTrap(containerRef, true);

  const empty = name.trim().length === 0;

  const submit = () => {
    if (empty) return;
    onCreate(name.trim(), description.trim().length > 0 ? description.trim() : undefined);
  };

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="New council"
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
        <h2 className="text-sm font-semibold">New council</h2>

        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="council-name">
          Name
        </label>
        <input
          id="council-name"
          value={name}
          autoFocus
          placeholder="e.g. Architecture review"
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="council-description">
          Description (optional)
        </label>
        <textarea
          id="council-description"
          value={description}
          rows={2}
          placeholder="What this panel is for"
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

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
            disabled={empty}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
