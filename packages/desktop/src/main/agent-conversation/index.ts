import { createClaudeConversationAdapter } from './claude';
import { createCodexConversationAdapter } from './codex';
import type { AgentConversationAdapter } from './types';

export * from './types';
export * from './slugify';
export * from './claude';
export * from './codex';

export type AgentConversationLocatorOptions = {
  claudeProjectsDir?: string;
  codexSessionsDir?: string;
};

/**
 * Return an adapter instance for the given agent id, or null if unsupported.
 */
export function getAgentConversationAdapter(
  agentId: string,
  options?: AgentConversationLocatorOptions,
): AgentConversationAdapter | null {
  if (agentId === 'claude') {
    return createClaudeConversationAdapter(
      options?.claudeProjectsDir ? { projectsDir: options.claudeProjectsDir } : undefined,
    );
  }
  if (agentId === 'codex') {
    return createCodexConversationAdapter(
      options?.codexSessionsDir ? { sessionsDir: options.codexSessionsDir } : undefined,
    );
  }
  return null;
}

/**
 * Locate an agent conversation id for a session window across supported agents.
 *
 * Safe and best-effort: returns null if unsupported, missing, or no match found.
 */
export async function locateAgentConversation(
  agentId: string,
  cwd: string,
  since: number,
  until?: number,
  options?: AgentConversationLocatorOptions,
): Promise<string | null> {
  const adapter = getAgentConversationAdapter(agentId, options);
  if (!adapter) return null;
  return adapter.locate(cwd, since, until);
}
