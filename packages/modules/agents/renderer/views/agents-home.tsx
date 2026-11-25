import { lazy, Suspense, useMemo, type ComponentType } from 'react';

import { agentProfilesViews } from '@midnite/studio-feature-agent-profiles/renderer';
import { chatsViews } from '@midnite/studio-feature-chats/renderer';
import { councilsViews } from '@midnite/studio-feature-councils/renderer';
import { modelsViews } from '@midnite/studio-feature-models/renderer';
import { workflowsViews } from '@midnite/studio-feature-workflows/renderer';
import { RingSpinner } from '@midnite/studio-frame';

import { AGENTS_APP } from '../agents-manifest';
import { AGENTS_INSTALLED_APPS, AGENTS_TOOL_MANIFESTS } from '../compose/mcp-scope';

export type ViewId = (typeof AGENTS_APP.views)[number];

const LABEL: Record<ViewId, string> = {
  chats: 'Chats',
  agents: 'Agents',
  councils: 'Councils',
  workflows: 'Graphs',
  models: 'Models',
  tools: 'Tools',
  audit: 'Audit',
};

/** The Tools view, loaded the way the other views are — in its own chunk. */
const McpToolsView = lazy(() => import('@midnite/studio-feature-mcp-tools/renderer').then((m) => ({ default: m.McpToolsView })));

/** The MCP server's Tools view as a tab: the suite's server is Studio's, so the switches are left out. */
function ToolsTab() {
  return (
    <div className="h-full overflow-auto p-4">
      <McpToolsView isAppInstalled={AGENTS_INSTALLED_APPS} serverAvailable={false} manifests={AGENTS_TOOL_MANIFESTS} />
    </div>
  );
}

/** The agent audit trail (Phase 121 Theme G): Agents' own chat turns and council runs, newest first. */
const AuditView = lazy(() => import('@midnite/studio-feature-mcp-tools/renderer').then((m) => ({ default: m.AgentAuditView })));

/** Each view as a lazy chunk, loaded the way Studio's registry loads it. */
const VIEWS: Record<ViewId, ComponentType> = {
  chats: lazy(() => chatsViews.chats().then((Component) => ({ default: Component }))),
  agents: lazy(() => agentProfilesViews.agents().then((Component) => ({ default: Component }))),
  councils: lazy(() => councilsViews.councils().then((Component) => ({ default: Component }))),
  workflows: lazy(() => workflowsViews.workflows().then((Component) => ({ default: Component }))),
  models: lazy(() => modelsViews.models().then((Component) => ({ default: Component }))),
  tools: ToolsTab,
  audit: AuditView,
};

/**
 * The view Agents shows inside the shell's slot (Phase 123 Theme H): the rail picks it, the feature's own
 * page fills the box below the title bar exactly as it fills Studio's content area.
 */
export function AgentsHome({ view }: { view: ViewId }) {
  const Active = useMemo(() => VIEWS[view], [view]);
  return (
    <main className="h-full min-h-0" aria-label={LABEL[view]}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <RingSpinner label="Loading" size="md" />
          </div>
        }
      >
        <Active />
      </Suspense>
    </main>
  );
}
