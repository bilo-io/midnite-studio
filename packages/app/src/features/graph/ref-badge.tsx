import { ArrowDown, ArrowUp, Check, Cloud, GitBranch, Tag } from 'lucide-react';
import type { Ref } from '@midnite/git-shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';
import type { PaletteStyle } from './graph-themes';
import { laneInk, laneVars } from './lane-colors';
import type { SyncAction } from './ref-sync';

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
 *
 * Since Phase 12 it is also a control: a branch that is ahead or behind expands
 * on hover into the buttons that fix that. See `SyncOverlay`.
 */
export function RefBadge({
  refItem,
  colorIdx,
  palette,
  actions = EMPTY_ACTIONS,
  crowded = false,
  onSync,
  syncing,
  onContextMenu,
  onDoubleClick,
  dnd,
}: {
  refItem: Ref;
  /** Lane colour index of the commit this ref points at. */
  colorIdx: number;
  palette: PaletteStyle;
  /** Sync verbs with a count, from `badgeActions`. Empty for anything in sync. */
  actions?: readonly SyncAction[];
  /**
   * Another chip shares this row's column.
   *
   * Caps this one's share of it. Flex shrink alone distributes the shortfall in
   * proportion to content width, which is the wrong way round here: the pair is
   * nearly always a local branch and its remote-tracking twin, so the longer
   * name is the one carrying the extra information (`origin/`) and the shorter
   * one gets squeezed toward an ellipsis that says nothing. A hard cap on each
   * guarantees the second chip keeps enough room to be identifiable.
   */
  crowded?: boolean;
  onSync?: (action: SyncAction) => void;
  /** The verb currently in flight on this ref, if any. */
  syncing?: SyncAction['kind'] | null;
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

  const expandable = actions.length > 0 && onSync !== undefined;
  const chipRef = useRef<HTMLElement | null>(null);
  const { hovered, enter, leave } = useHoverGroup();
  // Stays open while an op is in flight: collapsing the strip out from under a
  // spinner reads as the click having failed.
  const expanded = expandable && (hovered || syncing != null);

  const chip = (
    <span
      ref={(node) => {
        chipRef.current = node;
        dnd?.setNodeRef(node ?? null);
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      /*
        The chip's full ref name, for tests and for anything that has to tell
        two chips apart. The visible label is the SHORT name, and a branch and
        a tag are allowed to share one — so the short name is not an identity.
        This used to be the native `title=` the tooltip replaced; keeping the
        value as a plain attribute keeps that identity addressable without
        putting a second hover story back on the element.
      */
      data-ref={refItem.fullName}
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
        ...(current
          ? {
              color: laneInk(colorIdx, palette),
              /*
                The still half of the "you are here" marker. See `HeadGlow` for
                why this is a shadow and not a blurred child element.
              */
              boxShadow:
                '0 0 0 1px hsl(var(--lane-h) var(--lane-s) var(--lane-l) / 0.55), 0 0 7px 1px hsl(var(--lane-h) var(--lane-s) var(--lane-l) / 0.5)',
            }
          : undefined),
        opacity: current ? 1 : RESTING_OPACITY,
      }}
      className={`relative inline-flex min-w-0 max-w-full shrink cursor-default items-center gap-1 rounded-[3px] border px-1.5 py-px text-[11px] leading-4 transition-opacity ${
        current
          ? 'border-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l))] bg-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l))] font-semibold'
          : 'border-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l)/0.45)] bg-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l)/0.14)] text-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-ink-l))] hover:opacity-100'
      } ${
        // A drop target has to look like one mid-drag, or the gesture is a
        // guess — the ring is the only feedback the user gets before releasing.
        dnd?.isOver ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
      } ${dnd?.isDragging ? 'opacity-40' : ''}`}
    >
      {current ? <HeadGlow /> : null}
      <RefIcon refItem={refItem} />
      <span className="truncate">{refItem.name}</span>
      {/* Ahead/behind belongs on the badge: it's the answer to "do I need to
          push or pull", asked while looking at exactly this branch. */}
      {ahead > 0 ? <span className="tabular-nums opacity-80">↑{ahead}</span> : null}
      {behind > 0 ? <span className="tabular-nums opacity-80">↓{behind}</span> : null}
      {upstream?.gone ? <span className="opacity-80">gone</span> : null}
    </span>
  );

  /*
    The share cap goes on whichever element the COLUMN lays out, which is the
    chip when it is bare and the wrapper when it is expandable. Putting it on
    the chip in both cases made it resolve against the `w-fit` wrapper — i.e.
    against the chip's own width — so an expandable chip clamped itself to 60%
    of itself and truncated beside its own empty space.
  */
  const share = crowded ? 'max-w-[60%]' : 'max-w-full';

  if (!expandable) {
    return (
      <Tooltip label={<RefTooltip refItem={refItem} />}>
        {/*
          The wrapper is `contents`-free on purpose: Tooltip clones its child
          and needs a real element to hang a ref and handlers on, and the chip
          IS that element.
        */}
        {chip}
      </Tooltip>
    );
  }

  return (
    <span
      className={`flex w-fit min-w-0 shrink items-center ${share}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <Tooltip label={<RefTooltip refItem={refItem} />}>{chip}</Tooltip>
      {expanded ? (
        <SyncOverlay
          anchor={chipRef}
          branch={refItem.name}
          actions={actions}
          syncing={syncing ?? null}
          onSync={onSync}
          colorIdx={colorIdx}
          palette={palette}
          onEnter={enter}
          onLeave={leave}
        />
      ) : null}
    </span>
  );
}

/**
 * Hover state shared by two elements that are not DOM relatives.
 *
 * The strip is portalled, so moving the pointer from the chip onto it fires
 * `mouseleave` on the chip with no `mouseenter` on any descendant — the strip
 * would close the instant the user reached for it. A short grace period on the
 * way out, cancelled by an enter anywhere in the group, is what makes the gap
 * between the two crossable.
 */
function useHoverGroup() {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const enter = useCallback(() => {
    clear();
    setHovered(true);
  }, [clear]);

  const leave = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setHovered(false), HOVER_GRACE_MS);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { hovered, enter, leave };
}

/** Long enough to cross the 2px gap between the chip and the strip. */
const HOVER_GRACE_MS = 140;

const EMPTY_ACTIONS: readonly SyncAction[] = [];

/**
 * The pull/push buttons, painted OVER the row rather than inside it.
 *
 * The alternative — reserving the width permanently — costs every syncable
 * branch ~44px of the BRANCH / TAG column, and the branches with counts are
 * disproportionately the ones with long names. Absolute positioning means the
 * chip's layout width never changes, so nothing in the row can reflow: the
 * strip covers the leader line, which is the cheapest thing in the row to hide
 * and is itself only an annotation pointing at a node two columns away.
 *
 * `left-full` rather than a right offset, because the chip's width varies with
 * the branch name and the strip has to start where the chip actually ends.
 */
function SyncOverlay({
  anchor,
  branch,
  actions,
  syncing,
  onSync,
  colorIdx,
  palette,
  onEnter,
  onLeave,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  /** Names the group, so the strip is not an anonymous pair of arrows. */
  branch: string;
  actions: readonly SyncAction[];
  syncing: SyncAction['kind'] | null;
  onSync: (action: SyncAction) => void;
  colorIdx: number;
  palette: PaletteStyle;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const node = anchor.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setPlaced({ x: box.right + STRIP_GAP, y: box.top + box.height / 2 });
  }, [anchor, actions]);

  /*
    Closed by a scroll rather than repositioned, exactly as Tooltip is: the
    graph is virtualized, so the row the strip is anchored to can be recycled
    out from under it mid-scroll, and a strip left pointing at a different
    branch is worse than no strip.
  */
  useEffect(() => {
    window.addEventListener('scroll', onLeave, true);
    return () => window.removeEventListener('scroll', onLeave, true);
  }, [onLeave]);

  if (!placed) return null;

  return createPortal(
    <span
      /*
        A named group, not a bare span. Portalled to <body>, the strip is no
        longer anywhere near the branch it acts on in the accessibility tree
        either — so without a name, a screen reader reaching it announces two
        arrow buttons belonging to nothing.
      */
      role="group"
      aria-label={`Sync ${branch}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ ...laneVars(colorIdx, palette), left: placed.x, top: placed.y }}
      /*
        Portalled to <body> and positioned in viewport coordinates.

        Two things in the row make an in-flow overlay impossible, and both are
        invisible from the markup. The BRANCH / TAG cell is `overflow-hidden`,
        so a strip reaching past the chip is CLIPPED — it has a bounding box, so
        it still reads as "visible" to a test, and is simply not there for the
        user. And each virtualized row carries a `transform`, which makes it the
        containing block for `fixed` descendants and opens a stacking context —
        the same pair of traps documented on Tooltip's own portal.

        Opaque background, not a tint: it overlaps the leader line and, in a
        crowded column, the chip after it. A translucent strip over a coloured
        rule is unreadable in exactly the case it exists for.
      */
      className="fixed z-[60] flex -translate-y-1/2 items-center gap-0.5 rounded-[3px] border border-[hsl(var(--lane-h)_var(--lane-s)_var(--lane-l)/0.45)] bg-popover px-0.5 shadow-md animate-fade-in"
    >
      {actions.map((action) => (
        <IconButton
          key={action.kind}
          size="sm"
          icon={action.kind === 'pull' ? ArrowDown : ArrowUp}
          label={action.label}
          disabled={action.disabled}
          {...(action.disabledReason ? { disabledReason: action.disabledReason } : {})}
          busy={syncing === action.kind}
          onClick={(event) => {
            // The chip sits inside a clickable row and is a drag source; a
            // click here means the button, not the row underneath it.
            event.stopPropagation();
            onSync(action);
          }}
        >
          <span className="tabular-nums text-[10px]">{action.count}</span>
        </IconButton>
      ))}
    </span>,
    document.body,
  );
}

