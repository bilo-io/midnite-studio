import { chatsMain } from '@midnite/studio-feature-chats/main';
import { councilsMain } from '@midnite/studio-feature-councils/main';
import { mcpToolsMain } from '@midnite/studio-feature-mcp-tools/main';
import { modelsMain } from '@midnite/studio-feature-models/main';
import { reportMain } from '@midnite/studio-feature-report/main';
import { workflowsMain } from '@midnite/studio-feature-workflows/main';
import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerAgentsOn, type AgentsElectron } from './context';

/** What the host hands the Agents module: the electron pieces, and a hook that receives the quit hook. */
export type AgentsModuleServices = {
  electron: AgentsElectron;
  /** Called once the channels are registered, with the hook that kills shells and cancels runs on quit. */
  onRegistered?: (registered: { dispose(): Promise<void> }) => void;
};

/**
 * The Agents module's main half (Phase 124 Theme E.3), on the same seam a feature uses so a host mounts it
 * through `mountModuleMains`: the report, models, chats, councils, workflows and MCP-tools features', the
 * agent roster and `secrets.has` narrowed to the Ollama key.
 */
export const agentsModuleMain = defineFeatureMain<AgentsModuleServices>({
  feature: 'agents',
  channels: [
    ...reportMain.channels,
    ...modelsMain.channels,
    ...chatsMain.channels,
    ...councilsMain.channels,
    ...workflowsMain.channels,
    ...mcpToolsMain.channels,
    CHANNELS.agentList,
    CHANNELS.secretsHas,
  ],
  register(ctx, { electron, onRegistered }) {
    onRegistered?.(registerAgentsOn(ctx, electron));
  },
});
