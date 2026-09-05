import { useEffect, useMemo, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LuFileText, LuFolderTree, LuRefreshCw } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { PageDetachMark } from '../../components/page-detach-mark';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { bridge } from '../../services/bridge';
import { keys, useRepos } from '../../services/queries';
import { useFileEditorStore } from '../../store/file-editor-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { FileTree, type FsScopeInput } from './file-tree';
import { FilePreview } from './preview/file-preview';
import { useFilesStore } from './files-store';
import { SearchBar, SearchResults } from './search-panel';
import { useFileSearch } from './use-file-search';

/**
 * The Files view: the active checkout as a lazy tree on the left, a
 * read-only preview of the selected file on the right. Follows the same
 * repo/worktree selection the graph uses — this is "browse what I have
 * checked out", not a second repo picker.
 *
 * The ROOT listing gets the house ladder — error → empty → skeleton → content
 * (`components/skeleton.tsx`) — and the deeper ones keep theirs inside
 * `DirectoryChildren`, which already answers per directory. The root is worth
 * separating because its failures are the ones that are about the whole view
 * rather than about one folder: a checkout that has been deleted or a worktree
 * that has moved leaves every row missing, and before Phase 60 Theme C that
 * rendered as an empty tree with nothing said.
 */
export function FilesView() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const { data: openRepos } = useRepos();
  const queryClient = useQueryClient();

  const expanded = useFilesStore((s) => s.expanded);
  const selectedPath = useFilesStore((s) => s.selectedPath);
  const toggleDir = useFilesStore((s) => s.toggleDir);
  const selectFile = useFilesStore((s) => s.selectFile);
  const revealFile = useFilesStore((s) => s.revealFile);
  const ensureScope = useFilesStore((s) => s.ensureScope);

  // The line a search result was opened at — cleared on an ordinary tree
  // click, so browsing away from a search hit never leaves a stale
  // highlight behind. Not in `files-store`: it is meaningless outside this
  // one open-and-scroll gesture, unlike `selectedPath`, which the store owns
  // because switching checkouts has to reset it.
  const [targetLine, setTargetLine] = useState<number | null>(null);

  const scope: FsScopeInput | null = useMemo(
    () =>
      selectedRepoId
        ? {
            scope: 'repo',
            repoId: selectedRepoId,
            ...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {}),
          }
        : null,
    [selectedRepoId, selectedWorktreePath],
  );

  const search = useFileSearch(
    selectedRepoId
      ? { repoId: selectedRepoId, ...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {}) }
      : null,
  );
  const searching = search.query.trim().length > 0;

  // Expansion and selection are per-checkout; switching repo or worktree
  // starts a clean browse instead of carrying stale relPaths across.
  const scopeKey = scope ? JSON.stringify(keys.fs(scope)) : null;
  useEffect(() => {
    if (scopeKey) {
      ensureScope(scopeKey);
      if (scope) {
        void bridge()
          ?.fs.listDir({ ...scope, relPath: '' })
          .then((res) => {
            if (!res.ok) return;
            const hasReadme = res.entries.some(
              (entry) => entry.kind === 'file' && entry.name.toLowerCase() === 'readme.md',
            );
            if (hasReadme) {
              const current = useFilesStore.getState();
              if (current.scopeKey === scopeKey && current.selectedPath === null) {
                const readmeEntry = res.entries.find(
                  (entry) => entry.kind === 'file' && entry.name.toLowerCase() === 'readme.md',
                );
                if (readmeEntry) {
                  current.selectFile(readmeEntry.name);
                }
              }
            }
          });
      }
    }
  }, [scopeKey, scope, ensureScope]);

  /*
    The root listing, read through the SAME query key `DirectoryChildren` uses
    for `relPath: ''` — so this is the one fetch that pane already makes, read
    a second time rather than made twice. It is here only to decide which of
    the four states the tree column shows; the rows themselves still come from
    `FileTree`.
  */
  const root = useQuery({
    queryKey: [...(scope ? keys.fs(scope) : ['fs', 'none']), 'dir', ''],
    queryFn: async () => bridge()!.fs.listDir({ ...scope!, relPath: '' }),
    enabled: scope !== null && bridge() !== null,
  });

  const tree = useResizable({
    size: layout.filesTreeWidth,
    onSize: (value) => setLayout('filesTreeWidth', value),
    initial: DEFAULT_LAYOUT.filesTreeWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.filesTreeWidth,
  });

  if (!scope) {
    return (
      <EmptyState
        icon={LuFolderTree}
        title="No repository selected"
        body="Select a repository on the left to browse its files."
      />
    );
  }

  const repoName = openRepos?.find((repo) => repo.id === selectedRepoId)?.name ?? 'repository';

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`flex shrink-0 flex-col ${tree.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}`}
        style={{ width: tree.current }}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <PageDetachMark role="files" />
          <span className="truncate text-xs font-semibold tracking-tight">{repoName}</span>
          <span className="ml-auto">
            <IconButton
              icon={LuRefreshCw}
              label="Refresh file tree"
              size="sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: keys.fs(scope) })}
            />
          </span>
        </div>
        <SearchBar
          query={search.query}
          setQuery={search.setQuery}
          options={search.options}
          setOptions={search.setOptions}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {/*
            Error → empty → skeleton → content, in that order, and only when
            the pane is showing the TREE: a search has its own three states
            inside `SearchResults`, over a different question.
          */}
          {searching ? (
            <SearchResults
              state={search.state}
              query={search.query.trim()}
              options={search.options}
              onOpenResult={(path, line) =>
                useFileEditorStore.getState().guardNavigation(() => {
                  selectFile(path);
                  setTargetLine(line);
                })
              }
            />
          ) : root.isError || (root.data && !root.data.ok) ? (
            <EmptyState
              icon={LuFolderTree}
              title="Could not read this checkout"
              body={
                root.data && !root.data.ok
                  ? root.data.message
                  : root.error instanceof Error
                    ? root.error.message
                    : String(root.error)
              }
            />
          ) : root.isPending ? (
            <FileTreeSkeleton />
          ) : root.data.entries.length === 0 ? (
            <EmptyState
              icon={LuFolderTree}
              title="Nothing here"
              body="This checkout has no files at its root."
            />
          ) : (
            <FileTree
              scope={scope}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggleDir={toggleDir}
              onSelectFile={(path) =>
                useFileEditorStore.getState().guardNavigation(() => {
                  selectFile(path);
                  setTargetLine(null);
                })
              }
              writable
            />
          )}
        </div>
      </div>

      <ResizeHandle resizable={tree} axis="x" label="Resize file tree" />

      {selectedPath ? (
        <FilePreview
          key={`${scopeKey}:${selectedPath}`}
          scope={scope}
          relPath={selectedPath}
          targetLine={targetLine ?? undefined}
          onNavigate={(relPath) =>
            useFileEditorStore.getState().guardNavigation(() => {
              revealFile(relPath);
              setTargetLine(null);
            })
          }
        />
      ) : (
        <div className="flex min-w-0 flex-1">
          <EmptyState
            icon={LuFileText}
            title="No file selected"
            body="Pick one in the tree to preview it."
            bodySize="xs"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The file tree, at rest — indented rows of varying width, which is the shape
 * a directory listing paints. The indents alternate so it reads as a tree
 * rather than a list; the count fills the pane and claims nothing about how
 * many files this checkout has (`components/skeleton.tsx`).
 */
const TREE_SKELETON_ROWS: readonly { width: string; indent: number }[] = [
  { width: '62%', indent: 0 },
  { width: '48%', indent: 1 },
  { width: '56%', indent: 1 },
  { width: '40%', indent: 2 },
  { width: '68%', indent: 0 },
  { width: '52%', indent: 1 },
  { width: '44%', indent: 1 },
  { width: '58%', indent: 0 },
];

function FileTreeSkeleton() {
  return (
    <LoadingRegion label="Reading this checkout…" className="flex flex-col gap-2 p-2">
      {TREE_SKELETON_ROWS.map((row, index) => (
        <Skeleton
          key={index}
          className="h-3"
          style={{ width: row.width, marginLeft: row.indent * 12 }}
        />
      ))}
    </LoadingRegion>
  );
}
