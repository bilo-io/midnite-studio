import { useEffect, useMemo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { LuFolderTree, LuRefreshCw } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useRepos } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { FileTree, fsScopeKey, type FsScopeInput } from './file-tree';
import { FilePreview } from './preview/file-preview';
import { useFilesStore } from './files-store';

/**
 * The Files view: the active checkout as a lazy tree on the left, a
 * read-only preview of the selected file on the right. Follows the same
 * repo/worktree selection the graph uses — this is "browse what I have
 * checked out", not a second repo picker.
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
  const ensureScope = useFilesStore((s) => s.ensureScope);

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

  // Expansion and selection are per-checkout; switching repo or worktree
  // starts a clean browse instead of carrying stale relPaths across.
  const scopeKey = scope ? JSON.stringify(fsScopeKey(scope)) : null;
  useEffect(() => {
    if (scopeKey) ensureScope(scopeKey);
  }, [scopeKey, ensureScope]);

  const tree = useResizable({
    size: layout.filesTreeWidth,
    onSize: (value) => setLayout('filesTreeWidth', value),
    initial: DEFAULT_LAYOUT.filesTreeWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.filesTreeWidth,
  });

  if (!scope) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <LuFolderTree aria-hidden className="h-10 w-10 text-muted-foreground/60" />
        <p className="max-w-md text-sm text-muted-foreground">
          Select a repository on the left to browse its files.
        </p>
      </div>
    );
  }

  const repoName = openRepos?.find((repo) => repo.id === selectedRepoId)?.name ?? 'repository';

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`flex shrink-0 flex-col ${tree.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}`}
        style={{ width: tree.current }}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="truncate text-xs font-semibold tracking-tight">{repoName}</span>
          <span className="ml-auto">
            <IconButton
              icon={LuRefreshCw}
              label="Refresh file tree"
              size="sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: fsScopeKey(scope) })}
            />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <FileTree
            scope={scope}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggleDir={toggleDir}
            onSelectFile={selectFile}
            writable
          />
        </div>
      </div>

      <ResizeHandle resizable={tree} axis="x" label="Resize file tree" />

      {selectedPath ? (
        <FilePreview key={`${scopeKey}:${selectedPath}`} scope={scope} relPath={selectedPath} />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center p-6">
          <p className="text-xs text-muted-foreground">Select a file to preview it.</p>
        </div>
      )}
    </div>
  );
}
