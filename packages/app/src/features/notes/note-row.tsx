import type { RepoDescriptor } from '@midnite/studio-shared';
import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LuGripVertical, LuLightbulb, LuTrash2, LuZap } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { useSortableRow } from '../../components/sortable-list';
import { Note, NoteStatus, useNotesStore } from '../../store/notes-store';
import { useSkillHandoff } from '../agent/use-skill-handoff';

/** Exported for `notes-view.tsx` (Phase 86 Theme G) — the page's own status badge stays the one row's colours. */
export const STATUS_CLASSES: Record<NoteStatus, string> = {
  captured: 'text-muted-foreground border-border bg-muted/20',
  planned: 'text-primary border-primary/40 bg-primary/10',
  implemented: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10',
};

/** Exported for `notes-view.tsx` (Phase 86 Theme G) — the same cycle the row's own status badge uses. */
export const NEXT_STATUS: Record<NoteStatus, NoteStatus> = {
  captured: 'planned',
  planned: 'implemented',
  implemented: 'captured',
};

export function NoteRow({
  note: initialNote,
  repo,
  onHandoff,
  selected = false,
  onSelect,
  variant = 'full',
}: {
  note: Note;
  repo?: RepoDescriptor;
  onHandoff?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  /** `full` = modal (in-place edit, unclamped). `card` = Notes page sidenav. */
  variant?: 'full' | 'card';
}) {
  const note = useNotesStore((s) => s.notes[initialNote.id] ?? initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogs = useDialogs();
  const handoff = useSkillHandoff();
  const drag = useSortableRow(note.id);
  const isCard = variant === 'card';

  useEffect(() => {
    setDraft(note.body);
  }, [note.body]);

  /*
    Layout effect, not effect: the textarea replaces a block of body text that
    is already the note's full height, and focusing it a paint later is what
    makes the swap visibly jump. `select()` puts the caret at the end of a
    full selection rather than at character 0 — a double-click means "rewrite
    this", and typing should replace it.
  */
  useLayoutEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  /*
    Fit the editor to its content, with no ceiling — the box that replaces the
    body opens at the body's own height and grows a line at a time as you type,
    so editing a ten-line note is never done through a porthole. Unlike the
    composer this one has no resize grip to fight, and the list it sits in
    scrolls, so there is nothing for a maximum to protect.

    `height = 'auto'` first is not redundant: `scrollHeight` on an element with
    an explicit height never reports less than that height, so without the
    reset the box could only ever grow. A layout effect for the same reason the
    focus above is one — a size set after paint is a size the user watches jump.
  */
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!editing || !textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft, editing]);

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

  const stopRowClick = (e: MouseEvent) => {
    if (isCard) e.stopPropagation();
  };

  const statusBadge = (
    <button
      type="button"
      data-testid="note-status-badge"
      aria-label={`Status: ${note.status}. Click to change.`}
      onClick={(e) => {
        stopRowClick(e);
        useNotesStore.getState().setStatus(note.id, NEXT_STATUS[note.status]);
      }}
      className={`rounded border py-0.5 font-medium tracking-wide transition-colors hover:opacity-80 ${
        isCard ? 'px-1.5 text-[10px]' : 'px-2 text-[11px]'
      } ${STATUS_CLASSES[note.status]}`}
    >
      {note.status}
    </button>
  );

  const actions = (
    <div className={`flex shrink-0 items-center ${isCard ? 'gap-0.5' : 'gap-1.5'}`}>
      <IconButton
        icon={LuLightbulb}
        label="Draft plan"
        size="sm"
        disabled={repoMissing}
        disabledReason={repoMissing ? 'Repository is no longer available' : undefined}
        onClick={(e) => {
          stopRowClick(e);
          handleDraftPlan();
        }}
      />

      <IconButton
        icon={LuZap}
        label="Adhoc task"
        size="sm"
        disabled={repoMissing}
        disabledReason={repoMissing ? 'Repository is no longer available' : undefined}
        onClick={(e) => {
          stopRowClick(e);
          handleAdhocTask();
        }}
      />

      <IconButton
        icon={LuTrash2}
        label="Delete note"
        tone="danger"
        size="sm"
        className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        onClick={(e) => {
          stopRowClick(e);
          handleDelete();
        }}
      />
    </div>
  );

  const dragHandle = (
    <button
      type="button"
      ref={drag.setActivatorNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      data-testid="note-drag-handle"
      aria-label="Reorder note"
      onClick={stopRowClick}
      className={`cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing ${
        isCard ? '' : 'mt-0.5'
      }`}
    >
      <LuGripVertical className={isCard ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </button>
  );

  const checkbox = (
    <input
      type="checkbox"
      aria-label="Mark note completed"
      checked={note.done}
      onChange={() => useNotesStore.getState().toggleDone(note.id)}
      onClick={stopRowClick}
      className={`rounded border-border text-primary focus:ring-primary/40 ${
        isCard ? 'h-3.5 w-3.5' : 'mt-1 h-4 w-4'
      }`}
    />
  );

  if (isCard) {
    return (
      <div
        ref={drag.setNodeRef}
        style={drag.style}
        data-testid={`note-row-${note.id}`}
        onClick={onSelect}
        className={`group relative flex h-[96px] flex-col justify-between rounded-lg border p-2.5 transition-colors cursor-pointer ${
          selected
            ? 'border-primary/50 bg-accent/40 ring-1 ring-primary/50'
            : 'border-border/60 bg-card/60 hover:bg-accent/30'
        } ${drag.isDragging ? 'opacity-80' : ''}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {dragHandle}
            {checkbox}
            {statusBadge}
          </div>
          {actions}
        </div>

        <div className="min-h-0 flex-1 pt-1.5">
          <div
            data-testid="note-body"
            className={`line-clamp-3 overflow-hidden text-xs leading-snug break-words text-ellipsis ${
              note.done ? 'line-through text-muted-foreground/70' : 'text-foreground'
            }`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {note.body}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={drag.setNodeRef}
      style={drag.style}
      data-testid={`note-row-${note.id}`}
      className={`group flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 p-3 transition-colors hover:bg-accent/30 ${
        drag.isDragging ? 'opacity-80' : ''
      }`}
    >
      {dragHandle}
      {checkbox}

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="gradient-border gradient-border--glow rounded-md">
            <textarea
              ref={textareaRef}
              data-testid="note-edit-input"
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="block w-full resize-none overflow-hidden rounded-md border-0 bg-background px-2 py-1 text-sm leading-snug outline-none"
            />
          </div>
        ) : (
          <div
            data-testid="note-body"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
            className={`cursor-text select-text whitespace-pre-wrap break-words text-sm leading-snug hover:text-foreground ${
              note.done ? 'line-through text-muted-foreground/70' : 'text-foreground'
            }`}
          >
            {note.body}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {statusBadge}
        {actions}
      </div>
    </div>
  );
}
