import type { RepoDescriptor } from '@midnite/studio-shared';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { LuLightbulb, LuTrash2, LuZap } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { Note, NoteStatus, useNotesStore } from '../../store/notes-store';
import { useSkillHandoff } from '../agent/use-skill-handoff';

const STATUS_CLASSES: Record<NoteStatus, string> = {
  captured: 'text-muted-foreground border-border bg-muted/20',
  planned: 'text-primary border-primary/40 bg-primary/10',
  implemented: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10',
};

const NEXT_STATUS: Record<NoteStatus, NoteStatus> = {
  captured: 'planned',
  planned: 'implemented',
  implemented: 'captured',
};

export function NoteRow({
  note: initialNote,
  repo,
  onHandoff,
}: {
  note: Note;
  repo?: RepoDescriptor;
  onHandoff?: () => void;
}) {
  const note = useNotesStore((s) => s.notes[initialNote.id] ?? initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogs = useDialogs();
  const handoff = useSkillHandoff();

  useEffect(() => {
    setDraft(note.body);
  }, [note.body]);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      if (trimmed !== note.body) {
        useNotesStore.getState().setBody(note.id, trimmed);
      }
    } else {
      // Empty input cancels rather than deletes
      setDraft(note.body);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(note.body);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEdit();
    }
  };

  const handleDraftPlan = () => {
    if (!repo) return;
    handoff({ skillId: 'brainstorm', repo, body: note.body });
    useNotesStore.getState().setStatus(note.id, 'planned');
    onHandoff?.();
  };

  const handleAdhocTask = () => {
    if (!repo) return;
    handoff({ skillId: 'execAdhoc', repo, body: note.body });
    useNotesStore.getState().setStatus(note.id, 'planned');
    onHandoff?.();
  };

  const handleDelete = () => {
    dialogs.confirm({
      title: 'Delete note',
      body: 'Delete this note permanently?',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => useNotesStore.getState().removeNote(note.id),
    });
  };

  const repoMissing = !repo;

  return (
    <div
      data-testid={`note-row-${note.id}`}
      className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card/60 p-3 transition-colors hover:bg-accent/30"
    >
      <input
        type="checkbox"
        aria-label="Mark note completed"
        checked={note.done}
        onChange={() => useNotesStore.getState().toggleDone(note.id)}
        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            ref={textareaRef}
            data-testid="note-edit-input"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <div
            data-testid="note-body"
            onClick={() => setEditing(true)}
            className={`cursor-text select-text whitespace-pre-wrap text-sm leading-snug line-clamp-3 hover:text-foreground ${
              note.done ? 'line-through text-muted-foreground/70' : 'text-foreground'
            }`}
          >
            {note.body}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          data-testid="note-status-badge"
          aria-label={`Status: ${note.status}. Click to change.`}
          onClick={() => useNotesStore.getState().setStatus(note.id, NEXT_STATUS[note.status])}
          className={`rounded border px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors hover:opacity-80 ${
            STATUS_CLASSES[note.status]
          }`}
        >
          {note.status}
        </button>

        <IconButton
          icon={LuLightbulb}
          label="Draft plan"
          size="sm"
          disabled={repoMissing}
          disabledReason={repoMissing ? 'Repository is no longer available' : undefined}
          onClick={handleDraftPlan}
        />

        <IconButton
          icon={LuZap}
          label="Adhoc task"
          size="sm"
          disabled={repoMissing}
          disabledReason={repoMissing ? 'Repository is no longer available' : undefined}
          onClick={handleAdhocTask}
        />

        <IconButton
          icon={LuTrash2}
          label="Delete note"
          tone="danger"
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          onClick={handleDelete}
        />
      </div>
    </div>
  );
}
