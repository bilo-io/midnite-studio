import { LuChevronDown, LuChevronRight, LuFile as FileIcon, LuFolder } from 'react-icons/lu';
import type { ReactNode } from 'react';

import type { ChangedFile, DirNode, FileNode, TreeNode } from './build-change-tree';
import { formatNumber } from '../lib/format-number';

/** What a caller needs to know about the open file, and how to change it. */
export type FileSelection<T extends ChangedFile> = {
  path: string | null;
  onSelect: (file: FileNode<T>) => void;
};

/**
 * Changed files, as a tree or as a flat list.
 *
 * One component for both because the row itself — name, `+n −n`, selected
 * treatment — is identical; only what precedes it differs. Two components would
 * be two places to fix the next time the row changes.
 *
 * Two callers now: the commit inspector, which reads a commit, and the Changes
 * panel, which stages a worktree. Their rows differ only at the ends — a status
 * mark in front, staging buttons behind — so those are slots rather than a
 * second copy of the recursion.
 */
export function ChangeTree<T extends ChangedFile>({
  nodes,
  selection,
  collapsed,
  onToggleDir,
  /** Directories are hidden in list mode, so their rows are never rendered. */
  flat = false,
  renderLeading,
  renderActions,
  testId,
}: {
  nodes: readonly TreeNode<T>[];
  selection: FileSelection<T>;
  collapsed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  flat?: boolean;
  /**
   * What sits between the indent and the name. Defaults to a file glyph; the
   * Changes panel puts the porcelain status letter there instead, which is the
   * one thing you scan that list for.
   */
  renderLeading?: (node: FileNode<T>) => ReactNode;
  /**
   * Trailing per-row controls, rendered AFTER the counts and outside the row's
   * own button — a stage button nested inside a select button is not a thing
   * the DOM allows, and the counts must not shift as the buttons fade in.
   */
  renderActions?: (node: FileNode<T>) => ReactNode;
  testId?: string;
}) {
  const rowProps = {
    selection,
    ...(renderLeading ? { renderLeading } : {}),
    ...(renderActions ? { renderActions } : {}),
  };

  return (
    <ul className="py-1" {...(testId ? { 'data-testid': testId } : {})}>
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <DirRow
            key={node.path}
            node={node}
            depth={0}
            collapsed={collapsed}
            onToggleDir={onToggleDir}
            {...rowProps}
          />
        ) : (
          <FileRow key={node.path} node={node} depth={0} showPath={flat} {...rowProps} />
        ),
      )}
    </ul>
  );
}

/** Indent per level. Tight on purpose — the pane is ~384px and paths are long. */
const INDENT = 12;

/** The slots, threaded unchanged through the recursion. */
type RowSlots<T extends ChangedFile> = {
  selection: FileSelection<T>;
  renderLeading?: (node: FileNode<T>) => ReactNode;
  renderActions?: (node: FileNode<T>) => ReactNode;
};

function DirRow<T extends ChangedFile>({
  node,
  depth,
  collapsed,
  onToggleDir,
  ...slots
}: RowSlots<T> & {
  node: DirNode<T>;
  depth: number;
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
          <LuChevronRight className="h-3 w-3 shrink-0" strokeWidth={2} />
        ) : (
          <LuChevronDown className="h-3 w-3 shrink-0" strokeWidth={2} />
        )}
        <LuFolder className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
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
                collapsed={collapsed}
                onToggleDir={onToggleDir}
                {...slots}
              />
            ) : (
              <FileRow key={child.path} node={child} depth={depth + 1} {...slots} />
            ),
          )}
        </ul>
      )}
    </li>
  );
}

function FileRow<T extends ChangedFile>({
  node,
  depth,
  selection,
  showPath = false,
  renderLeading,
  renderActions,
}: RowSlots<T> & {
  node: FileNode<T>;
  depth: number;
  /** List mode shows the full path; tree mode shows the leaf name. */
  showPath?: boolean;
}) {
  const isSelected = node.path === selection.path;
  const actions = renderActions?.(node);

  return (
    <li
      className={`group flex items-center pr-2 text-xs ${
        isSelected ? 'bg-accent text-foreground' : 'hover:bg-accent/40'
      }`}
    >
      <button
        type="button"
        onClick={() => selection.onSelect(node)}
        aria-pressed={isSelected}
        // The full path is the accessible name in both modes: in tree mode the
        // leaf alone ("index.ts") names a dozen different files in one commit.
        aria-label={node.path}
        className="flex min-w-0 flex-1 items-center gap-1 py-0.5 pr-1 text-left"
        style={{ paddingLeft: 12 + depth * INDENT + (showPath ? 0 : 16) }}
        title={node.oldPath === null ? node.path : `${node.oldPath} → ${node.path}`}
      >
        {renderLeading ? (
          renderLeading(node)
        ) : (
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
        )}
        <span className="min-w-0 flex-1 truncate">{showPath ? node.path : node.name}</span>
        {/* A rename is worth a marker: the diff it opens is against `oldPath`,
            and without the hint the pane looks like it is showing the wrong
            file's history. */}
        {node.oldPath === null ? null : (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
            R
          </span>
        )}
        <Counts insertions={node.insertions} deletions={node.deletions} />
      </button>
      {actions}
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
 *
 * The size is stated here rather than inherited. Every other `+n −n` in the app
 * — the roll-up above a list, the diff toolbar — is 11px, but the two file
 * accordions set a 13px row for the path, and inheriting it made the same pair
 * of numbers a size larger in one place than in the next. `font-medium` buys
 * back the weight the smaller size costs, so the counts still read as the
 * numbers on the row rather than as its faintest text.
 */
export function Counts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span className="shrink-0 text-[11px] font-medium tabular-nums">
      <span className={insertions === 0 ? 'text-muted-foreground/50' : 'text-success'}>
        +{formatNumber(insertions)}
      </span>{' '}
      <span className={deletions === 0 ? 'text-muted-foreground/50' : 'text-destructive'}>
        −{formatNumber(deletions)}
      </span>
    </span>
  );
}

/**
 * The total across a whole list, for the row above it.
 *
 * A file count and a `+n −n` in one line. The tree already rolls the numbers up
 * per directory; this is the same roll-up taken one step further, so "how big
 * is this change" is answerable without expanding anything or adding up rows.
 */
export function ChangeTotals({
  fileCount,
  insertions,
  deletions,
  className = '',
}: {
  fileCount: number;
  insertions: number;
  deletions: number;
  className?: string;
}) {
  return (
    <span
      className={`flex min-w-0 flex-1 items-baseline justify-between gap-2 text-[11px] text-muted-foreground ${className}`}
      data-testid="change-totals"
    >
      <span className="truncate tabular-nums">
        {formatNumber(fileCount)} {fileCount === 1 ? 'file' : 'files'}
      </span>
      <span className="shrink-0 font-bold">
        <Counts insertions={insertions} deletions={deletions} />
      </span>
    </span>
  );
}
