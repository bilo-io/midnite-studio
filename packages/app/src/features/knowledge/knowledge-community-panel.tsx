import { useMemo } from 'react';

import { LuEye, LuEyeOff, LuMaximize2, LuX } from 'react-icons/lu';

import type { KnowledgeGraphNode } from '@midnite/studio-shared';

import { IconButton } from '../../components/icon-button';

/** How many members the panel lists — the rest is "and N more"; the tree list is where the full roster lives. */
const MEMBER_LIST_CAP = 60;

/**
 * The right-hand panel for a selected community meta-node — the counterpart
 * of `KnowledgeNodePanel`, which opens a file. A collapsed community has no
 * one file to open, so this shows what it stands for instead: its member
 * roster (hubs first), and the two things you can do to it from here —
 * expand it back onto the canvas, or hide it from the graph.
 */
export function KnowledgeCommunityPanel({
  communityName,
  members,
  degrees,
  hidden,
  onClose,
  onExpand,
  onToggleHidden,
  onSelectNode,
  width,
  style,
  className = '',
}: {
  communityName: string;
  members: readonly Pick<KnowledgeGraphNode, 'id' | 'label'>[];
  degrees: ReadonlyMap<string, number>;
  hidden: boolean;
  onClose: () => void;
  onExpand: () => void;
  onToggleHidden: () => void;
  onSelectNode: (nodeId: string) => void;
  width?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const sorted = useMemo(
    () => [...members].sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0)),
    [members, degrees],
  );
  const shown = sorted.slice(0, MEMBER_LIST_CAP);
  const overflow = sorted.length - shown.length;

  return (
    <div
      style={{ ...(width !== undefined ? { width } : {}), ...style }}
      className={`flex h-full min-h-0 w-full flex-col border-l border-border bg-background ${className}`}
      data-testid="knowledge-community-panel"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-xs font-medium text-muted-foreground">Knowledge · community</span>
        <IconButton icon={LuX} label="Close" onClick={onClose} />
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={communityName}>
            {communityName}
          </p>
          <p className="text-xs text-muted-foreground">
            {members.length.toLocaleString()} node{members.length === 1 ? '' : 's'}, collapsed into one
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExpand}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <LuMaximize2 aria-hidden className="h-3.5 w-3.5" />
            Expand on canvas
          </button>
          <button
            type="button"
            onClick={onToggleHidden}
            aria-pressed={hidden}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            {hidden ? (
              <LuEye aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <LuEyeOff aria-hidden className="h-3.5 w-3.5" />
            )}
            {hidden ? 'Show community' : 'Hide community'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {shown.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelectNode(member.id)}
            className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-accent"
            title={member.label}
          >
            <span className="truncate">{member.label}</span>
            <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
              {degrees.get(member.id) ?? 0}
            </span>
          </button>
        ))}
        {overflow > 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            and {overflow.toLocaleString()} more — switch the community list to Tree to see them all.
          </p>
        ) : null}
      </div>
    </div>
  );
}
