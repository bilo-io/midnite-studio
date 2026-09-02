import { useState } from 'react';

import type { IconComponent } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';

import { showsName } from './status-toggle-label';

export type StatusToggleProps = {
  /** `data-testid` on the button — the id every existing spec already uses. */
  testId: string;
  icon: IconComponent;
  /** Extra classes on the glyph — e.g. the Git mark's literal orange. */
  iconClassName?: string;
  /** The surface's name, shown while active or hovered. */
  name: string;
  /** Already platform-rendered — pass `displayChord(...)`, not a raw chord. */
  chord: string;
  /** Whether the surface this toggle controls is open. */
  active: boolean;
  onToggle: () => void;
  /** The accessible name. Distinct from `name`, which is decorative text. */
  ariaLabel: string;
  /** Full tooltip sentence, including the chord. */
  tooltip: string;
};

/**
 * One button in the status bar's shortcut rail.
 *
 * Before this phase `repos-toggle`, `terminal-toggle` and `browser-toggle` were
 * three verbatim copies of these twenty lines — same `Tooltip`, same
 * `aria-pressed`, same `.status-label` name, same chord span — with nothing
 * enforcing that they stayed identical, and they had already diverged: two of
 * them hard-coded `⌘`+letter in JSX while the third called `displayChord`, so
 * the same commands read `⌘G`/`⌘B` on a Linux box where they are `Ctrl+G` and
 * `Ctrl+B`. Phase 39 was going to make that five copies.
 *
 * **The name is shown only while the surface is open or the toggle is
 * hovered/focused.** At rest you read the chord, which is the rail's entire
 * purpose: the bottom left teaches its own shortcuts by being looked at. See
 * [`status-toggle-label.ts`](./status-toggle-label.ts) for why that decision is
 * in JS while the density half of it stays in CSS.
 *
 * Hover is tracked in React state rather than with CSS `:hover` because the
 * name's presence changes the button's width, and the width is what
 * `useOverflow` measures — a `:hover` rule would move layout underneath a
 * measurement that has no way to know it happened. Focus counts as hover, so
 * tabbing the rail reveals names for a keyboard user.
 */
export function StatusToggle({
  testId,
  icon: Icon,
  iconClassName = '',
  name,
  chord,
  active,
  onToggle,
  ariaLabel,
  tooltip,
}: StatusToggleProps) {
  const [hovered, setHovered] = useState(false);
  const named = showsName({ active, hovered });

  return (
    <Tooltip label={tooltip} side="top">
      <button
        type="button"
        data-testid={testId}
        onClick={onToggle}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-label={ariaLabel}
        aria-pressed={active}
        className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
          active ? 'bg-accent text-foreground' : ''
        }`}
      >
        <Icon aria-hidden className={`mr-1 inline h-3.5 w-3.5 align-[-2px] ${iconClassName}`} />
        {/*
          `hidden` rather than a conditional render: the element stays in the
          tree, so `.status-label`'s density rule and this state rule are
          independent gates on one node instead of two mechanisms racing to
          own the same text. A plain `<span>` carries no display utility, so
          the UA's `[hidden] { display: none }` is not overridden.
        */}
        <span className="status-label" hidden={!named}>
          {name}
        </span>
        <span className="status-chord ml-1.5 opacity-70">{chord}</span>
      </button>
    </Tooltip>
  );
}
