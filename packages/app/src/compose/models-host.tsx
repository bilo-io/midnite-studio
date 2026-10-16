import type { ModelsHost } from '@midnite/studio-feature-models/renderer';

import { Modal } from '../components/modal';
import { CodePreview } from '../features/files/preview/code-preview';
import { startAgent } from '../features/terminal/start-agent';
import { submitCommand } from '../features/terminal/submit-command';
import { useAgents } from '../features/terminal/use-agents';
import { openExternal, useRepos } from '../services/queries';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the models feature's host port (Phase 113 Theme N).
 *
 * Every member is the component or function the Models view imported directly
 * before it moved into the package, so the view, its detail modal and the
 * launch controls look and behave as they did. The `terminal` members —
 * launching an agent on a model, running `ollama serve` — are the ones Agents
 * leaves out because it has no terminal. Nothing Models stores moved: the pull
 * queue is in-memory and the per-agent default backend stays in `ui-store`'s
 * `agentBackends`.
 */
export const STUDIO_MODELS_HOST = {
  Modal,
  CodePreview,
  useRepos,
  openExternal,
  openOllamaSettings: () => {
    useUiStore.getState().setActiveView('settings');
    useUiStore.getState().setSettingsPage('ollama');
  },
  terminal: {
    useAgentRoster: () => useAgents(),
    startAgent: (request) => {
      startAgent(request);
    },
    useSetAgentBackend: () => useUiStore((s) => s.setAgentBackend),
    runCommand: (command, title) => {
      submitCommand(command, title);
    },
  },
} satisfies ModelsHost;
