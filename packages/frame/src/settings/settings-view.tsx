import { useState } from 'react';

import { Collapse } from '@bilo-io/ui';
import { LuChevronDown } from 'react-icons/lu';

import { ResizeHandle } from '../layout/resizable/resize-handle';
import { useResizable } from '../layout/resizable/use-resizable';
import {
  SETTINGS_GROUPS,
  type SettingsGroupId,
  type SettingsPageDef,
  type SettingsPageKey,
} from './settings-pages';

/**
 * Settings, as pages behind an inner sidebar (Phase 16, moved to the frame by Phase 123 Theme L.3).
 *
 * The rail stays view navigation; this page list is one view's internal structure. Every piece of state is
 * controllable — Studio keeps its page, folded groups and nav width in its `ui-store` — and falls back to
 * local state when the caller passes none, which is what an app with no store of its own does.
 */
export type SettingsViewProps = {
  pages: readonly SettingsPageDef[];
  activePage?: SettingsPageKey;
  onPageChange?: (id: SettingsPageKey) => void;
  collapsedGroups?: readonly SettingsGroupId[];
  onToggleGroup?: (id: SettingsGroupId) => void;
  navWidth?: number;
  onNavWidthChange?: (width: number) => void;
};

const NAV_WIDTH = { initial: 224, min: 160, max: 360 } as const;

function PageLink({
  page,
  active,
  onSelect,
}: {
  page: SettingsPageDef;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = page.icon;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
      title={page.label}
      className={`flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        active
          ? 'bg-primary/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{page.label}</span>
    </button>
  );
}

export function SettingsView(props: SettingsViewProps) {
  const { pages } = props;
  const [localPage, setLocalPage] = useState<SettingsPageKey | undefined>(undefined);
  const [localCollapsed, setLocalCollapsed] = useState<readonly SettingsGroupId[]>([]);
  const [localWidth, setLocalWidth] = useState<number>(NAV_WIDTH.initial);

  const page = props.activePage ?? localPage ?? pages[0]?.id;
  const collapsed = props.collapsedGroups ?? localCollapsed;
  const select = (id: SettingsPageKey) =>
    props.onPageChange ? props.onPageChange(id) : setLocalPage(id);
  const toggle = (id: SettingsGroupId) =>
    props.onToggleGroup
      ? props.onToggleGroup(id)
      : setLocalCollapsed((c) => (c.includes(id) ? c.filter((g) => g !== id) : [...c, id]));

  const nav = useResizable({
    size: props.navWidth ?? localWidth,
    onSize: (value) =>
      props.onNavWidthChange ? props.onNavWidthChange(value) : setLocalWidth(value),
    initial: NAV_WIDTH.initial,
    axis: 'x',
    min: NAV_WIDTH.min,
    max: NAV_WIDTH.max,
  });

  const active = pages.find((entry) => entry.id === page);
  const activeGroup = SETTINGS_GROUPS.find((group) => group.id === active?.group);
  const label = active?.label ?? 'Settings';
  const Active = active?.Page;

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Settings pages"
        className="shrink-0 overflow-y-auto border-r border-border py-3"
        style={{ width: nav.current }}
      >
        <h1 className="px-3 pb-2 text-sm font-semibold tracking-tight">Settings</h1>
        <div className="flex flex-col gap-3 px-2">
          {SETTINGS_GROUPS.map((group) => {
            const items = pages.filter((entry) => entry.group === group.id);
            /* A category with nothing in it is noise. */
            if (items.length === 0) return null;
            const isCollapsed = collapsed.includes(group.id);
            const bodyId = `settings-group-${group.id}`;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={!isCollapsed}
                  aria-controls={bodyId}
                  aria-label={group.label}
                  className="group mb-0.5 flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <LuChevronDown
                      aria-hidden
                      className={`h-3 w-3 shrink-0 transition-transform duration-150 ease-in-out ${
                        isCollapsed ? '-rotate-90' : ''
                      }`}
                    />
                    <span className="truncate">{group.label}</span>
                  </div>
                  <span
                    aria-hidden
                    className="text-[10px] font-normal tabular-nums text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
                  >
                    {items.length}
                  </span>
                </button>
                {/* `<Collapse>` marks the clipped region inert, so a folded category's buttons leave the tab order. */}
                <Collapse open={!isCollapsed} id={bodyId} aria-label={group.label}>
                  <ul className="ml-3 flex flex-col gap-0.5 border-l border-border/40 py-0.5 pl-1.5">
                    {items.map((entry) => (
                      <li key={entry.id}>
                        <PageLink
                          page={entry}
                          active={entry.id === page}
                          onSelect={() => select(entry.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </Collapse>
              </div>
            );
          })}
        </div>
      </nav>

      <ResizeHandle resizable={nav} axis="x" label="Resize settings pages" />

      <div className="min-w-0 flex-1 overflow-y-auto">
        {/* Keyed so switching page replays the entrance fade, like view switches. */}
        <div key={page} className="mx-auto max-w-3xl animate-fade-in px-4 py-4">
          <div className="pb-3">
            {activeGroup && (
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {activeGroup.label}
              </p>
            )}
            <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
          </div>
          {Active && <Active />}
        </div>
      </div>
    </div>
  );
}
