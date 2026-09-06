import { useState, type ReactNode } from 'react';
import { LuChevronDown, LuChevronRight, LuFolder } from 'react-icons/lu';

import { formatBytes } from '../../monitor/format-bytes';
import type { SizeDirNode, SizeTreeNode, SizedItem } from '../build-size-tree';

/**
 * The Optimizer's tree rows — one recursive component over
 * `build-size-tree.ts`'s nodes, shared by the Storage tab's file tree and the
 * Smart Scan accordion's drill-down.
 *
 * Expansion is held here rather than lifted: which folders a user opened is a
 * fact about this rendering of the list, not about the scan, and the store is
 * deliberately a snapshot of what main reported. Keyed by the node's full
 * path, so re-running a scan re-opens whatever is still there and quietly
 * forgets what is not.
 *
 * The 12px indent step is the one `tree-indent.ts` and `change-tree.tsx`
 * already use, so every tree in the app nests at the same rate.
 *
 * **Why not `components/change-tree.tsx`, which has render slots?** Its rows
 * are typed on `ChangedFile` and its every row reads an insertions/deletions
 * pair and a status code; these rows read a byte total and nothing else, and
 * `build-size-tree.ts`'s own header gives the matching argument for the trie.
 * Widening that component to a union of two measures would put a
 * `formatBytes` branch and an optional-status branch into every Changes-panel
 * row to save this file's forty lines of markup. Two trees, one indent step,
 * is the cheaper trade — and it is the same call Phase 72 made when the
 * Storage bar did not become a second `SegmentedBar` feature flag.
 */

const INDENT_STEP = 12;

/**
 * `defaultExpandedDepth` for a tree that starts fully open — the Smart Scan
 * drill-down, which already sits behind an accordion of its own and whose
 * leaves are the point of opening it.
 *
 * Callers must gate it on size themselves: `EXPAND_ALL_LIMIT`
 * (`features/changes/expansion.ts`) is this repo's standing answer to "how
 * many rows may one click open", and a scan across several repos produces
 * hundreds of items. See `smart-scan-tab.tsx`'s own use.
 */
export const EXPAND_ALL = Number.MAX_SAFE_INTEGER;

export function SizeTree<T extends SizedItem>({
  nodes,
  leafDot,
  leafLabel,
  onLeafClick,
  leafClickable,
  leafAction,
  defaultExpandedDepth = 1,
}: {
  nodes: readonly SizeTreeNode<T>[];
  /** A colour for the leaf's dot — the category swatch, in both callers. */
  leafDot?: (item: T) => string | undefined;
  /** What the leaf says above its path. Defaults to the path's own last segment. */
  leafLabel?: (item: T) => ReactNode;
  onLeafClick?: (item: T) => void;
  /** Whether *this* leaf's click does anything. A handler that no-ops for
   *  some rows has to render those rows disabled, or the tree offers a
   *  control the list view beside it correctly refuses to. */
  leafClickable?: (item: T) => boolean;
  leafAction?: (item: T) => ReactNode;
  /** Directories shallower than this start open. */
  defaultExpandedDepth?: number;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Two sets rather than one, because "open" has a default that depends on
  // depth: a single set could not distinguish "never touched, and deeper than
  // the default" from "explicitly closed".
  const isOpen = (node: SizeDirNode<T>, depth: number): boolean =>
    expanded.has(node.path) || (depth < defaultExpandedDepth && !collapsed.has(node.path));

  const toggle = (node: SizeDirNode<T>, open: boolean) => {
    if (open) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      setCollapsed((prev) => new Set(prev).add(node.path));
    } else {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      setExpanded((prev) => new Set(prev).add(node.path));
    }
  };

  const renderNodes = (children: readonly SizeTreeNode<T>[], depth: number): ReactNode =>
    children.map((node) =>
      node.kind === 'dir' ? (
        <li key={`dir:${node.path}`}>
          <div
            className="flex items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-accent/40"
            style={{ paddingLeft: depth * INDENT_STEP + 4 }}
          >
            <button
              type="button"
              onClick={() => toggle(node, isOpen(node, depth))}
              aria-expanded={isOpen(node, depth)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              {isOpen(node, depth) ? (
                <LuChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <LuChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <LuFolder aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs text-foreground">{node.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {node.itemCount} item{node.itemCount === 1 ? '' : 's'}
              </span>
            </button>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
              {formatBytes(node.bytes)}
            </span>
          </div>
          {isOpen(node, depth) ? <ul>{renderNodes(node.children, depth + 1)}</ul> : null}
        </li>
      ) : (
        <li key={`file:${node.path}`}>
          <div
            className="flex items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-accent/40"
            style={{ paddingLeft: depth * INDENT_STEP + 4 }}
          >
            <button
              type="button"
              onClick={() => onLeafClick?.(node)}
              disabled={!onLeafClick || (leafClickable ? !leafClickable(node) : false)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: leafDot?.(node) ?? 'transparent' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {leafLabel?.(node) ?? node.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {node.path}
                </span>
              </span>
            </button>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
              {formatBytes(node.bytes)}
            </span>
            {leafAction?.(node)}
          </div>
        </li>
      ),
    );

  if (nodes.length === 0) return null;

  return <ul className="space-y-0.5">{renderNodes(nodes, 0)}</ul>;
}
