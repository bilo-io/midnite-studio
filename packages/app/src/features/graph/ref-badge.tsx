import { GitCommitHorizontal, Tag } from 'lucide-react';
import type { Ref } from '@midnite/git-shared';
import { useMemo } from 'react';

/**
 * Ref badges, joined to graph rows by commit sha.
 *
 * By sha rather than by the `%D` decorations the log already carries, because
 * decorations are a snapshot from when the log was streamed. A checkout or a
 * branch creation changes the refs without changing history, and the refs query
 * is invalidated by the watcher while the streamed rows stay put — so badges
 * stay live without re-streaming 50 000 rows.
 */
export function useRefsBySha(refs: readonly Ref[]): Map<string, Ref[]> {
  return useMemo(() => {
    const bySha = new Map<string, Ref[]>();
    for (const ref of refs) {
      const list = bySha.get(ref.sha);
      if (list) list.push(ref);
      else bySha.set(ref.sha, [ref]);
    }
    // HEAD first, then local branches, then remotes, then tags — the order a
    // reader scans for "where am I".
    for (const list of bySha.values()) list.sort(byImportance);
    return bySha;
  }, [refs]);
}

const RANK: Record<Ref['kind'], number> = {
  head: 0,
  localBranch: 1,
  remoteBranch: 2,
  tag: 3,
};

const byImportance = (a: Ref, b: Ref): number =>
  Number(b.isHead) - Number(a.isHead) || RANK[a.kind] - RANK[b.kind] || a.name.localeCompare(b.name);

const STYLES: Record<Ref['kind'], string> = {
  head: 'border-primary/60 bg-primary/15 text-primary',
  localBranch: 'border-primary/40 bg-primary/10 text-foreground',
  remoteBranch: 'border-border bg-muted/60 text-muted-foreground',
  tag: 'border-success/40 bg-success/10 text-success',
};

export function RefBadge({
  refItem,
  onContextMenu,
  onDoubleClick,
  dnd,
}: {
  refItem: Ref;
  onContextMenu?: (event: React.MouseEvent) => void;
  onDoubleClick?: (event: React.MouseEvent) => void;
  /** Drag/drop wiring from useRefDnd — omitted where the badge is static. */
  dnd?: {
    setNodeRef: (node: HTMLElement | null) => void;
    listeners: Record<string, unknown>;
    attributes: Record<string, unknown>;
    isOver: boolean;
    isDragging: boolean;
  };
}) {
  const upstream = refItem.upstream;
  const ahead = upstream?.ahead ?? 0;
  const behind = upstream?.behind ?? 0;

  return (
    <span
      ref={dnd?.setNodeRef}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      {...(dnd?.listeners ?? {})}
      {...(dnd?.attributes ?? {})}
      className={`inline-flex min-w-0 max-w-[16rem] shrink cursor-default items-center gap-1 rounded border px-1.5 py-px text-[11px] leading-4 ${
        STYLES[refItem.kind]
      } ${refItem.isHead ? 'font-semibold' : ''} ${
        // A drop target has to look like one mid-drag, or the gesture is a
        // guess — the ring is the only feedback the user gets before releasing.
        dnd?.isOver ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
      } ${dnd?.isDragging ? 'opacity-40' : ''}`}
      title={`${refItem.fullName}${upstream ? ` → ${upstream.name}` : ''}`}
    >
      {refItem.isHead ? <GitCommitHorizontal aria-hidden className="h-3 w-3 shrink-0" /> : null}
      {refItem.kind === 'tag' ? <Tag aria-hidden className="h-3 w-3 shrink-0" /> : null}
      <span className="truncate">{refItem.name}</span>
      {/* Ahead/behind belongs on the badge: it's the answer to "do I need to
          push or pull", asked while looking at exactly this branch. */}
      {ahead > 0 ? <span className="tabular-nums opacity-80">↑{ahead}</span> : null}
      {behind > 0 ? <span className="tabular-nums opacity-80">↓{behind}</span> : null}
      {upstream?.gone ? <span className="opacity-80">gone</span> : null}
    </span>
  );
}
