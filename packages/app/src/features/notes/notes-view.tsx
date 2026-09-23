import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  LuCode,
  LuEllipsisVertical,
  LuEye,
  LuLightbulb,
  LuNotebookPen,
  LuTrash2,
  LuZap,
} from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { SortableList } from '../../components/sortable-list';
import { useDialogs } from '../../components/dialog-host';
import { useRepos } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { notesForRepo, useNotesStore, type Note } from '../../store/notes-store';
import { useSkillHandoff } from '../agent/use-skill-handoff';
import { MarkdownPreview } from '../files/preview/markdown-preview';
import { NoteRow, NEXT_STATUS, STATUS_CLASSES } from './note-row';
import { spliceVisibleOrder } from './notes-reorder';

/**
 * Monaco — lazy-loaded so this third Monaco surface (after file-preview and
 * the diff pane) adds no weight to the initial bundle. Phase 77 shrinks all
 * three at once; the lazy boundary here is what makes that possible without
 * touching every call site.
 */
const CodeEditor = lazy(() =>
  import('../files/preview/code-editor').then((m) => ({ default: m.CodeEditor })),
);

/** Composer line-height arithmetic, matching notes-modal.tsx. */
const COMPOSER_LINE_HEIGHT = 20;
const COMPOSER_PADDING = 20;
const COMPOSER_MIN_HEIGHT = 4 * COMPOSER_LINE_HEIGHT + COMPOSER_PADDING;
const COMPOSER_MAX_HEIGHT = 10 * COMPOSER_LINE_HEIGHT + COMPOSER_PADDING;

/**
 * The Notes rail view — Phase 86 Theme G.
 *
 * Two panes: a resizable sidenav on the left (the sortable note list + quick
 * composer) and a content pane on the right (Monaco editor or markdown preview,
 * plus action buttons). The split is remembered across renders via `notesListWidth`
 * in `ui-store`.
 *
 * `global: true` in `view-registry.tsx` — the rail item is pinned directly
 * under Dashboard and therefore renders with no repo open. In that state the
 * whole view shows a single empty-state rather than two half-empty panes.
 */