/** Gap between the chip's right edge and the strip. */
const STRIP_GAP = 3;

/**
 * The "you are here" marker on the checked-out chip.
 *
 * Two layers, and which one you see depends on the motion setting rather than
 * on a media query in JS:
 *
 * - a static halo, always painted, sized and coloured to stand on its own;
 * - a gradient border sweeping around the chip, layered over it.
 *
 * The sweep is an animation, so `html[data-motion='reduced']` (set by
 * `applyMotion`, reset by the shell's appearance.css) stops it — and stopping
 * it leaves the halo, which is a still glow rather than a frozen frame of
 * something that was meant to move. That ordering is the whole trick: the
 * reduced-motion state had to be a design, not a disabled feature, so the
 * halo's appearance is set in its base styles and never in a keyframe.
 *
 * The sweep is an absolutely-positioned sibling at a negative inset rather than
 * an `outline`, because a chip that grows an outline changes its painted size
 * and nudges the row. The halo is a `box-shadow`, for a subtler reason: as a
 * `-z-10` child it escaped the chip entirely — the chip opens no stacking
 * context, so the halo was hoisted into the virtualized ROW's and painted
 * before the row's own background. Selecting the HEAD row covered it with
 * `bg-accent`, and under reduced motion, where the halo is the only layer left,
 * that removed the "you are here" marker altogether.
 *
 * A shadow paints outside the border box, above whatever the row is filled
 * with, costs no layout, and needs no stacking context to reason about. It is
 * also static here — the sweep is the only animated layer — so the usual
 * objection to animating `box-shadow` does not apply.
 */
