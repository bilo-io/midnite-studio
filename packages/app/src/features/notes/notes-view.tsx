import { useMemo } from 'react';
import { LuNotebookPen } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { useRepos } from '../../services/queries';
import { notesForRepo, useNotesStore } from '../../store/notes-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Notes' own rail view — Phase 86 Theme E scaffolding only.
 *
 * This is deliberately a **placeholder**: a read-only echo of the same
 * per-repo list `NotesModal` already edits, just enough to give the new
 * `'notes'` `ViewId`, rail row and `VIEW_COMPONENT` entry something real to
 * render. Theme G replaces this body with the two-pane Monaco + markdown
 * page; until then, capturing and editing a note still goes through the
 * modal (`Mod+L` then `N`, or the quick-access menu) — this view reads
 * `notesForRepo`/`useNotesStore` straight, with no local store, no schema
 * move and no edit affordance, so a note added in the modal shows up here
 * without a reload, and nothing about the modal's own behaviour changes.
 *
 * `global: true` (`view-registry.tsx`): the row is pinned directly under
 * Dashboard, which renders with no repo open, so this view has to say
 * something coherent in that state too rather than falling through to
 * `EmptyWorkspace` the way a repo-scoped view would.
 */
export function NotesView() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const reposQuery = useRepos();
  const activeRepo = reposQuery.data?.find((repo) => repo.id === selectedRepoId);

  const allNotesRecord = useNotesStore((s) => s.notes);
  const repoNotes = useMemo(() => {
    if (!selectedRepoId) return [];
    return notesForRepo(Object.values(allNotesRecord), selectedRepoId);
  }, [allNotesRecord, selectedRepoId]);

  if (!selectedRepoId) {
    return (
      <EmptyState
        icon={LuNotebookPen}
        title="No repository open"
        body="Open a repository to see its notes here, or capture one from anywhere with Mod+L then N."
      />
    );
  }

  return (
    <section aria-label="Notes" className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="flex shrink-0 items-center justify-between pb-3">
        <h1 className="text-sm font-semibold text-foreground">
          Notes{activeRepo ? ` for ${activeRepo.name}` : ''}
        </h1>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {repoNotes.length} note{repoNotes.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="shrink-0 pb-3 text-xs text-muted-foreground">
        A read-only preview of this repository&apos;s notes — Phase 86 Theme G
        replaces this with a full two-pane editor. For now, add or edit notes
        from the quick-access menu (<span className="font-medium text-foreground">Mod+L</span>,
        then <span className="font-medium text-foreground">N</span>).
      </p>
      {repoNotes.length === 0 ? (
        <EmptyState
          icon={LuNotebookPen}
          title="No notes yet"
          body="Capture one from the quick-access menu (Mod+L, then N)."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {repoNotes.map((note) => (
            <li
              key={note.id}
              className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm text-foreground"
            >
              <p className="whitespace-pre-wrap">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.status}
                {note.done ? ' · done' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
