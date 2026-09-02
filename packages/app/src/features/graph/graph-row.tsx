import type { GraphRow, Ref } from '@midnite/studio-shared';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from '../../components/tooltip';
import { useCommitDnd, useRefDnd } from './graph-dnd';
import { GraphSvg } from './graph-svg';
import { CONNECTOR_OPACITY, RAIL_WIDTH, showsAuthorColumn, type GraphTheme } from './graph-themes';
import { laneColor, laneVars } from './lane-colors';
import { RefBadge } from './ref-badge';
import { badgeActions, type SyncAction } from './ref-sync';

/**
 * One commit row: lane graphic, ref badges, subject, author, date.
 *
 * Memoised because a streaming log re-renders the list on every 500-row batch —
 * around a hundred times for a large repo — and without this every visible row
 * re-renders each time.
 */
export type GraphRowProps = {
  row: GraphRow;
  refs: readonly Ref[];
  selected: boolean;
  /**
   * Painted width of the lane gutter, and the spacing between lanes inside it.
   *
   * Both live values, not derived from the theme: the gutter is a resizable
   * column, so dragging it narrower closes the lanes up and slides the indented
   * ones left. One pair for the whole list — a per-row width would make the
   * subject column jog as the graph narrows and widens while you scroll.
   *
   * They are the only geometry the row takes as props rather than as a CSS
   * variable, and they do bust this component's memo on every pointermove of a
   * gutter drag. That is a real cost paid deliberately: SVG coordinates are
   * attributes, not styles, so no custom property can reach them, and the drag
   * re-renders only the ~30 rows the virtualizer has mounted.
   */
  gutterWidth: number;
  laneWidth: number;
  theme: GraphTheme;
  /** Id of the list-level avatar clip path. */
  clipId: string;
  /** Author-filtered out — drawn back, never removed. */
  dimmed: boolean;
  /**
   * The lane the selected commit sits on, or `null` when nothing is selected.
   *
   * Every mounted row takes it, not just the selected one: the highlight is a
   * property of the BRANCH, so the rows above and below the selection that
   * share its lane are exactly the ones that have to light up too. It does bust
   * this component's memo for all ~30 mounted rows on each selection change —
   * cheap next to the streaming re-renders the memo actually exists for, and
   * unavoidable, since no row can tell on its own whether it is on the lane.
   */
  glowColorIdx?: number | null;
  onSelect: (sha: string) => void;
  onContextMenu: (event: React.MouseEvent, row: GraphRow) => void;
  onRefContextMenu: (event: React.MouseEvent, ref: Ref) => void;
  /** Double-clicking a branch badge checks it out — the GitKraken gesture. */
  onRefActivate: (ref: Ref) => void;
  /**
   * The sync verbs a ref may run, derived once in `useGraphActions`.
   *
   * Passed as a function rather than as resolved arrays because most rows have
   * no refs at all: resolving per row in the parent would allocate for 50 000
   * commits to serve the handful that carry a branch.
   */
  syncFor: (ref: Ref, currentBranch: string | null) => SyncAction[];
  onSync: (ref: Ref, action: SyncAction) => void;
  /** Verb in flight per ref `fullName`. Several refs may sync at once. */
  syncing: Record<string, SyncAction['kind']>;
  /** HEAD's branch, which decides whether a pull is offered. */
  currentBranch: string | null;
  /** Check if an agent is active on a ref's worktree. */
  isAgentActive?: (ref: Ref) => boolean;
};

