import type { ReactNode } from 'react';

import { MoreVertical } from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';

/**
 * The chrome every tile shares: a heading, a drag handle, and a ⋮ menu.
 *
 * The heading is a real `<h3>` inside a `<section>` with an accessible name, so
 * the board is a list of landmarks a screen reader can jump between rather than
 * one undifferentiated region of numbers. That, plus the Move up / Move down
 * items in the menu, is what keeps the board usable without dragging — a
 * pointer gesture cannot be the only way to reorder.
 *
 * Only the HEADER drags. `react-grid-layout` is told `draggableHandle`, because
 * a whole-tile drag makes every link and every row inside a widget
 * unclickable — the pointerdown starts a drag instead of a click.
 */
export const DRAG_HANDLE_CLASS = 'dashboard-drag-handle';

/**
 * Marks the controls inside the drag handle that must stay clickable.
 *
 * The header IS the handle, so without an explicit opt-out the grid claims the
 * pointerdown on the ⋮ button and the click never lands — the menu simply never
 * opens. `dragConfig.cancel` is the library's own answer to that, and it takes
 * a selector, which is why this is a class rather than a handler.
 */
export const NO_DRAG_CLASS = 'dashboard-no-drag';

export function WidgetFrame({
  title,
  menu,
  children,
}: {
  title: string;
  menu: MenuItem[];
  children: ReactNode;
}) {
  const dialogs = useDialogs();

  return (
    <section
      aria-label={title}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <header
        className={`${DRAG_HANDLE_CLASS} flex shrink-0 cursor-grab items-center gap-2 border-b border-border px-3 py-2 active:cursor-grabbing`}
        onContextMenu={(event) => {
          event.preventDefault();
          dialogs.openMenu(event, menu);
        }}
      >
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {/*
          Opted out of the drag handle it sits inside — see NO_DRAG_CLASS.
        */}
        <div className={`${NO_DRAG_CLASS} flex shrink-0 items-center gap-1`}>
          <IconButton
            icon={MoreVertical}
            label={`${title} options`}
            size="sm"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              dialogs.openMenu(
                { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom },
                menu,
              );
            }}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

/**
 * The three states every widget has to be able to be in.
 *
 * One component rather than three per widget, because the distinctions are the
 * same everywhere and getting them wrong is the same mistake everywhere: a repo
 * cloned five minutes ago has no year of history, and rendering that as a
 * spinner that never resolves — or as an error — is the difference between a
 * new user thinking the app is broken and thinking the repo is new.
 */
export function WidgetState({
  loading,
  error,
  empty,
  emptyLabel,
  children,
}: {
  loading: boolean;
  error?: string | null;
  empty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  if (loading) return <WidgetSkeleton />;
  if (error) {
    return (
      <p className="px-1 py-2 text-xs leading-relaxed text-destructive" role="status">
        {error}
      </p>
    );
  }
  if (empty) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground" role="status">
        {emptyLabel}
      </p>
    );
  }
  return <>{children}</>;
}

/** Three shimmering bars — enough to say "measuring", not enough to imply shape. */
function WidgetSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2 pt-1">
      {[70, 45, 60].map((width) => (
        <div
          key={width}
          className="h-3 animate-pulse rounded bg-muted"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

/** A label-over-number stat, the unit the health tiles are built from. */
export function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-border/60 px-3 py-2 text-center">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {sublabel ? <span className="text-[10px] text-muted-foreground/80">{sublabel}</span> : null}
    </div>
  );
}
