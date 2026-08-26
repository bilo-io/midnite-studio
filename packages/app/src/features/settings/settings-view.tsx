import { Collapse } from '@bilo-io/ui';
import type { IconType } from 'react-icons';
import {
  LuActivity,
  LuBot,
  LuChevronDown,
  LuGitBranch,
  LuPalette,
  LuSquareTerminal,
} from 'react-icons/lu';

import {
  SETTINGS_GROUPS,
  SETTINGS_PAGES,
  useUiStore,
  type SettingsPageId,
} from '../../store/ui-store';
import { AgentPage } from './settings-pages/agent-page';
import { AppearancePage } from './settings-pages/appearance-page';
import { GraphPage } from './settings-pages/graph-page';
import { MonitorPage } from './settings-pages/monitor-page';
import { TerminalPage } from './settings-pages/terminal-page';

/**
 * Settings, as pages behind an inner sidebar (Phase 16).
 *
 * The rail stays view navigation; this slim page list is one view's internal
 * structure — the VS Code split, and the shape that scales as pages accrue.
 * The pre-16 "Graph style" and "Appearance" sections became the first two
 * pages one-to-one; Terminal and Agent are new.
 */
const PAGE_CONTENT: Record<SettingsPageId, () => React.ReactNode> = {
  appearance: () => <AppearancePage />,
  graph: () => <GraphPage />,
  terminal: () => <TerminalPage />,
  agent: () => <AgentPage />,
  monitor: () => <MonitorPage />,
};

/**
 * A glyph per page, mirroring midnite's settings sidebar — which is what turns
 * a list of five words into something scannable at a glance.
 *
 * react-icons, like the nav rail: these are new icons, and the file had none
 * before, so there is no lucide-react neighbour here to match.
 *
 * Declared here rather than on `SETTINGS_PAGES` so the store stays a plain data
 * module — putting React components in it would make every consumer of a page
 * id pull an icon package in behind it.
 */
const PAGE_ICON: Record<SettingsPageId, IconType> = {
  appearance: LuPalette,
  graph: LuGitBranch,
  terminal: LuSquareTerminal,
  agent: LuBot,
  monitor: LuActivity,
};

function PageLink({ id, label }: { id: SettingsPageId; label: string }) {
  const page = useUiStore((s) => s.settingsPage);
  const setPage = useUiStore((s) => s.setSettingsPage);
  const Icon = PAGE_ICON[id];
  const active = id === page;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => setPage(id)}
      title={label}
      className={`flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        active
          ? 'bg-primary/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SettingsView() {
  const page = useUiStore((s) => s.settingsPage);
  const collapsed = useUiStore((s) => s.collapsedSettingsGroups);
  const toggleGroup = useUiStore((s) => s.toggleSettingsGroup);
  const label = SETTINGS_PAGES.find((entry) => entry.id === page)?.label ?? 'Settings';

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Settings pages"
        /* w-48, not the w-44 this was before the glyphs: an icon and its gap
           cost ~22px, which is exactly what pushed "Monitor & Diagnostics"
           into an ellipsis. `truncate` stays as the backstop for a longer
           label added later. */
        className="w-48 shrink-0 overflow-y-auto border-r border-border py-3"
      >
        <h1 className="px-3 pb-2 text-sm font-semibold tracking-tight">Settings</h1>
        <div className="flex flex-col gap-3 px-2">
          {SETTINGS_GROUPS.map((group) => {
            const items = SETTINGS_PAGES.filter((entry) => entry.group === group.id);
            /* A category with nothing in it is noise — and it can happen the
               moment a page is retired without its group going with it. */
            if (items.length === 0) return null;
            const isCollapsed = collapsed.includes(group.id);
            const bodyId = `settings-group-${group.id}`;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isCollapsed}
                  aria-controls={bodyId}
                  className="mb-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                >
                  <LuChevronDown
                    aria-hidden
                    className={`h-3 w-3 shrink-0 transition-transform duration-150 ease-in-out ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                  <span>{group.label}</span>
                </button>
                {/* `<Collapse>` animates a 0fr → 1fr grid track and marks the
                    clipped region inert, so a folded category's buttons leave
                    the tab order instead of staying reachable while invisible. */}
                <Collapse open={!isCollapsed} id={bodyId} aria-label={group.label}>
                  <ul className="flex flex-col gap-0.5">
                    {items.map((entry) => (
                      <li key={entry.id}>
                        <PageLink id={entry.id} label={entry.label} />
                      </li>
                    ))}
                  </ul>
                </Collapse>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {/* Keyed so switching page replays the entrance fade, like view switches. */}
        <div key={page} className="mx-auto max-w-3xl animate-fade-in px-4 py-4">
          <h2 className="pb-3 text-lg font-semibold tracking-tight">{label}</h2>
          {PAGE_CONTENT[page]()}
        </div>
      </div>
    </div>
  );
}
