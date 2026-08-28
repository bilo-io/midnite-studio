import { useEffect, useRef, useState } from 'react';

import { useFocusTrap } from './use-focus-trap';

/**
 * Single-line text prompt — new branch name, new tag name, rename.
 *
 * Its own component rather than `window.prompt` because the native prompt is
 * unstyled, blocks the whole renderer, and cannot show a validation message —
 * and "that branch name is invalid" is exactly what this needs to say before
 * git gets a chance to.
 */
export type PromptOption = {
  id: string;
  label: string;
  defaultChecked?: boolean;
};

export type PromptRequest = {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  placeholder?: string;
  options?: PromptOption[];
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  onConfirm: (value: string, optionsState?: Record<string, boolean>) => void;
};

export function PromptDialog({
  request,
  onCancel,
}: {
  request: PromptRequest;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(request.initialValue ?? '');
  const [optionsState, setOptionsState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (request.options) {
      for (const opt of request.options) {
        initial[opt.id] = opt.defaultChecked ?? false;
      }
    }
    return initial;
  });
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = value.length > 0 ? (request.validate?.(value) ?? null) : null;
  const empty = value.trim().length === 0;

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
    if (empty || error) return;
    request.onConfirm(value.trim(), optionsState);
  };

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
      <form
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-border bg-popover p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 className="text-sm font-semibold">{request.title}</h2>
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="prompt-input">
          {request.label}
        </label>
        <input
          id="prompt-input"
          ref={inputRef}
          value={value}
          autoFocus
          placeholder={request.placeholder}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}

        {request.options && request.options.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {request.options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={optionsState[opt.id] ?? false}
                  onChange={(e) =>
                    setOptionsState((prev) => ({ ...prev, [opt.id]: e.target.checked }))
                  }
                  className="rounded border-border text-primary focus:ring-ring"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        ) : null}

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
            disabled={empty || error !== null}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * git's own ref-name rules, as far as a UI needs them.
 *
 * Validating here rather than letting `git branch` fail means the user finds
 * out while typing, not after the dialog closes. The rules are from
 * `git check-ref-format`: no spaces, no `~^:?*[\`, no `..`, no leading/trailing
 * dot or slash, no trailing `.lock`.
 */
export function validateRefName(name: string): string | null {
  if (/\s/.test(name)) return 'Ref names cannot contain spaces.';
  if (/[~^:?*[\\]/.test(name)) return 'Ref names cannot contain ~ ^ : ? * [ or \\.';
  if (name.includes('..')) return 'Ref names cannot contain "..".';
  if (name.startsWith('/') || name.endsWith('/')) return 'Ref names cannot start or end with "/".';
  if (name.startsWith('.') || name.endsWith('.')) return 'Ref names cannot start or end with ".".';
  if (name.endsWith('.lock')) return 'Ref names cannot end with ".lock".';
  if (name.includes('//')) return 'Ref names cannot contain "//".';
  return null;
}
