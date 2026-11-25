import type { ComponentType } from 'react';

import type { AgentProfilesManifest } from '../manifest';

/**
 * The custom-agents feature's renderer half (Phase 154). `sideEffects: false` keeps an app that
 * imports only the view loader from pulling the page into its entry chunk.
 */
export { agentProfilesManifest, type AgentProfilesManifest } from '../manifest';
export { AgentProfilesHostProvider, useAgentProfilesHost, type AgentProfilesHost } from './host';
export {
  AGENT_PROFILES_KEY,
  useAgentProfiles,
  useDeleteAgentProfile,
  useExportAgentProfile,
  useImportAgentProfile,
  useSaveAgentProfile,
} from './use-agent-profiles';
export { AGENT_PROFILE_TEMPLATES, type AgentProfileTemplate } from './templates';

type ViewIds = AgentProfilesManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const agentProfilesViews = {
  agents: () => import('./agents-view').then((m) => m.AgentsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
