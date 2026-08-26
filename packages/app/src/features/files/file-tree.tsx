import { useQuery } from '@tanstack/react-query';
import { LuChevronRight } from 'react-icons/lu';

import type { FsEntry } from '@midnite/git-shared';

import { bridge, hasBridge } from '../../services/bridge';
import { FileIcon, FolderIcon } from './file-icons';

/**
 * A listing request minus its relPath — the tree threads this through every
 * level. Two callers own it: the Files view (repo scope) and the Agent
 * settings page (claude-home scope), which is why expansion/selection arrive
 * as props rather than being read from the files store here.
 */
export type FsScopeInput =
  | { scope: 'repo'; repoId: string; worktreePath?: string }
  | { scope: 'claude-home' };

/** Stable query-key prefix for one scope — also what a refresh invalidates. */
export const fsScopeKey = (scope: FsScopeInput): readonly unknown[] =>
  scope.scope === 'repo'
    ? (['fs', 'repo', scope.repoId, scope.worktreePath ?? null] as const)
    : (['fs', 'claude-home'] as const);

export type FileTreeProps = {
  scope: FsScopeInput;
  expanded: Record<string, true>;
  selectedPath: string | null;
  onToggleDir: (relPath: string) => void;
  onSelectFile: (relPath: string) => void;
};

/**
 * The lazy tree: each directory queries its own listing on first expand and
 * never before, so `node_modules` costs nothing until opened on purpose.
 * Read-only by construction — rows have no rename/delete affordance and the
 * bridge has no channel that could serve one.
 */
export function FileTree(props: FileTreeProps) {
  return (
    <div role="tree" aria-label="Files" className="py-1 text-xs">
      <DirectoryChildren {...props} relPath="" depth={0} />
    </div>
  );
}

function DirectoryChildren({
  scope,
  relPath,
  depth,
  expanded,
  selectedPath,
  onToggleDir,
  onSelectFile,
}: FileTreeProps & { relPath: string; depth: number }) {
  const { data } = useQuery({
    queryKey: [...fsScopeKey(scope), 'dir', relPath],
    queryFn: async () => bridge()!.fs.listDir({ ...scope, relPath }),
    enabled: hasBridge(),
  });

  if (!data) {
    return (
      <p className="px-3 py-1 text-muted-foreground" style={indent(depth)}>
        Loading…
      </p>
    );
  }
  if (!data.ok) {
    return (
      <p className="px-3 py-1 text-muted-foreground" style={indent(depth)}>
        {data.message}
      </p>
    );
  }
  if (data.entries.length === 0) {
    return (
      <p className="px-3 py-1 italic text-muted-foreground" style={indent(depth)}>
        empty
      </p>
    );
  }

  return (
    <>
      {data.entries.map((entry) => (
        <TreeRow
          key={entry.name}
          entry={entry}
          relPath={relPath.length > 0 ? `${relPath}/${entry.name}` : entry.name}
          depth={depth}
          scope={scope}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
        />
      ))}
    </>
  );
}

function TreeRow({
  entry,
  relPath,
  depth,
  ...tree
}: FileTreeProps & { entry: FsEntry; relPath: string; depth: number }) {
  const isDir = entry.kind === 'dir';
  const isOpen = isDir && tree.expanded[relPath] === true;
  const isSelected = tree.selectedPath === relPath;

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isDir ? isOpen : undefined}
        aria-selected={isSelected}
        onClick={() => (isDir ? tree.onToggleDir(relPath) : tree.onSelectFile(relPath))}
        className={`flex w-full items-center gap-1.5 px-3 py-[3px] text-left transition-colors hover:bg-accent ${
          isSelected ? 'bg-primary/10 text-foreground' : ''
        } ${entry.isIgnored ? 'opacity-45' : ''}`}
        style={indent(depth)}
        title={entry.isIgnored ? `${entry.name} — gitignored` : entry.name}
      >
        {isDir ? (
          <LuChevronRight
            aria-hidden
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? <FolderIcon open={isOpen} /> : <FileIcon name={entry.name} />}
        <span className="truncate">{entry.name}</span>
        {entry.kind === 'symlink' ? (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">link</span>
        ) : null}
      </button>
      {isOpen ? <DirectoryChildren {...tree} relPath={relPath} depth={depth + 1} /> : null}
    </>
  );
}

const indent = (depth: number) => ({ paddingLeft: `${12 + depth * 14}px` });