function GraphRowInner({
  row,
  refs,
  selected,
  gutterWidth,
  laneWidth,
  theme,
  clipId,
  dimmed,
  glowColorIdx = null,
  onSelect,
  onContextMenu,
  onRefContextMenu,
  onRefActivate,
  syncFor,
  onSync,
  syncing,
  currentBranch,
  isAgentActive,
}: GraphRowProps) {
  // `refs` arrives sorted by importance (HEAD, locals, remotes, tags), so the
  // slice keeps the ref you most need to see and buries the ones you don't.
  const shown = refs.length > REF_CHIP_CAP ? refs.slice(0, REF_CHIP_CAP) : refs;
  const hidden = refs.length > REF_CHIP_CAP ? refs.slice(REF_CHIP_CAP) : EMPTY_REFS;

  // The row's own node sits on the lit lane — as opposed to merely having one
  // of its edges pass through it, which the SVG decides for itself.
  const onGlowingLane = glowColorIdx !== null && row.colorIdx === glowColorIdx;

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={-1}
      onClick={() => onSelect(row.commit.sha)}
      onContextMenu={(event) => {
        event.preventDefault();
        // Right-click selects too, so the detail pane matches the menu's target.
        onSelect(row.commit.sha);
        onContextMenu(event, row);
      }}
      className={`graph-row relative flex cursor-default items-center gap-2 pr-3 text-sm transition-colors ${
        selected ? '' : 'hover:bg-accent/30'
      } ${dimmed ? 'opacity-40' : ''}`}
      /*
        The lane's hue as three components, on every row — the selected tint,
        the ink and the rail halo are all built from it in `styles.css`, and a
        finished `hsl()` string cannot be taken apart again in CSS.

        Set unconditionally rather than only when selected, so selecting a row
        changes one attribute rather than rewriting its inline style.
      */
      style={{ ...laneVars(row.colorIdx, theme.palette), height: theme.rowHeight }}
    >
      {/*
        The selection indicator bar: 3px strip on the left edge.

        A left border on the row itself would shift its contents right by 3px on
        selection; a separate element means the text stays still. It paints
        before any tint is, because it is the only thing in the column and the
        eye is already there.

        Taking the lane's hue rather than `--primary` means selecting a row also
        restates which branch it landed on — the same colour-matching argument
        that puts the ref chips in the lane colour, applied to the one row the
        user has actually asked about.

        Absolutely positioned inside the row's existing left padding, so it
        costs no layout and the BRANCH / TAG column keeps every pixel.
      */}
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: laneColor(row.colorIdx, theme.palette) }}
        />
      ) : null}
      {/*
        BRANCH / TAG, in its own column so labels line up vertically instead of
        floating at whatever horizontal position each subject happens to start.
        Most commits have none, and the empty cell is the price of the ones that
        do being scannable.
      */}
      <div
        className="flex shrink-0 items-center gap-1 overflow-hidden pl-2"
        style={{ width: 'var(--col-branch-tag)' }}
      >
        {shown.map((ref) => (
          <DraggableRefBadge
            key={ref.fullName}
            refItem={ref}
            rowId={row.commit.sha}
            colorIdx={row.colorIdx}
            palette={theme.palette}
            actions={badgeActions(syncFor(ref, currentBranch))}
            crowded={shown.length > 1}
            onSync={(action) => onSync(ref, action)}
            syncing={syncing[ref.fullName] ?? null}
            agentActive={isAgentActive ? isAgentActive(ref) : false}
            onContextMenu={(event) => {
              // Stop the row's own menu opening as well — the badge's menu is
              // the more specific target the user aimed at.
              event.preventDefault();
              event.stopPropagation();
              onRefContextMenu(event, ref);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onRefActivate(ref);
            }}
          />
        ))}

        {/*
          The overflow counter, GitKraken's answer to a commit that multiple refs
          point at. Clicking opens a dropdown showing all hidden refs with their
          specific lane colors and agent glow if active.
        */}
        {hidden.length > 0 ? (
          <RefOverflowButton
            refs={hidden}
            colorIdx={row.colorIdx}
            palette={theme.palette}
            onRefContextMenu={onRefContextMenu}
            onRefActivate={onRefActivate}
            isAgentActive={isAgentActive}
          />
        ) : null}

        {/*
          The chip's half of the leader line: a rule stretching to the column's
          right edge, where `GraphSvg` picks it up and carries it across the
          row's gap to the node. Two halves rather than one element because the
          left half has to start after chips of unknown width — which is exactly
          what `flex-1` solves and what an SVG with a fixed viewBox cannot.

          `min-w-0`, so a row whose chips already fill the column gives up the
          rule entirely instead of squeezing the names it exists to point at.
        */}
        {refs.length > 0 ? (
          <span
            aria-hidden
            className="min-w-0 flex-1"
            style={{
              height: theme.strokeWidth,
              backgroundColor: laneColor(row.colorIdx, theme.palette),
              opacity: CONNECTOR_OPACITY,
            }}
          />
        ) : null}
      </div>

      {/*
        The lane gutter doubles as the commit's drag handle. Dragging from the
        subject text would fight text selection, and the node is the thing that
        visually *is* the commit.
      */}
      <CommitDragHandle sha={row.commit.sha} subject={row.commit.subject}>
        {/*
          The bubble names the author, so the tooltip is what replaced the
          Author column rather than a decoration on top of it.
        */}
        <Tooltip
          label={
            <span className="block">
              <span className="block font-medium">{row.commit.authorName}</span>
              <span className="block text-muted-foreground">{row.commit.authorEmail}</span>
              <span className="block text-muted-foreground">
                {new Date(row.commit.authorDate * 1000).toLocaleString()}
              </span>
            </span>
          }
        >
          {/* `flex`, not `inline-flex` — see the note on the SVG's own `block`. */}
          <span className="flex">
            <GraphSvg
              row={row}
              width={gutterWidth}
              theme={theme}
              laneWidth={laneWidth}
              clipId={clipId}
              dimmed={dimmed}
              connector={refs.length > 0}
              glowColorIdx={glowColorIdx}
            />
          </span>
        </Tooltip>
      </CommitDragHandle>

      {/*
        GitKraken's rail: a bar in the lane's colour standing between the graph
        and the message, so the subject you are reading is tied to the branch it
        landed on without your eye travelling back to the node.
      */}
      {theme.node === 'avatar' ? (
        <span
          aria-hidden
          data-graph-rail
          className={`shrink-0 rounded-full transition-opacity duration-150 ease-in-out ${
            dimmed ? 'opacity-40' : ''
          } ${onGlowingLane ? 'graph-rail-glow' : ''}`}
          style={{
            width: RAIL_WIDTH,
            // Full row height, so a run of commits on one branch reads as one
            // continuous rail rather than a column of ticks.
            height: theme.rowHeight,
            backgroundColor: laneColor(row.colorIdx, theme.palette),
          }}
        />
      ) : null}

      {/*
        `overflow-hidden` plus a shrinkable badge group, not just `truncate` on
        the subject. Long branch names are the norm, and a row carrying two of
        them (`feature/x` + `origin/feature/x`) otherwise pushes straight
        through the author and date columns — the badges are the widest thing in
        the row and nothing was allowed to give.
      */}
      <div
        className={`flex min-w-0 flex-1 items-center overflow-hidden transition-opacity duration-150 ease-in-out ${
          dimmed ? 'opacity-40' : ''
        }`}
      >
        <span
          className={`graph-row-ink min-w-0 flex-1 truncate ${
            selected ? '' : 'text-muted-foreground'
          }`}
        >
          <CommitSubject subject={row.commit.subject} />
        </span>
      </div>

      {/*
        Widths arrive as custom properties set on the scroll container, not as
        props. This component is memoised because a streaming log re-renders the
        list on every 500-row batch; a width prop would bust that memo on every
        pointermove of a column drag and push every visible row through React at
        60Hz. A variable repaints without React seeing it.

        The Author column exists only where the node is a plain dot. The four
        avatar styles have the author's face in the graph itself, and its
        tooltip carries the name — a column repeating it would be the widest
        redundancy in the table.
      */}
      {showsAuthorColumn(theme) ? (
        <span
          className={`graph-row-ink shrink-0 truncate text-right text-xs text-muted-foreground transition-opacity duration-150 ease-in-out ${
            dimmed ? 'opacity-40' : ''
          }`}
          style={{ width: 'var(--col-author)' }}
        >
          {row.commit.authorName}
        </span>
      ) : null}
      <span
        className={`graph-row-ink shrink-0 text-right text-xs tabular-nums text-muted-foreground transition-opacity duration-150 ease-in-out ${
          dimmed ? 'opacity-40' : ''
        }`}
        style={{ width: 'var(--col-date)' }}
      >
        {formatDate(row.commit.committerDate)}
      </span>
      <span
        className={`graph-row-ink shrink-0 text-right font-mono text-xs text-muted-foreground transition-opacity duration-150 ease-in-out ${
          dimmed ? 'opacity-40' : ''
        }`}
        style={{ width: 'var(--col-sha)' }}
      >
        {row.commit.sha.slice(0, 7)}
      </span>
    </div>
  );
}

