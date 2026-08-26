import { GitPullRequest, Play, X } from 'lucide-react';
import { MdOutlineDifference } from 'react-icons/md';

import type { IconComponent } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';
import type { WorkbenchTab, WorkbenchTabKind } from '../../store/workbench-store';

/**
 * The content area's tab bar.
 *
 * Built rather than taken from `@bilo-io/ui`, whose `Tabs` is a segmented
 * control: it has no close affordance, no overflow behaviour and no notion of
 * a tab that outlives the click that made it. Those three are the whole
 * difference between a toggle and a document tab bar.
 *
 * The first tab is not in `tabs` and cannot be closed. The Changes view always
 * has a working-tree tab following the sidebar's selection — it is the view's
 * home, and a strip you can empty down to nothing is a view with no content.
 */
const KIND_ICON: Record<WorkbenchTabKind, IconComponent> = {
  'all-changes': MdOutlineDifference,
  run: Play,
  review: GitPullRequest,
};

export function TabStrip({
  tabs,
  activeTabId,
  workingTreeLabel,
  onFocus,
  onClose,
}: {
  tabs: readonly WorkbenchTab[];
  /** `null` is the permanent working-tree tab. */
  activeTabId: string | null;
  workingTreeLabel: string;
  onFocus: (id: string | null) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Open views"
      // `overflow-x-auto` rather than a dropdown for the overflow: a horizontal
      // scroll keeps every tab reachable at any count without inventing a
      // second navigation surface for the rare case.
      className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card/40"
    >
      <Tab
        icon={MdOutlineDifference}
        label={workingTreeLabel}
        title="Working tree — follows the checkout selected in the sidebar"
        active={activeTabId === null}
        onFocus={() => onFocus(null)}
      />
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          icon={KIND_ICON[tab.kind]}
          label={tab.label}
          title={tab.label}
          active={activeTabId === tab.id}
          onFocus={() => onFocus(tab.id)}
          onClose={() => onClose(tab.id)}
        />
      ))}
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
}: {
  icon: IconComponent;
  label: string;
  title: string;
  active: boolean;
  onFocus: () => void;
  /** Absent on the working-tree tab, which has nothing to close to. */
  onClose?: () => void;
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
          <X aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
