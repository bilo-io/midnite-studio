import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react';
import { PiRobotFill } from 'react-icons/pi';

import { chatsViews } from '@midnite/studio-feature-chats/renderer';
import { councilsViews } from '@midnite/studio-feature-councils/renderer';
import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/manifest';
import { modelsViews } from '@midnite/studio-feature-models/renderer';
import { workflowsViews } from '@midnite/studio-feature-workflows/renderer';
import { RingSpinner } from '@midnite/studio-frame';
import { installedSet } from '@midnite/studio-shared';

import { AGENTS_APP } from '../agents-manifest';

type ViewId = (typeof AGENTS_APP.views)[number];

const LABEL: Record<ViewId, string> = {
  chats: 'Chats',
  councils: 'Councils',
  workflows: 'Graphs',
  models: 'Models',
  tools: 'Tools',
};

/** Agents' own tools and the frame's: no Gamer, Creator or Coder tool is offered by an app that is not installed. */
const INSTALLED = installedSet(['agents']);

/** The Tools view, loaded the way the other views are — in its own chunk. */
const McpToolsView = lazy(() => import('@midnite/studio-feature-mcp-tools/renderer').then((m) => ({ default: m.McpToolsView })));

/** The MCP server's Tools view as a tab: the suite's server is Studio's, so the switches are left out. */
function ToolsTab() {
  return (
    <div className="h-full overflow-auto p-4">
      <McpToolsView isAppInstalled={INSTALLED} serverAvailable={false} manifests={[mediaAudioManifest]} />
    </div>
  );
}

/** Each view as a lazy chunk, loaded the way Studio's registry loads it. */
const VIEWS: Record<ViewId, ComponentType> = {
  chats: lazy(() => chatsViews.chats().then((Component) => ({ default: Component }))),
  councils: lazy(() => councilsViews.councils().then((Component) => ({ default: Component }))),
  workflows: lazy(() => workflowsViews.workflows().then((Component) => ({ default: Component }))),
  models: lazy(() => modelsViews.models().then((Component) => ({ default: Component }))),
  tools: ToolsTab,
};

/**
 * What Agents shows on open — Chats, with Councils, Graphs, Models and Tools beside it as tabs: the accent mark and
 * name, the five view tabs, then the active feature's own view. Each view fills the window below the
 * header exactly as it fills Studio's content area.
 */
export function AgentsHome({ initial = AGENTS_APP.home }: { initial?: ViewId }) {
  const [view, setView] = useState<ViewId>(initial);
  const Active = useMemo(() => VIEWS[view], [view]);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: AGENTS_APP.accent }}
        >
          <PiRobotFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{AGENTS_APP.name}</p>
        <nav aria-label="Agents views" className="ml-4 flex items-center gap-1">
          {AGENTS_APP.views.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? 'page' : undefined}
              data-testid={`agents-tab-${id}`}
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {LABEL[id]}
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1" aria-label={LABEL[view]}>
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
    </div>
  );
}