/**
 * A badge that is both a drag source and a drop target.
 *
 * Split into its own component because `useRefDnd` is a hook and the badges are
 * rendered in a map — the alternative is one hook call per possible badge,
 * which the rules of hooks forbid.
 */
function CommitDragHandle({
  sha,
  subject,
  children,
}: {
  sha: string;
  subject: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useCommitDnd(sha, subject);
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // `flex`, so the handle is exactly as tall as the gutter it wraps and
      // nothing inside it can be pushed off-centre by a line box.
      className={`flex shrink-0 items-center ${isDragging ? 'opacity-40' : ''}`}
    >
      {children}
    </span>
  );
}

function DraggableRefBadge({
  refItem,
  rowId,
  colorIdx,
  palette,
  actions,
  crowded,
  onSync,
  syncing,
  agentActive,
  onContextMenu,
  onDoubleClick,
}: {
  refItem: Ref;
  rowId: string;
  colorIdx: number;
  palette: GraphTheme['palette'];
  actions: SyncAction[];
  crowded: boolean;
  onSync: (action: SyncAction) => void;
  syncing: SyncAction['kind'] | null;
  agentActive?: boolean;
  onContextMenu: (event: React.MouseEvent) => void;
  onDoubleClick: (event: React.MouseEvent) => void;
}) {
  const { draggable, droppable } = useRefDnd(refItem, rowId);

  return (
    <RefBadge
      refItem={refItem}
      colorIdx={colorIdx}
      palette={palette}
      actions={actions}
      crowded={crowded}
      onSync={onSync}
      syncing={syncing}
      agentActive={agentActive}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      dnd={{
        setNodeRef: (node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        },
        listeners: (draggable.listeners ?? {}) as Record<string, unknown>,
        attributes: draggable.attributes as unknown as Record<string, unknown>,
        isOver: droppable.isOver,
        isDragging: draggable.isDragging,
      }}
    />
  );
}

