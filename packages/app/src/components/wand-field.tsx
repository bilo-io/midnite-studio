import { useRef, useState } from 'react';

import { LuRotateCcw, LuWandSparkles } from 'react-icons/lu';

import { useImproveField } from '../services/queries';
import { IconButton } from './icon-button';

/**
 * The magic wand (Phase 95 Theme E) — a rewrite button beside one text field,
 * shared by `IssueDialog` and `ProjectDialog` rather than built twice.
 *
 * Click: the field goes read-only, wears `.activity-glow`'s agent ring
 * (Phase 95 Theme A/C — the same ring a live agent session paints elsewhere
 * in the app) while `ai:improveField` runs, then the suggestion replaces the
 * value with a one-step Undo. **Esc cancels** — client-side only: there is no
 * IPC channel to kill the main-side subprocess mid-flight (a real cancel
 * would need one, which this theme did not ask for), so Esc marks the
 * in-flight request stale and re-enables the field immediately; the
 * subprocess keeps running to its own 30s deadline in the background and its
 * answer is simply discarded on arrival. Harmless either way — the call
 * shares nothing with the field once it is marked stale.
 */
export function WandField({
  fieldName,
  value,
  onChange,
  repoName,
  repoPath,
  otherFields,
  agentId,
  multiline = false,
  rows = 4,
  placeholder,
  inputProps,
}: {
  fieldName: string;
  value: string;
  onChange: (value: string) => void;
  repoName: string;
  repoPath?: string | null;
  otherFields?: Record<string, string>;
  agentId?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  inputProps?: { 'aria-label'?: string; id?: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [undoValue, setUndoValue] = useState<string | null>(null);
  // Esc marks the request stale without waiting on the mutation itself to
  // settle — `improve.isPending` alone would keep the field read-only until
  // the subprocess's own 30s deadline, exactly the "hung" feel Esc exists to
  // escape from.
  const [cancelled, setCancelled] = useState(false);
  const staleRef = useRef(false);
  const improve = useImproveField();

  const generating = improve.isPending && !cancelled;

  const run = () => {
    setError(null);
    setCancelled(false);
    staleRef.current = false;
    const before = value;
    improve.mutate(
      {
        ...(agentId ? { agentId } : {}),
        repoPath: repoPath ?? null,
        repoName,
        fieldName,
        fieldValue: value,
        ...(otherFields ? { otherFields } : {}),
      },
      {
        onSuccess: (result) => {
          if (staleRef.current) return;
          if (result.ok) {
            setUndoValue(before);
            onChange(result.value.text);
          } else {
            setError(result.message || 'The wand had nothing to say.');
          }
        },
        onError: () => {
          if (!staleRef.current) setError('The wand could not run.');
        },
      },
    );
  };

  const cancel = () => {
    staleRef.current = true;
    setCancelled(true);
    setError(null);
  };

  const undo = () => {
    if (undoValue === null) return;
    onChange(undoValue);
    setUndoValue(null);
  };

  const fieldClassName =
    'w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring aria-readonly:opacity-70';

  return (
    <div className="flex flex-col gap-1">
      <div
        className="activity-glow rounded-md"
        {...(generating ? { 'data-activity-status': 'agent' } : {})}
      >
        {multiline ? (
          <textarea
            {...inputProps}
            rows={rows}
            value={value}
            placeholder={placeholder}
            // `readOnly`, not `disabled` — a disabled control receives no
            // keyboard events at all in a real browser, which would make
            // "Esc cancels" (the phase doc's own requirement) unreachable
            // the moment the field goes read-only.
            readOnly={generating}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && generating) cancel();
            }}
            className={fieldClassName}
          />
        ) : (
          <input
            {...inputProps}
            value={value}
            placeholder={placeholder}
            readOnly={generating}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && generating) cancel();
            }}
            className={fieldClassName}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <IconButton
          icon={LuWandSparkles}
          label={`Rewrite ${fieldName} with AI`}
          size="sm"
          busy={generating}
          onClick={run}
        />
        {undoValue !== null ? (
          <IconButton icon={LuRotateCcw} label="Undo the rewrite" size="sm" onClick={undo} />
        ) : null}
        {error ? (
          <span role="alert" className="text-[11px] text-destructive">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