function HeadGlow() {
  return (
    <>
      {/*
        The moving layer: a 200%-wide gradient sliding across a 1px frame.

        `padding-box`/`border-box` masking is what makes a gradient BORDER
        rather than a gradient fill — the two backgrounds are composited with
        `xor`, so the gradient survives only in the 1px band between the two
        boxes and the chip's own fill shows through the middle untouched.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px animate-lane-sweep rounded-[4px] p-px"
        style={{
          background:
            'linear-gradient(90deg, hsl(var(--lane-h) var(--lane-s) var(--lane-l) / 0) 0%, hsl(0 0% 100% / 0.85) 25%, hsl(var(--lane-h) var(--lane-s) var(--lane-l) / 0) 50%, hsl(0 0% 100% / 0.85) 75%, hsl(var(--lane-h) var(--lane-s) var(--lane-l) / 0) 100%)',
          backgroundSize: '200% 100%',
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
        }}
      />
    </>
  );
}

/**
 * What the chip's hover says.
 *
 * Replaces the native `title=` it used to carry, so the app has one hover story
 * rather than two: a `title` takes about a second to appear, cannot be raised
 * by keyboard at all, and paints in the OS's colours in the middle of a themed
 * window. It also lets the upstream state be laid out rather than crammed onto
 * one line with an arrow in it.
 */
function RefTooltip({ refItem }: { refItem: Ref }) {
  const upstream = refItem.upstream;
  return (
    <span className="block">
      <span className="block font-mono">{refItem.fullName}</span>
      {upstream ? (
        <span className="block text-muted-foreground">
          {upstream.gone
            ? `${upstream.name} — gone from the remote`
            : upstream.ahead === 0 && upstream.behind === 0
              ? `up to date with ${upstream.name}`
              : `${upstream.ahead > 0 ? `${upstream.ahead} ahead` : ''}${
                  upstream.ahead > 0 && upstream.behind > 0 ? ', ' : ''
                }${upstream.behind > 0 ? `${upstream.behind} behind` : ''} ${upstream.name}`}
        </span>
      ) : refItem.kind === 'localBranch' ? (
        <span className="block text-muted-foreground">no upstream configured</span>
      ) : null}
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
