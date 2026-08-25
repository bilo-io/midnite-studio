import { Check, Cloud, GitBranch, Tag } from 'lucide-react';
import type { Ref } from '@midnite/git-shared';
import { useMemo } from 'react';

import type { PaletteStyle } from './graph-themes';
import { laneInk, laneVars } from './lane-colors';

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

/**
 * How hard a chip that is NOT the checked-out ref presses on the eye.
 *
 * A repo's branch list is mostly refs you are not on, and at full strength the
 * column becomes a wall of colour with nothing standing out of it — which is
 * the opposite of what the column is for. Held back here so the ONE chip that
 * matters ("you are here") is legible at a glance rather than found by reading.
 */
const RESTING_OPACITY = 0.78;

/**
 * A ref chip, in the colour of the lane its commit sits on.
 *
 * The colour is the point. A branch name in the BRANCH / TAG column and a
 * coloured node in the GRAPH column are the same object shown twice, and until
 * the chip took the lane's hue the only way to connect them was to trace along
 * the row — which is exactly the work GitKraken's colour-matched labels save
 * you. The leader line the row draws from the chip to the node (see `GraphSvg`)
 * closes the last of that gap.
 *
 * Two states, not four: the checked-out ref is filled solid and the rest are
 * tinted. Kind is carried by the ICON — a check for HEAD, a cloud for a remote,
 * a tag for a tag — because kind and colour are independent facts and spending
 * colour on kind would cost the branch identity that colour is here to give.
 */
export function RefBadge({
  refItem,
  colorIdx,
  palette,
  onContextMenu,
  onDoubleClick,
  dnd,
}: {
  refItem: Ref;
  /** Lane colour index of the commit this ref points at. */
  colorIdx: number;
  palette: PaletteStyle;
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
  const current = refItem.isHead;

  return (
    <span
      ref={dnd?.setNodeRef}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      {...(dnd?.listeners ?? {})}
      {...(dnd?.attributes ?? {})}
      /*
        `--lane-*` rather than three finished colours: the tint, the border and
        the ink are three different alphas and lightnesses of ONE hue, and the
        ink's lightness has to flip with the app theme — which only the
        stylesheet knows. See `laneVars` and `--lane-ink-l` in styles.css.
      */
      style={{
        ...laneVars(colorIdx, palette),
        ...(current ? { color: laneInk(colorIdx, palette) } : undefined),
        opacity: current ? 1 : RESTING_OPACITY,
      }}
      className={`inline-flex min-w-0 max-w-[16rem] shrink cursor-default items-center gap-1 rounded-[3px] border px-1.5 py-px text-[11px] leading-4 transition-opacity ${
        current
          ? 'border-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l))] bg-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l))] font-semibold shadow-sm'
          : 'border-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l)/0.45)] bg-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l)/0.14)] text-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-ink-l))] hover:opacity-100'
      } ${
        // A drop target has to look like one mid-drag, or the gesture is a
        // guess — the ring is the only feedback the user gets before releasing.
        dnd?.isOver ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
      } ${dnd?.isDragging ? 'opacity-40' : ''}`}
      title={`${refItem.fullName}${upstream ? ` → ${upstream.name}` : ''}`}
    >
      <RefIcon refItem={refItem} />
      <span className="truncate">{refItem.name}</span>
      {/* Ahead/behind belongs on the badge: it's the answer to "do I need to
          push or pull", asked while looking at exactly this branch. */}
      {ahead > 0 ? <span className="tabular-nums opacity-80">↑{ahead}</span> : null}
      {behind > 0 ? <span className="tabular-nums opacity-80">↓{behind}</span> : null}
      {upstream?.gone ? <span className="opacity-80">gone</span> : null}
    </span>
  );
}

/**
 * The chip's leading glyph.
 *
 * A check for the ref you are standing on — the same mark GitKraken uses, and
 * the one thing in the column worth a symbol of its own. Everything else names
 * where the ref LIVES: a cloud for a remote-tracking branch, a tag for a tag, a
 * branch for a plain local one.
 */
function RefIcon({ refItem }: { refItem: Ref }) {
  const className = 'h-3 w-3 shrink-0';
  if (refItem.isHead) return <Check aria-hidden className={className} />;
  if (refItem.kind === 'tag') return <Tag aria-hidden className={className} />;
  if (refItem.kind === 'remoteBranch') return <Cloud aria-hidden className={className} />;
  return <GitBranch aria-hidden className={className} />;
}
