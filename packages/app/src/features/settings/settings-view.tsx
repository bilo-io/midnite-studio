import { Collapse } from '@bilo-io/ui';
import { LuChevronDown } from 'react-icons/lu';

import { SETTINGS_PAGE_ICON } from '../../components/nav-icons';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import {
  DEFAULT_LAYOUT,
  LAYOUT_BOUNDS,
  SETTINGS_GROUPS,
  SETTINGS_PAGES,
  useUiStore,
  type SettingsPageId,
} from '../../store/ui-store';
import { AccountsPage } from './settings-pages/accounts-page';
import { AgentPage } from './settings-pages/agent-page';
import { ApiClientPage } from './settings-pages/api-client-page';
import { AppearancePage } from './settings-pages/appearance-page';
import { AppsPage } from './settings-pages/apps-page';
import { BrowserPage } from './settings-pages/browser-page';
import { CliPage } from './settings-pages/cli-page';
import { CompanionPage } from './settings-pages/companion-page';
import { DiffPage } from './settings-pages/diff-page';
import { GitSafetyPage } from './settings-pages/git-safety-page';
import { GraphPage } from './settings-pages/graph-page';
import { HealthPage } from './settings-pages/health-page';
import { McpSettingsPage } from './settings-pages/mcp-page';
import { MonitorPage } from './settings-pages/monitor-page';
import { OptimizerSettingsPage } from './settings-pages/optimizer-settings-page';
import { PrivacyPage } from './settings-pages/privacy-page';
import { ProjectsPage } from './settings-pages/projects-page';
import { ReviewsPage } from './settings-pages/reviews-page';
import { ScreenLockPage } from './settings-pages/screen-lock-page';
import { SearchSettingsPage } from './settings-pages/search-page';
import { SidebarPage } from './settings-pages/sidebar-page';
import { TerminalPage } from './settings-pages/terminal-page';
import { TrashSafetyPage } from './settings-pages/trash-safety-page';
import { UpdatesPage } from './settings-pages/updates-page';
import { VideoSettingsPage } from './settings-pages/video-page';
import { WorkflowsPage } from './settings-pages/workflows-page';

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
  privacy: () => <PrivacyPage />,
  graph: () => <GraphPage />,
  diff: () => <DiffPage />,
  sidebar: () => <SidebarPage />,
  search: () => <SearchSettingsPage />,
  screenLock: () => <ScreenLockPage />,
  terminal: () => <TerminalPage />,
  agent: () => <AgentPage />,
  reviews: () => <ReviewsPage />,
  projects: () => <ProjectsPage />,
  workflows: () => <WorkflowsPage />,
  video: () => <VideoSettingsPage />,
  gitSafety: () => <GitSafetyPage />,
  trashSafety: () => <TrashSafetyPage />,
  apiClient: () => <ApiClientPage />,
  mcp: () => <McpSettingsPage />,
  companion: () => <CompanionPage />,
  monitor: () => <MonitorPage />,
  browser: () => <BrowserPage />,
  apps: () => <AppsPage />,
  accounts: () => <AccountsPage />,
  cli: () => <CliPage />,
  updates: () => <UpdatesPage />,
  health: () => <HealthPage />,
  optimizer: () => <OptimizerSettingsPage />,
};

function PageLink({ id, label }: { id: SettingsPageId; label: string }) {
  const page = useUiStore((s) => s.settingsPage);
  const setPage = useUiStore((s) => s.setSettingsPage);
  const Icon = SETTINGS_PAGE_ICON[id];
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
  const activeEntry = SETTINGS_PAGES.find((entry) => entry.id === page);
  const activeGroup = SETTINGS_GROUPS.find((group) => group.id === activeEntry?.group);
  const label = activeEntry?.label ?? 'Settings';

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const nav = useResizable({
    size: layout.settingsNavWidth,
    onSize: (value) => setLayout('settingsNavWidth', value),
    initial: DEFAULT_LAYOUT.settingsNavWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.settingsNavWidth,
  });

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Settings pages"
        /* 224 (w-56 widened from w-48 originally) so the indented page list,
           tree guide line, and granular category labels ('System &
           Maintenance', 'AI & Extensibility') breathe comfortably without
           truncating labels like 'Monitor & Diagnostics' — now the drag's
           own `initial`/`min`, not a hardcoded class. */
        className="shrink-0 overflow-y-auto border-r border-border py-3"
        style={{ width: nav.current }}
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
                {/* `<Collapse>` animates a 0fr → 1fr grid track and marks the
                    clipped region inert, so a folded category's buttons leave
                    the tab order instead of staying reachable while invisible. */}
                <Collapse open={!isCollapsed} id={bodyId} aria-label={group.label}>
                  <ul className="ml-3 flex flex-col gap-0.5 border-l border-border/40 py-0.5 pl-1.5">
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
          {PAGE_CONTENT[page]()}
        </div>
      </div>
    </div>
  );
}