export function NotesView() {
  // ── hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    void useNotesStore.getState().hydrate();
  }, []);

  // ── layout ─────────────────────────────────────────────────────────────────
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const list = useResizable({
    size: layout.notesListWidth,
    onSize: (value) => setLayout('notesListWidth', value),
    initial: DEFAULT_LAYOUT.notesListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.notesListWidth,
  });

  // ── repo / notes state ─────────────────────────────────────────────────────
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

  // ── sidenav local state ────────────────────────────────────────────────────
  const [composerText, setComposerText] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dialogs = useDialogs();

  // ── content pane local state ───────────────────────────────────────────────
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  /**
   * If the selected note disappears (deleted, repo switch) clear the selection
   * so the content pane falls through to its empty state rather than showing
   * a ghost.
   */
  useEffect(() => {
    if (selectedNoteId && !allNotesRecord[selectedNoteId]) {
      setSelectedNoteId(null);
    }
  }, [allNotesRecord, selectedNoteId]);

  /** Clear selection on repo change. */
  useEffect(() => {
    setSelectedNoteId(null);
  }, [selectedRepoId]);

  const selectedNote: Note | null = selectedNoteId ? (allNotesRecord[selectedNoteId] ?? null) : null;

  const handoff = useSkillHandoff();

  // ── derived ────────────────────────────────────────────────────────────────
  const doneCount = repoNotes.filter((n) => n.done).length;
  const totalCount = repoNotes.length;
  const visibleNotes = hideCompleted ? repoNotes.filter((n) => !n.done) : repoNotes;

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = composerText.trim();
      if (trimmed.length > 0 && selectedRepoId) {
        const note = useNotesStore.getState().addNote(selectedRepoId, trimmed);
        setComposerText('');
        setSelectedNoteId(note.id);
        setShowPreview(false);
      }
    }
  };

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

  // Content-pane action handlers — only callable when selectedNote is non-null
  const handleBrainstorm = useCallback(() => {
    if (!selectedNote || !activeRepo) return;
    handoff({ skillId: 'brainstorm', repo: activeRepo, body: selectedNote.body });
    useNotesStore.getState().setStatus(selectedNote.id, 'planned');
  }, [selectedNote, activeRepo, handoff]);

  const handleExecAdhoc = useCallback(() => {
    if (!selectedNote || !activeRepo) return;
    handoff({ skillId: 'execAdhoc', repo: activeRepo, body: selectedNote.body });
    useNotesStore.getState().setStatus(selectedNote.id, 'planned');
  }, [selectedNote, activeRepo, handoff]);

  const handleCycleStatus = useCallback(() => {
    if (!selectedNote) return;
    useNotesStore.getState().setStatus(selectedNote.id, NEXT_STATUS[selectedNote.status]);
  }, [selectedNote]);

  const handleDelete = useCallback(() => {
    if (!selectedNote) return;
    dialogs.confirm({
      title: 'Delete note',
      body: 'Delete this note permanently?',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        useNotesStore.getState().removeNote(selectedNote.id);
      },
    });
  }, [dialogs, selectedNote]);

  /**
   * Monaco onChange — controlled, autosaves every keystroke into the store
   * (which debounces the IPC write internally via `bridge().notes.save`).
   * No separate Save button needed.
   */
  const handleEditorChange = useCallback(
    (value: string) => {
      if (!selectedNote) return;
      useNotesStore.getState().setBody(selectedNote.id, value);
    },
    [selectedNote],
  );

  // ── no-repo-open guard ─────────────────────────────────────────────────────
  if (!selectedRepoId) {
    return (
      <EmptyState
        icon={LuNotebookPen}
        title="No repository open"
        body="Open a repository to see its notes here, or capture one from anywhere with Mod+L then N."
      />
    );
  }

  // ── full two-pane layout ───────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      {/* ── Sidenav ─────────────────────────────────────────────────────────── */}
      <div
        style={{ width: list.current }}
        className="flex min-h-0 min-w-0 shrink-0 flex-col border-r border-border"
      >
        {/* Sidenav header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Notes</span>
            {selectedRepoId && (
              <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                {doneCount}/{totalCount} done
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {selectedRepoId && (
              <button
                type="button"
                data-testid="toggle-hide-completed"
                onClick={() => setHideCompleted((h) => !h)}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-b border-border/50 p-3">
          <div className="gradient-border gradient-border--glow rounded-md">
            <textarea
              ref={composerRef}
              data-testid="notes-composer"
              value={composerText}
              placeholder="Capture a thought… (Enter to save)"
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              style={{ minHeight: COMPOSER_MIN_HEIGHT, maxHeight: COMPOSER_MAX_HEIGHT }}
              className="block w-full resize-y overflow-y-auto rounded-md border-0 bg-background p-2 text-sm leading-5 outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* Note list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {repoNotes.length === 0 ? (
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
            <div className="space-y-2 p-3">
              <SortableList ids={visibleNotes.map((note) => note.id)} onReorder={handleReorder}>
                {visibleNotes.map((note) => (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`note-list-item-${note.id}`}
                    onClick={() => setSelectedNoteId(note.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedNoteId(note.id);
                      }
                    }}
                    aria-pressed={selectedNoteId === note.id}
                    className="cursor-pointer outline-none"
                  >
                    <NoteRow
                      note={note}
                      repo={activeRepo}
                      variant="card"
                      selected={selectedNoteId === note.id}
                      onSelect={() => setSelectedNoteId(note.id)}
                    />
                  </div>
                ))}
              </SortableList>
            </div>
          )}
        </div>
      </div>

      {/* ── Resize handle ───────────────────────────────────────────────────── */}
      <ResizeHandle resizable={list} axis="x" label="Resize the notes list" />

      {/* ── Content pane ────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selectedNote === null ? (
          <EmptyState
            icon={LuNotebookPen}
            title="Select a note to edit it"
            body="Pick a note from the list on the left to open it here."
          />
        ) : (
          <>
            {/* Content pane header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
              {/* Status badge — cycles on click */}
              <button
                type="button"
                data-testid="content-status-badge"
                aria-label={`Status: ${selectedNote.status}. Click to change.`}
                onClick={handleCycleStatus}
                className={`rounded border px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors hover:opacity-80 ${
                  STATUS_CLASSES[selectedNote.status]
                }`}
              >
                {selectedNote.status}
              </button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Preview toggle */}
              <IconButton
                icon={showPreview ? LuCode : LuEye}
                label={showPreview ? 'Show editor' : 'Show preview'}
                size="sm"
                onClick={() => setShowPreview((p) => !p)}
              />

              {/* Ideate */}
              <IconButton
                icon={LuLightbulb}
                label="Draft plan"
                size="sm"
                disabled={!activeRepo}
                disabledReason={!activeRepo ? 'No repository open' : undefined}
                onClick={handleBrainstorm}
              />

              {/* Execute adhoc */}
              <IconButton
                icon={LuZap}
                label="Adhoc task"
                size="sm"
                disabled={!activeRepo}
                disabledReason={!activeRepo ? 'No repository open' : undefined}
                onClick={handleExecAdhoc}
              />

              {/* Delete */}
              <IconButton
                icon={LuTrash2}
                label="Delete note"
                tone="danger"
                size="sm"
                onClick={handleDelete}
              />
            </div>

            {/*
              Editor or preview.

              `flex flex-col`, not a bare block: `CodeEditor`'s own root is
              `min-h-0 flex-1` and Monaco inside it is `height="100%"`, so the
              editor only gets a height if its parent is a flex column that
              hands it one. As a block parent this box is auto-height, `flex-1`
              on the child is inert, and Monaco resolves 100% of nothing —
              which is how the pane rendered as an ~8px sliver.
            */}
            <div data-testid="notes-content-pane" className="flex min-h-0 flex-1 flex-col">
              {showPreview ? (
                <MarkdownPreview content={selectedNote.body} />
              ) : (
                /*
                  `key={selectedNote.id}` force-remounts CodeEditor each time
                  the selection changes, giving Monaco a fresh model rather than
                  reusing a stale one across notes — the same guarantee
                  file-preview.tsx gives per file via `key={editorKey}`.

                  `Suspense` here rather than at a higher boundary: the Monaco
                  chunk should load behind only this pane, not behind the entire
                  Notes view, so the sidenav stays usable while the editor
                  initialises.
                */
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Loading editor…
                    </div>
                  }
                >
                  <CodeEditor
                    key={selectedNote.id}
                    fileName={`${selectedNote.id}.md`}
                    value={selectedNote.body}
                    onChange={handleEditorChange}
                    autoFocus
                  />
                </Suspense>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
