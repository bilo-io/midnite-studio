import type { ReactNode } from 'react';
import { LuDatabase, LuPlus, LuX } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';
import type { WorkbenchTab } from '../../store/workbench-store';

/**
 * The Database view's query-tab bar.
 *
 * Built rather than taken from `@bilo-io/ui`, whose `Tabs` is a segmented
 * control: it has no close affordance, no overflow behaviour and no notion of
 * a tab that outlives the click that made it. Those three are the whole
 * difference between a toggle and a document tab bar.
 *
 * It used to be the Changes view's workbench strip too, with a permanent
 * working-tree first tab; that view folded into the git graph.
 */
export function TabStrip({
  tabs,
  activeTabId,
  onFocus,
  onClose,
  onNew,
  dirtyTabIds,
}: {
  tabs: readonly WorkbenchTab[];
  activeTabId: string | null;
  onFocus: (id: string | null) => void;
  onClose: (id: string) => void;
  /** Renders a trailing `+` button when supplied — the Database strip's "new query tab". */
  onNew?: () => void;
  /** Tab ids showing the unsaved-dot (Theme G) — a query tab whose SQL changed since it last ran. */
  dirtyTabIds?: ReadonlySet<string>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Open views"
      // `overflow-x-auto` rather than a dropdown for the overflow: a horizontal
      // scroll keeps every tab reachable at any count without inventing a
      // second navigation surface for the rare case.
      className="flex shrink-0 items-stretch overflow-x-auto bg-card/40"
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          icon={LuDatabase}
          label={tab.label}
          title={tab.label}
          active={activeTabId === tab.id}
          onFocus={() => onFocus(tab.id)}
          onClose={() => onClose(tab.id)}
          stats={
            dirtyTabIds?.has(tab.id) ? (
              <span aria-label="Unsaved changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" />
            ) : null
          }
        />
      ))}
      {onNew ? (
        <button
          type="button"
          onClick={onNew}
          aria-label="New query tab"
          className="flex shrink-0 items-center px-2 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          <LuPlus aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function Tab({
  icon: Icon,
  label,
  title,
  active,
  onFocus,
  onClose,
  stats,
}: {
  icon: IconComponent;
  label: string;
  title: string;
  active: boolean;
  onFocus: () => void;
  onClose?: () => void;
  /** Rendered ahead of the close button — the dirty dot. */
  stats?: ReactNode;
}) {
  return (
    <div
      className={`group flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-background text-foreground shadow-[inset_0_-2px_0_0_hsl(var(--primary))]'
          : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'
      }`}
    >
      <Tooltip label={title}>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          onClick={onFocus}
          /*
            Middle-click closes, the way every editor with tabs behaves.
            `onAuxClick` rather than `onMouseDown`, so it cannot fire while the
            pointer is merely passing over a tab during a drag.
          */
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              onClose?.();
            }
          }}
          className="flex min-w-0 max-w-[16rem] items-center gap-1.5"
        >
          <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </Tooltip>

      {stats}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label}`}
          /*
            Revealed on hover, but always present for the ACTIVE tab: the tab
            you are looking at is the one you are most likely to close, and
            hunting for a control that only appears under the pointer is the
            small friction every editor avoids here.
          */
          className={`shrink-0 rounded p-0.5 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${
            active ? '' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <LuX aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
