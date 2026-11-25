import { agentProfilePromptPath, getAgentProfile } from '@midnite/studio-feature-agent-profiles/main';
import { councilsMain } from '@midnite/studio-feature-councils/main';
import { resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import { engineKeyEnv, type FeatureMainContext } from '@midnite/studio-runtime';

import { recordAudit } from '../agent-audit';
import { studioHeadlessRuns } from '../agent-profiles/headless-run-profiles';
import { councilSeatRunId, createProfileHeadlessRun } from '../agent-profiles/profile-headless';
import { studioProfileMcpSockets } from '../agent-profiles/studio-profile-sockets';
import { outboundSecrets } from '../outbound-secrets';
import { createPty, killPty, offPty, onPty } from '../pty-service';
import { currentSettings } from '../settings-mirror';
import { listAgents } from '../terminal-service';
import { handle, handleBare, handleSend } from './handle';
import { readAgentApiKey, readOllamaApiKey } from './secrets-handlers';

/**
 * Agent councils (Phase 34) are the councils feature's main half (Phase 113
 * Theme N); this is Studio's composition of it. The stores stay under
 * `userData` (`index.ts` configures them); what a run spawns with — the pty
 * service, the agent roster, the mirrored per-agent Ollama binding, the daemon
 * URL and the Ollama cloud key (read here from the vault, typed into one pty's
 * environment, never an answer to a channel) — is handed over as ports.
 */
export function registerCouncilHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('councils never trashes')),
  };
  councilsMain.register(ctx, {
    runner: {
      createPty,
      killPty,
      onPty,
      offPty,
      listAgents,
      agentBinding: (agentId) => currentSettings().agentBackends?.[agentId],
      ollamaBaseUrl: () => resolveOllamaBaseUrl(),
      ollamaApiKey: readOllamaApiKey,
      agentKeyEnv: async (agentId) => engineKeyEnv((await listAgents()).find((a) => a.id === agentId), readAgentApiKey),
      audit: recordAudit,
      outboundSecrets,
      // #1699: a seat set to a custom agent runs as it, over the agent's own private MCP socket.
      profileRun: createProfileHeadlessRun({
        sockets: studioProfileMcpSockets(),
        profile: getAgentProfile,
        agents: listAgents,
        promptPath: agentProfilePromptPath,
        runId: councilSeatRunId,
        // #1697: the breaker finds the seat's custom agent, so its limits apply to the headless run.
        runs: studioHeadlessRuns(),
        pickHint: 'Pick another agent for this seat.',
      }),
    },
  });
}
