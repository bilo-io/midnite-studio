import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { LuEllipsisVertical, LuNotebookPen, LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { Modal } from '../../components/modal';
import { SortableList } from '../../components/sortable-list';
import { notesForRepo, useNotesStore } from '../../store/notes-store';
import { useUiStore } from '../../store/ui-store';
import { useRepos } from '../../services/queries';
import { NoteRow } from './note-row';
import { spliceVisibleOrder } from './notes-reorder';

/**
 * The composer's resize range, in lines of its own `leading-5` (20px) text.
 *
 * Four by default rather than two: a note is a sentence or three, and a
 * two-row box asks you to write inside a slot. Ten as the ceiling, and a
 * `resize-y` grip in between — deliberately manual rather than auto-growing,
 * because the two fight: an auto-grow effect writes `style.height` on every
 * keystroke and would stamp straight over a height the user had just dragged.
 * The row editor, which nobody resizes by hand, is the surface that auto-grows
 * (see `note-row.tsx`).
 */
const COMPOSER_LINE_HEIGHT = 20;
const COMPOSER_PADDING = 20; /* `p-2.5`, top + bottom */
const COMPOSER_MIN_HEIGHT = 4 * COMPOSER_LINE_HEIGHT + COMPOSER_PADDING;
const COMPOSER_MAX_HEIGHT = 10 * COMPOSER_LINE_HEIGHT + COMPOSER_PADDING;

export function NotesModal() {
  const open = useUiStore((s) => s.notesOpen);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const reposQuery = useRepos();
  const repos = reposQuery.data ?? [];
  const activeRepo = repos.find((r) => r.id === selectedRepoId);

  const allNotesRecord = useNotesStore((s) => s.notes);
  const allNotes = useMemo(() => Object.values(allNotesRecord), [allNotesRecord]);
  const repoNotes = useMemo(
    () => (selectedRepoId ? notesForRepo(allNotes, selectedRepoId) : []),
    [allNotes, selectedRepoId],
  );

  const [composerText, setComposerText] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dialogs = useDialogs();

  const onClose = () => useUiStore.getState().setNotesOpen(false);

  const doneCount = repoNotes.filter((n) => n.done).length;
  const totalCount = repoNotes.length;

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = composerText.trim();
      if (trimmed.length > 0 && selectedRepoId) {
        useNotesStore.getState().addNote(selectedRepoId, trimmed);
        setComposerText('');
      }
    }
  };

  const handlePruneOverflow = (event: React.MouseEvent<HTMLButtonElement>) => {
    const validRepoIds = repos.map((r) => r.id);
    const staleNotes = allNotes.filter((n) => !validRepoIds.includes(n.repoId));
    const staleCount = staleNotes.length;

    dialogs.openMenu(
      { clientX: event.clientX, clientY: event.clientY },
      [
        {
          label: 'Remove notes for removed repositories',
          description:
            staleCount > 0
              ? `${staleCount} orphaned note${staleCount === 1 ? '' : 's'}`
              : 'No orphaned notes found',
          disabled: staleCount === 0,
          onSelect: () => {
            dialogs.confirm({
              title: 'Remove notes for removed repositories',
              body: `Remove ${staleCount} note${
                staleCount === 1 ? '' : 's'
              } belonging to repositories no longer present in your workspace?`,
              confirmLabel: 'Remove notes',
              danger: true,
              onConfirm: () => {
                useNotesStore.getState().pruneMissingRepos(validRepoIds);
              },
            });
          },
        },
      ],
    );
  };

  const visibleNotes = hideCompleted ? repoNotes.filter((n) => !n.done) : repoNotes;

  const handleReorder = (nextVisibleIds: string[]) => {
    if (!selectedRepoId) return;
    useNotesStore
      .getState()
      .reorderNotes(
        selectedRepoId,
        spliceVisibleOrder(
          repoNotes.map((n) => n.id),
          visibleNotes.map((n) => n.id),
          nextVisibleIds,
        ),
      );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={activeRepo ? `Notes for ${activeRepo.name}` : 'Notes'}
      size="lg"
      variant="gradient"
      align="center"
      testId="notes-modal"
      initialFocusRef={composerRef}
    >
      <div className="flex h-[80vh] flex-col">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              {activeRepo ? activeRepo.name : 'Notes'}
            </h2>
            {selectedRepoId && (
              <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                {doneCount}/{totalCount} done
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedRepoId && (
              <button
                type="button"
                data-testid="toggle-hide-completed"
                onClick={() => setHideCompleted(!hideCompleted)}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {hideCompleted ? 'Show completed' : 'Hide completed'}
              </button>
            )}

            <IconButton
              icon={LuEllipsisVertical}
              label="Notes actions"
              size="sm"
              onClick={handlePruneOverflow}
            />

            <IconButton icon={LuX} label="Close notes" size="sm" onClick={onClose} />
          </div>
        </div>

        {/* Composer */}
        {selectedRepoId ? (
          <div className="shrink-0 border-b border-border/50 p-4">
            <div className="gradient-border gradient-border--glow rounded-md">
              <textarea
                ref={composerRef}
                data-testid="notes-composer"
                value={composerText}
                placeholder="Write a thought to capture... (Enter to save, Shift+Enter for newline)"
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                style={{ minHeight: COMPOSER_MIN_HEIGHT, maxHeight: COMPOSER_MAX_HEIGHT }}
                /*
                  `block`: a textarea is inline-block, so the `gradient-border`
                  wrapper would size to the line box rather than the control
                  and leave a descender gap under it — the same trap the commit
                  box documents in `status-panel.tsx`.

                  `resize-y`, and the height bounds in `style` rather than
                  Tailwind classes so the line arithmetic above stays readable
                  as arithmetic. A drag past either end is clamped by the
                  browser, so the grip can never produce a one-line slit or a
                  composer that has eaten the list.
                */
                className="block w-full resize-y overflow-y-auto rounded-md border-0 bg-background p-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
        ) : null}

        {/* List Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!selectedRepoId ? (
            <EmptyState
              icon={LuNotebookPen}
              title="Notes are per-repository"
              body="Open or select a repository in the sidebar to view and capture notes."
            />
          ) : repoNotes.length === 0 ? (
            <EmptyState
              icon={LuNotebookPen}
              title="Nothing captured yet"
              body="Write the thought you'd otherwise lose."
            />
          ) : visibleNotes.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
              All completed notes are hidden.
            </div>
          ) : (
            <div className="space-y-2 p-4">
              <SortableList ids={visibleNotes.map((note) => note.id)} onReorder={handleReorder}>
                {visibleNotes.map((note) => (
                  <NoteRow key={note.id} note={note} repo={activeRepo} onHandoff={onClose} />
                ))}
              </SortableList>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
