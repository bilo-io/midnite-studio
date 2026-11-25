import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { agentProfilesQueryOptions } from '@midnite/studio-feature-agent-profiles/renderer';
import type { CouncilsAgentProfiles, CouncilsHost } from '@midnite/studio-feature-councils/renderer';
import type { AgentProfile } from '@midnite/studio-shared';

import { AiComposer, ProviderModelPicker } from '../components/ai-thread';
import { resolveAgentIcon } from '../components/icons';
import { useOccluder } from '../components/use-occluder';
import { MarkdownBody } from '../features/markdown/markdown-body';
import { MEDIA_PROMPT_BOX } from '../features/media/prompt-input';
import { useAgents } from '../features/terminal/use-agents';
import { openExternal } from '../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's side of the councils feature's host port (Phase 113 Theme N).
 *
 * The pane widths and the config pane's collapsed flag stay in `ui-store`
 * (`layout.councilNavWidth`, `layout.councilConfigWidth`,
 * `councilConfigCollapsed`), so moving the feature into a package changed no
 * stored key, and the occluder count is the one the embedded browser watches.
 * The AI-thread kit (Phase 133) is the same set the Chats host installs.
 * The custom agents a seat can run as (#1699) are the Agents page's own query.
 */
export const STUDIO_COUNCILS_HOST = {
  useLayout: () => {
    const layout = useUiStore((s) => s.layout);
    const setLayout = useUiStore((s) => s.setLayout);
    const configCollapsed = useUiStore((s) => s.councilConfigCollapsed);
    const setConfigCollapsed = useUiStore((s) => s.setCouncilConfigCollapsed);
    return {
      nav: {
        size: layout.councilNavWidth,
        setSize: (value: number) => setLayout('councilNavWidth', value),
        initial: DEFAULT_LAYOUT.councilNavWidth,
        ...LAYOUT_BOUNDS.councilNavWidth,
      },
      config: {
        size: layout.councilConfigWidth,
        setSize: (value: number) => setLayout('councilConfigWidth', value),
        initial: DEFAULT_LAYOUT.councilConfigWidth,
        ...LAYOUT_BOUNDS.councilConfigWidth,
      },
      configCollapsed,
      setConfigCollapsed,
    };
  },
  useOccluder,
  AiComposer,
  composerBoxClassName: MEDIA_PROMPT_BOX,
  ProviderModelPicker,
  MarkdownBody,
  useAgentRoster: () => useAgents(),
  resolveAgentIcon,
  useAgentProfiles: useCouncilAgentProfiles,
  openExternal,
} satisfies CouncilsHost;

const NO_PROFILES: AgentProfile[] = [];
/** Only for a councils tree rendered with no query provider (a bare component test). */
const FALLBACK_CLIENT = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The saved custom agents, and whether they have loaded — so a seat's agent is never called deleted early. */
function useCouncilAgentProfiles(): CouncilsAgentProfiles {
  const client = useContext(QueryClientContext) ?? FALLBACK_CLIENT;
  const query = useQuery(agentProfilesQueryOptions(), client);
  return { profiles: query.data ?? NO_PROFILES, loaded: query.isSuccess };
}
