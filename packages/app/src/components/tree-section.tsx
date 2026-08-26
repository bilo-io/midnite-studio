import { useId, type ReactNode } from 'react';

import { Collapse } from '@bilo-io/ui';
import { ChevronRight } from 'lucide-react';

import { IconButton, type IconComponent } from './icon-button';

/**
 * A labelled, optionally collapsible group of rows.
 *
 * Promoted out of the status panel, which had the only copy of this heading
 * style, so the sidebar's Local/Remotes/Tags/Worktrees sections and the
 * staged/unstaged lists share one visual grammar rather than two that drift.
 *
 * The body is wrapped in `<Collapse>` from `@bilo-io/ui` — it animates a
 * `0fr → 1fr` grid track, so the height transitions without anyone measuring
 * the content, and it marks the clipped region `inert` while closed. Without
 * that last part every control in a collapsed section stays in the tab order,
 * reachable by keyboard and readable by a screen reader while invisible.
 */
/** Tailwind can't build class names at runtime, so the map is spelled out. */
const HEADER_INDENT = ['pl-3', 'pl-4', 'pl-8'] as const;

export function TreeSection({
  title,
  count,
  icon,
  meta,
  action,
  collapsible = false,
  open = true,
  onToggle,
  hideWhenEmpty = true,
  depth = 0,
  children,
}: {
  title: string;
  count?: number;
  icon?: ReactNode;
  /**
   * Read-only detail pushed to the right of the heading, before the action.
   *
   * The Changes panel puts its `+n −n` roll-up here. Outside the heading button
   * so the accessible name of a collapsible section stays "Staged 4" rather
   * than growing a pair of numbers that are visible text beside it.
   */
  meta?: ReactNode;
  /**
   * A single trailing control on the heading row.
   *
   * With an `icon` it renders as an `IconButton`, so the label becomes the
   * tooltip and the accessible name rather than visible text — which is what a
   * heading needs when the label is a sentence ("Open bilo-io/midnite-git on
   * github.com") that would otherwise push the row's own title out of view.
   */
  action?: { label: string; onClick: () => void; icon?: IconComponent };
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  /** A section with nothing in it is noise, not information. */
  hideWhenEmpty?: boolean;
  /**
   * How deep in a tree the heading sits — 0 is a top-level panel section, 1 a
   * repository's subsection, 2 a group inside one of those. Each step indents
   * the chevron far enough that the heading lands left of its own rows, which
   * is what makes the nesting readable without guide lines.
   */
  depth?: 0 | 1 | 2;
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
      <header className={`flex items-center gap-1.5 py-1 pr-2 ${HEADER_INDENT[depth]}`}>
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
        {/* `ml-auto` on BOTH this and the action: the first one absorbs the free
            space, so the second has none left and the two sit adjacent at the
            right edge — no conditional class needed for either arrangement. */}
        {meta ? <span className="ml-auto shrink-0 pl-2">{meta}</span> : null}
        {action ? (
          action.icon ? (
            <span className="ml-auto shrink-0">
              <IconButton
                icon={action.icon}
                label={action.label}
                size="sm"
                onClick={action.onClick}
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="ml-auto shrink-0 rounded px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {action.label}
            </button>
          )
        ) : null}
      </header>
      <Collapse open={!collapsible || open} id={bodyId} aria-label={title}>
        {children}
      </Collapse>
    </section>
  );
}
