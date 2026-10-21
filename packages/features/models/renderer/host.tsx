import { createContext, useContext, type ComponentType, type ReactNode, type RefObject } from 'react';

import type { AgentDefinition, RepoDescriptor } from '@midnite/studio-shared';

/**
 * The models feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme N).
 *
 * Two kinds of seam. Chrome that sits on app state (`Modal` counts occluders,
 * `CodePreview` is Monaco-backed) is a component the host supplies. Anything
 * that reaches into Studio's *terminal* — launching an agent on a model,
 * running `ollama serve` — is an **optional** member: Studio implements them
 * over its terminal panel, Agents has no terminal and leaves them out, and the
 * view then drops those affordances rather than rendering dead buttons.
 */

export type ModelsModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  testId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export type ModelsCodePreviewProps = {
  content: string;
  language: string | null;
  showGutter?: boolean;
};

/** A per-launch backend pick — `startAgent`'s `modelOverride`. */
export type ModelLaunchOverride = { backend: 'native' } | { backend: 'ollama'; model: string };

export type ModelLaunchRequest = {
  repoId: string;
  cwd: string;
  title: string;
  agentId: string;
  command: string;
  modelOverride: ModelLaunchOverride;
};

/** The terminal-backed affordances. Absent from the host where the app has no terminal. */
export type ModelsTerminal = {
  /** The agent roster a model can be launched with. A hook. */
  useAgentRoster: () => { agents: AgentDefinition[] };
  /** Starts an interactive agent session on a model. */
  startAgent: (request: ModelLaunchRequest) => void;
  /** Persists "this agent runs on this model by default". A hook returning the setter. */
  useSetAgentBackend: () => (agentId: string, binding: { backend: 'ollama'; model: string }) => void;
  /** Runs a shell command in a terminal the user can see (`ollama serve`, `ollama signin`). */
  runCommand: (command: string, title: string) => void;
};

export type ModelsHost = {
  Modal: ComponentType<ModelsModalProps>;
  CodePreview: ComponentType<ModelsCodePreviewProps>;
  /** The repositories a model can be launched in. A hook. */
  useRepos: () => { data: readonly Pick<RepoDescriptor, 'id' | 'path' | 'name'>[] | undefined };
  /** Opens a page in the system browser. */
  openExternal: (url: string) => void;
  /** Sends the user to the Ollama settings page. Absent where the app has no Settings view. */
  openOllamaSettings?: () => void;
  /** Present where the app has a terminal; see {@link ModelsTerminal}. */
  terminal?: ModelsTerminal;
};

const ModelsHostContext = createContext<ModelsHost | null>(null);

export function ModelsHostProvider({ host, children }: { host: ModelsHost; children: ReactNode }) {
  return <ModelsHostContext.Provider value={host}>{children}</ModelsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the detail modal would never open. */
export function useModelsHost(): ModelsHost {
  const host = useContext(ModelsHostContext);
  if (!host) throw new Error('The models feature must be rendered inside <ModelsHostProvider>');
  return host;
}
