import type { RepoDescriptor } from '@midnite/studio-shared';
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
}: {
  note: Note;
  repo?: RepoDescriptor;
  onHandoff?: () => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const note = useNotesStore((s) => s.notes[initialNote.id] ?? initialNote);
  const dialogs = useDialogs();
  const handoff = useSkillHandoff();
  const drag = useSortableRow(note.id);

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
      {/* Header: drag handle, checkbox, status badge on left; action buttons on right */}
      <div className="flex shrink-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            ref={drag.setActivatorNodeRef}
            {...drag.attributes}
            {...drag.listeners}
            data-testid="note-drag-handle"
            aria-label="Reorder note"
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
          >
            <LuGripVertical className="h-3.5 w-3.5" />
          </button>

          <input
            type="checkbox"
            aria-label="Mark note completed"
            checked={note.done}
            onChange={() => useNotesStore.getState().toggleDone(note.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/40"
          />

          <button
            type="button"
            data-testid="note-status-badge"
            aria-label={`Status: ${note.status}. Click to change.`}
            onClick={(e) => {
              e.stopPropagation();
              useNotesStore.getState().setStatus(note.id, NEXT_STATUS[note.status]);
            }}
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors hover:opacity-80 ${
              STATUS_CLASSES[note.status]
            }`}
          >
            {note.status}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            icon={LuLightbulb}
            label="Draft plan"
            size="sm"
            disabled={repoMissing}
            disabledReason={repoMissing ? 'Repository is no longer available' : undefined}
            onClick={(e) => {
              e.stopPropagation();
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
              e.stopPropagation();
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
              e.stopPropagation();
              handleDelete();
            }}
          />
        </div>
      </div>

      {/* Note body preview: clamped to at most 3 lines of text with ellipsis */}
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
