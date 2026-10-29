import { SettingsView as FrameSettingsView, type SettingsPageDef } from '@midnite/studio-frame';
import { optimizerSettingsPages } from '@midnite/studio-feature-optimizer/renderer';

import { SETTINGS_PAGE_ICON } from '../../components/nav-icons';
import {
  SETTINGS_PAGES,
  useUiStore,
  type SettingsGroupId,
  type SettingsPageId,
} from '../../store/ui-store';
import { VanguardSettingsPage } from '@midnite/studio-feature-vanguard/renderer';

import { AccountsPage } from './settings-pages/accounts-page';
import { ActivityPage } from './settings-pages/activity-page';
import { AgentPage } from './settings-pages/agent-page';
import { ApiClientPage } from './settings-pages/api-client-page';
import { AppearancePage } from './settings-pages/appearance-page';
import { WebAppsPage } from './settings-pages/web-apps-page';
import { BrowserPage } from './settings-pages/browser-page';
import { CliPage } from './settings-pages/cli-page';
import { CompanionPage } from './settings-pages/companion-page';
import { DiffPage } from './settings-pages/diff-page';
import { GitSafetyPage } from './settings-pages/git-safety-page';
import { GraphPage } from './settings-pages/graph-page';
import { HealthPage } from './settings-pages/health-page';
import { STUDIO_MCP_TOOL_MANIFESTS } from '../../compose/mcp-tool-manifests';
import { McpToolsView } from '@midnite/studio-feature-mcp-tools/renderer';
import { useActiveWorktree } from '../../services/use-status';
import { MonitorPage } from './settings-pages/monitor-page';
import { OllamaSettingsPage } from './settings-pages/ollama-page';
import { PrivacyPage } from './settings-pages/privacy-page';
import { ProjectsPage } from './settings-pages/projects-page';
import { ReviewsPage } from './settings-pages/reviews-page';
import { ScreenLockPage } from './settings-pages/screen-lock-page';
import { SearchSettingsPage } from './settings-pages/search-page';
import { SidebarPage } from './settings-pages/sidebar-page';
import { TerminalPage } from './settings-pages/terminal-page';
import { UpdatesPage } from './settings-pages/updates-page';
import { MediaSettingsPage } from './settings-pages/media-page';
import { WorkflowsPage } from './settings-pages/workflows-page';

/**
 * Settings, as pages behind an inner sidebar (Phase 16).
 *
 * The rail stays view navigation; this slim page list is one view's internal
 * structure — the VS Code split, and the shape that scales as pages accrue.
 * The pre-16 "Graph style" and "Appearance" sections became the first two
 * pages one-to-one; Terminal and Agent are new.
 */
/** Settings ▸ MCP Server: the server's switches, plus the active repository's MCP servers and their trust (Phase 121 Theme C). */
function StudioMcpPage() {
  const { repoId } = useActiveWorktree();
  return <McpToolsView manifests={STUDIO_MCP_TOOL_MANIFESTS} repoId={repoId} />;
}

const PAGE_CONTENT: Record<SettingsPageId, () => React.ReactNode> = {
  appearance: () => <AppearancePage />,
  activity: () => <ActivityPage />,
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
  media: () => <MediaSettingsPage />,
  ollama: () => <OllamaSettingsPage />,
  gitSafety: () => <GitSafetyPage />,
  trashSafety: () => <optimizerSettingsPages.trashSafety />,
  apiClient: () => <ApiClientPage />,
  mcp: () => <StudioMcpPage />,
  companion: () => <CompanionPage />,
  monitor: () => <MonitorPage />,
  browser: () => <BrowserPage />,
  'web-apps': () => <WebAppsPage />,
  accounts: () => <AccountsPage />,
  vanguard: () => <VanguardSettingsPage />,
  cli: () => <CliPage />,
  updates: () => <UpdatesPage />,
  health: () => <HealthPage />,
  // Contributed by the optimizer feature package (Phase 113 Theme C).
  optimizer: () => <optimizerSettingsPages.optimizer />,
};

/** Studio's settings: its own page list, state in the ui-store, rendered by the frame's `SettingsView`. */
const STUDIO_PAGES: SettingsPageDef[] = SETTINGS_PAGES.map((entry) => ({
  ...entry,
  scope: 'app' as const,
  icon: SETTINGS_PAGE_ICON[entry.id],
  Page: () => <>{PAGE_CONTENT[entry.id]()}</>,
}));

export function SettingsView() {
  const page = useUiStore((s) => s.settingsPage);
  const setPage = useUiStore((s) => s.setSettingsPage);
  const collapsed = useUiStore((s) => s.collapsedSettingsGroups);
  const toggleGroup = useUiStore((s) => s.toggleSettingsGroup);
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  return (
    <FrameSettingsView
      pages={STUDIO_PAGES}
      activePage={page}
      onPageChange={(id) => setPage(id as SettingsPageId)}
      collapsedGroups={collapsed as SettingsGroupId[]}
      onToggleGroup={toggleGroup}
      navWidth={layout.settingsNavWidth}
      onNavWidthChange={(value) => setLayout('settingsNavWidth', value)}
    />
  );
}