/**
 * Overflow button and interactive dropdown popover for commits with > 2 refs.
 * Shows each hidden branch in its lane colour with agent glow if active.
 */
function RefOverflowButton({
  refs,
  colorIdx,
  palette,
  onRefContextMenu,
  onRefActivate,
  isAgentActive,
}: {
  refs: readonly Ref[];
  colorIdx: number;
  palette: GraphTheme['palette'];
  onRefContextMenu: (event: React.MouseEvent, ref: Ref) => void;
  onRefActivate: (ref: Ref) => void;
  isAgentActive?: (ref: Ref) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const toggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ x: rect.left, y: rect.bottom + 4 });
    setOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
      close();
    };
    const handleScroll = () => close();

    window.addEventListener('pointerdown', handleDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handleDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll, true);
    };
  }, [open, close]);

  const hasActiveAgent = isAgentActive ? refs.some((r) => isAgentActive(r)) : false;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title={refs.map((ref) => ref.name).join('\n')}
        className={`shrink-0 rounded-[3px] border px-1 py-px text-[11px] leading-4 transition-colors ${
          hasActiveAgent
            ? 'border-primary/60 bg-primary/20 text-primary font-medium shadow-[0_0_6px_rgba(var(--primary),0.3)]'
            : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        +{refs.length}
      </button>

      {open && coords
        ? createPortal(
            <div
              role="dialog"
              aria-label="Overflow branches"
              onClick={(e) => e.stopPropagation()}
              style={{ left: coords.x, top: coords.y }}
              className="fixed z-popover flex max-h-64 min-w-[180px] max-w-xs flex-col gap-1.5 overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-xl animate-fade-in"
            >
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Other branches ({refs.length})
              </div>
              <div className="flex flex-col gap-1">
                {refs.map((ref) => {
                  const active = isAgentActive ? isAgentActive(ref) : false;
                  return (
                    <div
                      key={ref.fullName}
                      className="flex items-center gap-1.5 rounded p-0.5 hover:bg-accent/40"
                    >
                      <RefBadge
                        refItem={ref}
                        colorIdx={colorIdx}
                        palette={palette}
                        agentActive={active}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          close();
                          onRefContextMenu(event, ref);
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          close();
                          onRefActivate(ref);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Chips drawn before the overflow counter takes over.
 *
 * Two, because that is what the default 180px column holds without either name
 * truncating to nothing: the pair that matters is nearly always a local branch
 * and its remote-tracking twin.
 */
const REF_CHIP_CAP = 2;

const EMPTY_REFS: readonly Ref[] = [];

export const CommitGraphRow = memo(GraphRowInner);

/**
 * A subject rendered as conventional-commit type/scope, bolded, then the rest.
 *
 * `git log`, not the app, decides whether a subject looks like `feat(x): ...` —
 * so this only bolds up to the first colon when one is present, and falls back
 * to plain text for anything else (merge subjects, fixups, a bare sentence).
 */
function CommitSubject({ subject }: { subject: string }) {
  const prefix = conventionalPrefix(subject);
  if (prefix === null) return <>{subject}</>;

  return (
    <>
      <span className="font-semibold">{subject.slice(0, prefix.length)}</span>
      {subject.slice(prefix.length)}
    </>
  );
}

/**
 * The `type(scope):` lead of a conventional-commit subject, colon included, or
 * `null` when the subject doesn't start with one.
 *
 * Exported for the unit test rather than inlined into `CommitSubject`, since
 * "what counts as a conventional prefix" is the one piece of logic here worth
 * pinning down independently of rendering.
 */
export function conventionalPrefix(subject: string): string | null {
  const colon = subject.indexOf(':');
  if (colon <= 0) return null;
  return subject.slice(0, colon + 1);
}

/**
 * Relative for anything under a week, absolute beyond it.
 *
 * "3 days ago" answers the question people actually ask of recent history,
 * while an exact date is what matters once a commit is old enough that the
 * relative form ("47 weeks ago") stops meaning anything.
 */
export function formatDate(unixSeconds: number): string {
  const then = unixSeconds * 1000;
  const deltaMs = Date.now() - then;
  const minutes = Math.floor(deltaMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
