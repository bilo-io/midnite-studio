import { lazy, Suspense, useMemo, type ComponentType } from 'react';

import { chatsViews } from '@midnite/studio-feature-chats/renderer';
import { councilsViews } from '@midnite/studio-feature-councils/renderer';
import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/manifest';
import { mediaGameManifest } from '@midnite/studio-feature-media-game/manifest';
import { mediaMapManifest } from '@midnite/studio-feature-media-map/manifest';
import { mediaModelManifest } from '@midnite/studio-feature-media-model/manifest';
import { mediaSpriteManifest } from '@midnite/studio-feature-media-sprite/manifest';
import { mediaTerrainManifest } from '@midnite/studio-feature-media-terrain/manifest';
import { modelsViews } from '@midnite/studio-feature-models/renderer';
import { workflowsViews } from '@midnite/studio-feature-workflows/renderer';
import { RingSpinner } from '@midnite/studio-frame';
import { installedSet } from '@midnite/studio-shared';

import { AGENTS_APP } from '../agents-manifest';

export type ViewId = (typeof AGENTS_APP.views)[number];

const LABEL: Record<ViewId, string> = {
  chats: 'Chats',
  councils: 'Councils',
  workflows: 'Graphs',
  models: 'Models',
  tools: 'Tools',
  audit: 'Audit',
};

/** Agents' own tools and the frame's: no Gamer, Creator or Coder tool is offered by an app that is not installed. */
const INSTALLED = installedSet(['agents']);

/**
 * The manifests that say which app owns which tool: Audio's `music_*` are Creator's, and Model's, Game's,
 * Terrain's, Sprite's and Map's are Gamer's — pure data, imported by their `/manifest` entry so no feature's
 * renderer comes with them. Without them those tools would read as the frame's, which every app lists.
 */
const TOOL_MANIFESTS = [mediaAudioManifest, mediaModelManifest, mediaGameManifest, mediaTerrainManifest, mediaSpriteManifest, mediaMapManifest] as const;

/** The Tools view, loaded the way the other views are — in its own chunk. */
const McpToolsView = lazy(() => import('@midnite/studio-feature-mcp-tools/renderer').then((m) => ({ default: m.McpToolsView })));

/** The MCP server's Tools view as a tab: the suite's server is Studio's, so the switches are left out. */
function ToolsTab() {
  return (
    <div className="h-full overflow-auto p-4">
      <McpToolsView isAppInstalled={INSTALLED} serverAvailable={false} manifests={TOOL_MANIFESTS} />
    </div>
  );
}

/** The agent audit trail (Phase 121 Theme G): Agents' own chat turns and council runs, newest first. */
const AuditView = lazy(() => import('@midnite/studio-feature-mcp-tools/renderer').then((m) => ({ default: m.AgentAuditView })));

/** Each view as a lazy chunk, loaded the way Studio's registry loads it. */
const VIEWS: Record<ViewId, ComponentType> = {
  chats: lazy(() => chatsViews.chats().then((Component) => ({ default: Component }))),
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
