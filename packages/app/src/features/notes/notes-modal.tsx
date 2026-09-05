import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { LuEllipsisVertical, LuNotebookPen, LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { Modal } from '../../components/modal';
import { notesForRepo, useNotesStore } from '../../store/notes-store';
import { useUiStore } from '../../store/ui-store';
import { useRepos } from '../../services/queries';
import { NoteRow } from './note-row';

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
            <textarea
              ref={composerRef}
              data-testid="notes-composer"
              rows={2}
              value={composerText}
              placeholder="Write a thought to capture... (Enter to save, Shift+Enter for newline)"
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              className="w-full resize-none rounded-md border border-input bg-background/80 p-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
            />
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
              {visibleNotes.map((note) => (
                <NoteRow key={note.id} note={note} repo={activeRepo} onHandoff={onClose} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
