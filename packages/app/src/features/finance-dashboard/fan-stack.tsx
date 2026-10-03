import { useEffect, useRef, useState, type ReactNode } from 'react';

import { LuChevronsUpDown } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';

/**
 * A stack of cards that fans out.
 *
 * Collapsed, the cards overlap like a wallet — the first (front) card whole,
 * the ones behind it showing a strip of their top edge. Hovering the stack, or
 * clicking it (which pins it open), slides every card to its own row.
 *
 * Positions are plain `top` offsets with a CSS transition rather than an
 * animation library: it is one number per card, and a transition on `top`
 * respects the app's reduced-motion guard (`styles.css`) for free. The
 * container's height is animated with them, so the cards below the stack are
 * pushed rather than overlapped.
 *
 * Only the front few cards get their own strip when collapsed (`MAX_PEEK`);
 * a wallet of twelve would otherwise be a staircase taller than its own fan.
 */
const MAX_PEEK = 3;

export type FanStackProps<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderCard: (item: T, state: { index: number; front: boolean; expanded: boolean }) => ReactNode;
  cardHeight: number;
  /** Visible strip of each card behind the front one, collapsed. */
  peek?: number;
  /** Space between cards, fanned out. */
  gap?: number;
  label: string;
};

export function FanStack<T>({ items, keyOf, renderCard, cardHeight, peek = 30, gap = 10, label }: FanStackProps<T>) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = pinned || hover;
  const n = items.length;

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const depth = Math.min(Math.max(n - 1, 0), MAX_PEEK);
  const collapsedTop = (index: number): number => Math.max(0, depth - index) * peek;
  const expandedTop = (index: number): number => index * (cardHeight + gap);

  const collapsedHeight = depth * peek + cardHeight;
  const expandedHeight = n * cardHeight + Math.max(n - 1, 0) * gap;
  const height = n === 0 ? 0 : expanded ? expandedHeight : collapsedHeight;

  return (
    <div className="flex flex-col gap-1.5">
      {n > 1 ? (
        <div className="flex items-center justify-end">
          <IconButton
            icon={LuChevronsUpDown}
            label={pinned ? `Collapse ${label}` : `Fan out ${label}`}
            size="sm"
            aria-pressed={pinned}
            onClick={() => setPinned((value) => !value)}
          />
        </div>
      ) : null}
      <div
        role="group"
        aria-label={label}
        data-expanded={expanded}
        className="relative w-full transition-[height] duration-300 ease-out"
        style={{ height }}
        onMouseEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setHover(true);
        }}
        onMouseLeave={() => {
          // A short grace period: the cards move under the pointer as they fan, and a leave
          // fired by a card sliding out from under it would otherwise collapse the stack at once.
          leaveTimer.current = setTimeout(() => setHover(false), 140);
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-no-toggle]')) return;
          setPinned((value) => !value);
        }}
      >
        {items.map((item, index) => (
          <div
            key={keyOf(item)}
            className="absolute inset-x-0 transition-[top,transform,opacity] duration-300 ease-out"
            style={{
              top: expanded ? expandedTop(index) : collapsedTop(index),
              height: cardHeight,
              zIndex: n - index,
              // Cards past the visible strips sit behind the last strip, unseen.
              opacity: expanded || index <= MAX_PEEK ? 1 : 0,
              pointerEvents: expanded || index <= MAX_PEEK ? undefined : 'none',
            }}
          >
            {renderCard(item, { index, front: index === 0, expanded })}
          </div>
        ))}
      </div>
    </div>
  );
}
