// The agent provider registry (Phase 146 J1). Each provider's own web app is its remote-control surface, opened in the
// system's in-app browser (J3), so a provider is a URL, a name and a Feather glyph. The glyph is an `IconName` rather
// than a `ReactNode` so the registry stays a plain `.ts` module a test can read without rendering.
import type { IconName } from '../ui/icons';

export type AgentProviderId = 'claude-code' | 'codex' | 'gemini' | 'jules' | 'copilot';

export interface AgentProvider {
  id: AgentProviderId;
  label: string;
  url: string;
  blurb: string;
  icon: IconName;
}

export const AGENT_PROVIDERS: readonly AgentProvider[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    url: 'https://claude.ai/code',
    blurb: 'Steer Claude Code sessions running in the cloud.',
    icon: 'terminal',
  },
  {
    id: 'codex',
    label: 'Codex',
    url: 'https://chatgpt.com/codex',
    blurb: 'Hand tasks to OpenAI Codex and review what it opens.',
    icon: 'code',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    blurb: 'Chat and delegate work to Google Gemini.',
    icon: 'star',
  },
  {
    id: 'jules',
    label: 'Jules',
    url: 'https://jules.google.com',
    blurb: 'Google Jules works through a task in its own VM.',
    icon: 'cloud',
  },
  {
    id: 'copilot',
    label: 'Copilot agents',
    url: 'https://github.com/copilot/agents',
    blurb: 'Assign issues to the GitHub Copilot coding agent.',
    icon: 'github',
  },
];

export function findProvider(id: string | null | undefined): AgentProvider | undefined {
  return AGENT_PROVIDERS.find((p) => p.id === id);
}

/** The providers in display order: the last-used one first, the rest in registry order. */
export function orderProviders(lastProvider: string | null): AgentProvider[] {
  const last = findProvider(lastProvider);
  return last ? [last, ...AGENT_PROVIDERS.filter((p) => p.id !== last.id)] : [...AGENT_PROVIDERS];
}
