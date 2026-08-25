import { useId, type ReactNode } from 'react';

import { Collapse } from '@bilo-io/ui';
import { ChevronRight } from 'lucide-react';

/**
 * A labelled, optionally collapsible group of rows.
 *
 * Promoted out of the status panel, which had the only copy of this heading
 * style, so the sidebar's Branches/Remotes/Tags/Worktrees sections and the
 * staged/unstaged lists share one visual grammar rather than two that drift.
 *
 * The body is wrapped in `<Collapse>` from `@bilo-io/ui` — it animates a
 * `0fr → 1fr` grid track, so the height transitions without anyone measuring
 * the content, and it marks the clipped region `inert` while closed. Without
 * that last part every control in a collapsed section stays in the tab order,
 * reachable by keyboard and readable by a screen reader while invisible.
 */
export function TreeSection({
  title,
  count,
  icon,
  action,
  collapsible = false,
  open = true,
  onToggle,
  hideWhenEmpty = true,
  indent = false,
  children,
}: {
  title: string;
  count?: number;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  /** A section with nothing in it is noise, not information. */
  hideWhenEmpty?: boolean;
  /** Nested inside a repo row, so the heading aligns with the tree. */
  indent?: boolean;
  children: ReactNode;
}) {
  const bodyId = useId();
  if (hideWhenEmpty && count === 0) return null;

  const heading = (
    <>
      {collapsible ? (
        <ChevronRight
          aria-hidden
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
            open ? 'rotate-90' : ''
          }`}
        />
      ) : null}
      {icon}
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {count === undefined ? null : (
        <span className="text-[11px] tabular-nums text-muted-foreground/70">{count}</span>
      )}
    </>
  );

  return (
    <section>
      <header className={`flex items-center gap-1.5 py-1 pr-2 ${indent ? 'pl-5' : 'pl-3'}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left transition-colors hover:text-foreground"
          >
            {heading}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">{heading}</span>
        )}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-auto shrink-0 rounded px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {action.label}
          </button>
        ) : null}
      </header>
      <Collapse open={!collapsible || open} id={bodyId} aria-label={title}>
        {children}
      </Collapse>
    </section>
  );
}
