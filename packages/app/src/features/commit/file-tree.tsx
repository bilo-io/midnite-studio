import { ChevronDown, ChevronRight, File as FileIcon, Folder } from 'lucide-react';

import type { DirNode, FileNode, TreeNode } from './build-file-tree';

/** What the inspector needs to know about the open file, and how to change it. */
export type FileSelection = {
  path: string | null;
  onSelect: (file: { path: string; oldPath: string | null }) => void;
};

/**
 * The file rows of a commit, as a tree or as a flat list.
 *
 * One component for both because the row itself — name, `+n −n`, selected
 * treatment — is identical; only what precedes it differs. Two components would
 * be two places to fix the next time the row changes.
 */
export function FileTree({
  nodes,
  selection,
  collapsed,
  onToggleDir,
  /** Directories are hidden in list mode, so their rows are never rendered. */
  flat = false,
}: {
  nodes: readonly TreeNode[];
  selection: FileSelection;
  collapsed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  flat?: boolean;
}) {
  return (
    <ul className="py-1" data-testid="commit-files">
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <DirRow
            key={node.path}
            node={node}
            depth={0}
            selection={selection}
            collapsed={collapsed}
            onToggleDir={onToggleDir}
          />
        ) : (
          <FileRow key={node.path} node={node} depth={0} selection={selection} showPath={flat} />
        ),
      )}
    </ul>
  );
}

/** Indent per level. Tight on purpose — the pane is ~384px and paths are long. */
const INDENT = 12;

function DirRow({
  node,
  depth,
  selection,
  collapsed,
  onToggleDir,
}: {
  node: DirNode;
  depth: number;
  selection: FileSelection;
  collapsed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
}) {
  // Collapsed is the exception set, so a commit opens fully expanded and a
  // directory that appears in a later commit is not silently already closed.
  const isCollapsed = collapsed.has(node.path);

  return (
    <li>
      <button
        type="button"
        onClick={() => onToggleDir(node.path)}
        aria-expanded={!isCollapsed}
        // The path alone, so the accessible name is the directory rather than
        // "packages/desktop +4 −1" — the counts are visible text beside it, and
        // reading them as part of the control's name is not what they are.
        aria-label={node.path}
        className="flex w-full items-center gap-1 px-3 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent/40"
        style={{ paddingLeft: 12 + depth * INDENT }}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2} />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2} />
        )}
        <Folder className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate" title={node.path}>
          {node.name}
        </span>
        {/* Subtree totals, so a collapsed directory still says how much is
            inside it — otherwise collapsing hides the very number you would
            collapse in order to compare. */}
        <Counts insertions={node.insertions} deletions={node.deletions} />
      </button>

      {isCollapsed ? null : (
        <ul>
          {node.children.map((child) =>
            child.kind === 'dir' ? (
              <DirRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selection={selection}
                collapsed={collapsed}
                onToggleDir={onToggleDir}
              />
            ) : (
              <FileRow key={child.path} node={child} depth={depth + 1} selection={selection} />
            ),
          )}
        </ul>
      )}
    </li>
  );
}

function FileRow({
  node,
  depth,
  selection,
  showPath = false,
}: {
  node: FileNode;
  depth: number;
  selection: FileSelection;
  /** List mode shows the full path; tree mode shows the leaf name. */
  showPath?: boolean;
}) {
  const isSelected = node.path === selection.path;

  return (
    <li>
      <button
        type="button"
        onClick={() => selection.onSelect({ path: node.path, oldPath: node.oldPath })}
        aria-pressed={isSelected}
        // The full path is the accessible name in both modes: in tree mode the
        // leaf alone ("index.ts") names a dozen different files in one commit.
        aria-label={node.path}
        className={`flex w-full items-center gap-1 px-3 py-0.5 text-left text-xs ${
          isSelected ? 'bg-accent text-foreground' : 'hover:bg-accent/40'
        }`}
        style={{ paddingLeft: 12 + depth * INDENT + (showPath ? 0 : 16) }}
        title={node.oldPath === null ? node.path : `${node.oldPath} → ${node.path}`}
      >
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate">{showPath ? node.path : node.name}</span>
        {/* A rename is worth a marker: the diff it opens is against `oldPath`,
            and without the hint the pane looks like it is showing the wrong
            file's history. */}
        {node.oldPath === null ? null : (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">R</span>
        )}
        <Counts insertions={node.insertions} deletions={node.deletions} />
      </button>
    </li>
  );
}

/**
 * The `+n −n` pair.
 *
 * `tabular-nums` so the columns line up down the list rather than jittering with
 * each row's digit widths — the thing that makes a file list scannable at all.
 * A zero is dimmed rather than hidden: a binary file changes with `+0 −0`, and an
 * absent number reads as missing data.
 */
function Counts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span className="shrink-0 tabular-nums">
      <span className={insertions === 0 ? 'text-muted-foreground/50' : 'text-success'}>
        +{insertions}
      </span>{' '}
      <span className={deletions === 0 ? 'text-muted-foreground/50' : 'text-destructive'}>
        −{deletions}
      </span>
    </span>
  );
}
