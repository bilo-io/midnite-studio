import { useState, type ReactNode } from 'react';

import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

import { formatNumber } from '../../lib/format-number';
import { RUN_PHASE_LABEL, type RunPhase } from './run-groups';

/**
 * One status bucket's accordion — "3 in progress", "12 completed" — shared by
 * the Actions page and the commit CI modal so the two cannot drift apart.
 *
 * Open by default; the open state is local because a status bucket is a view
 * preference for the moment, not something worth persisting per repository the
 * way a workflow's collapsed state is.
 */
export function RunPhaseSection({
  phase,
  count,
  children,
}: {
  phase: RunPhase;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section data-run-phase={phase}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-semibold text-foreground/80 transition-colors hover:bg-accent/30"
      >
        {open ? (
          <LuChevronDown aria-hidden className="h-3 w-3 shrink-0" />
        ) : (
          <LuChevronRight aria-hidden className="h-3 w-3 shrink-0" />
        )}
        <span>{RUN_PHASE_LABEL[phase]}</span>
        <span className="ml-auto shrink-0 tabular-nums">{formatNumber(count)}</span>
      </button>
      {open ? children : null}
    </section>
  );
}
