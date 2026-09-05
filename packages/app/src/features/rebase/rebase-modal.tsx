import React, { useRef, useState } from 'react';
import { RebaseAction, RebaseEntry, RebaseSequencePlan } from '@midnite/studio-shared';
import { LuMoveUp, LuMoveDown, LuTrash2, LuPlay, LuRotateCcw, LuPencil, LuTerminal } from 'react-icons/lu';

import { useFocusTrap } from '../../components/use-focus-trap';

export type RebaseModalProps = {
  isOpen: boolean;
  targetRef: string;
  initialCommits: Array<{ sha: string; subject: string }>;
  onClose: () => void;
  onConfirm: (plan: RebaseSequencePlan) => Promise<void>;
};

const ACTION_OPTIONS: Array<{ value: RebaseAction; label: string; desc: string }> = [
  { value: 'pick', label: 'pick', desc: 'Use commit' },
  { value: 'reword', label: 'reword', desc: 'Use commit, edit commit message' },
  { value: 'edit', label: 'edit', desc: 'Use commit, stop for amending' },
  { value: 'squash', label: 'squash', desc: 'Meld into previous commit' },
  { value: 'fixup', label: 'fixup', desc: 'Meld into previous commit, discard message' },
  { value: 'drop', label: 'drop', desc: 'Remove commit' },
  { value: 'exec', label: 'exec', desc: 'Run shell command' },
  { value: 'break', label: 'break', desc: 'Stop rebase here' },
];

export const RebaseModal: React.FC<RebaseModalProps> = ({
  isOpen,
  targetRef,
  initialCommits,
  onClose,
  onConfirm,
}) => {
  const [entries, setEntries] = useState<RebaseEntry[]>(() =>
    initialCommits.map((c) => ({
      id: c.sha,
      action: 'pick',
      sha: c.sha,
      subject: c.subject,
    })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /*
    A bottom sheet over a destructive, history-rewriting operation that until
    Phase 68 Theme D declared no `role`, no accessible name and no focus
    management — so a screen reader never announced that a dialog had opened and
    Tab walked straight out of it into the graph it was about to rewrite.

    The sheet has no separate backdrop to hang the role on, so the one element
    is both the dialog and the trap container; `tabIndex={-1}` is what lets the
    trap park focus on it when nothing inside can take it.

    Called before the early return, because a hook cannot be conditional.
  */
  useFocusTrap(containerRef, isOpen);

  if (!isOpen) return null;

  const handleActionChange = (id: string, action: RebaseAction) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, action } : item)),
    );
  };

  const handleSubjectChange = (id: string, subject: string) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, subject } : item)),
    );
  };

  const handleExecChange = (id: string, execCommand: string) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, execCommand } : item)),
    );
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= entries.length) return;
    const next = [...entries];
    const moved = next[index];
    if (!moved) return;
    next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setEntries(next);
  };

  const removeItem = (id: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const addExecStep = () => {
    const newId = `exec-${Date.now()}`;
    setEntries((prev) => [
      ...prev,
      { id: newId, action: 'exec', execCommand: 'pnpm test' },
    ]);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({ targetRef, entries });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Interactive rebase onto ${targetRef}`}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background/95 backdrop-blur border-t border-border shadow-2xl max-h-[60vh] transition-transform animate-in slide-in-from-bottom duration-150"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <LuRotateCcw className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Interactive Rebase onto <span className="font-mono text-primary">{targetRef}</span>
          </h2>
          <span className="text-xs text-muted-foreground">({entries.length} steps)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addExecStep}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-muted text-foreground transition-colors"
          >
            <LuTerminal className="w-3.5 h-3.5" />
            Add exec step
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-muted text-muted-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || entries.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <LuPlay className="w-3.5 h-3.5" />
            {isSubmitting ? 'Starting Rebase...' : 'Execute Rebase'}
          </button>
        </div>
      </div>

      {/* Sequence List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
        {entries.map((entry, idx) => (
          <div
            key={entry.id}
            className={`flex items-center gap-2 p-2 rounded border bg-card transition-colors ${
              entry.action === 'drop' ? 'opacity-50 line-through bg-destructive/10' : ''
            }`}
          >
            {/* Reorder controls */}
            <div className="flex flex-col gap-0.5 text-muted-foreground">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => moveItem(idx, 'up')}
                className="hover:text-foreground disabled:opacity-30"
              >
                <LuMoveUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === entries.length - 1}
                onClick={() => moveItem(idx, 'down')}
                className="hover:text-foreground disabled:opacity-30"
              >
                <LuMoveDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action selector */}
            <select
              value={entry.action}
              onChange={(e) => handleActionChange(entry.id, e.target.value as RebaseAction)}
              className="bg-background border border-border rounded px-2 py-1 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>

            {/* Commit SHA or badge */}
            {entry.sha ? (
              <span className="text-primary font-semibold text-xs px-1.5 py-0.5 rounded bg-primary/10">
                {entry.sha.slice(0, 7)}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs px-1.5 py-0.5 rounded bg-muted">
                {entry.action}
              </span>
            )}

            {/* Editable Subject / Exec Command */}
            <div className="flex-1">
              {entry.action === 'reword' ? (
                <div className="flex items-center gap-1.5">
                  <LuPencil className="w-3.5 h-3.5 text-amber-500" />
                  <input
                    type="text"
                    value={entry.subject || ''}
                    onChange={(e) => handleSubjectChange(entry.id, e.target.value)}
                    className="w-full bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="New commit message..."
                  />
                </div>
              ) : entry.action === 'exec' ? (
                <div className="flex items-center gap-1.5">
                  <LuTerminal className="w-3.5 h-3.5 text-blue-500" />
                  <input
                    type="text"
                    value={entry.execCommand || ''}
                    onChange={(e) => handleExecChange(entry.id, e.target.value)}
                    className="w-full bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    placeholder="Command to run..."
                  />
                </div>
              ) : (
                <span className="text-foreground truncate block">{entry.subject}</span>
              )}
            </div>

            {/* Delete step */}
            <button
              type="button"
              onClick={() => removeItem(entry.id)}
              className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
              title="Remove step"
            >
              <LuTrash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
