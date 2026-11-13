import { useMemo } from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import { COUNCIL_MEMBER_PROVIDERS, modelsForAgent, type CouncilMemberProvider } from '@midnite/studio-shared';

import { useCouncilsHost, type CouncilsPickerModel, type CouncilsPickerProvider } from './host';

/**
 * The council providers as the roster describes them on this machine (Phase 133
 * Theme B): label, brand mark, accent, and whether the CLI is installed.
 */

export const PROVIDER_LABEL: Record<CouncilMemberProvider, string> = {
  agy: 'Antigravity',
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

/** The id the picker uses for "whatever the CLI defaults to". */
export const DEFAULT_MODEL_ID = 'default';

export type CouncilProviders = {
  /** Every council provider, as the picker lists it; a CLI the probe could not find is disabled. */
  providers: CouncilsPickerProvider[];
  /** The providers the probe did not rule out, in roster order. */
  installed: CouncilMemberProvider[];
  icon: (provider: string) => IconComponent;
  accent: (provider: string) => string | undefined;
};

export function useCouncilProviders(): CouncilProviders {
  const host = useCouncilsHost();
  const { agents, status } = host.useAgentRoster();
  const { resolveAgentIcon } = host;
  return useMemo(() => {
    const agentOf = (id: string) => agents.find((a) => a.id === id);
    // An absent status means the probe could not answer — assume it works (`AgentStatusSchema`'s rule).
    const missing = (id: string) => status.find((s) => s.id === id)?.installed === false;
    const icon = (id: string): IconComponent => {
      const agent = agentOf(id);
      return resolveAgentIcon(agent ? { id: agent.id, ...(agent.icon ? { icon: agent.icon } : {}) } : { id });
    };
    const accent = (id: string) => agentOf(id)?.accent;
    const providers = COUNCIL_MEMBER_PROVIDERS.map((id): CouncilsPickerProvider => {
      const color = accent(id);
      return {
        id,
        label: PROVIDER_LABEL[id],
        icon: icon(id),
        ...(color ? { color } : {}),
        ...(missing(id) ? { disabled: true, reason: `${PROVIDER_LABEL[id]} is not installed` } : {}),
      };
    });
    const installed = COUNCIL_MEMBER_PROVIDERS.filter((id) => !missing(id));
    return { providers, installed, icon, accent };
  }, [agents, status, resolveAgentIcon]);
}

/** A provider's models for the picker, "Default" first. */
export function councilModelOptions(provider: CouncilMemberProvider): CouncilsPickerModel[] {
  const models = modelsForAgent(provider).map((m) => ({ id: m.id, label: m.label }));
  return models.some((m) => m.id === DEFAULT_MODEL_ID) ? models : [{ id: DEFAULT_MODEL_ID, label: 'Default' }, ...models];
}

/** The label for a stored model id, or `null` for the CLI's default. */
export function councilModelLabel(provider: CouncilMemberProvider, model: string | undefined): string | null {
  if (model === undefined || model === DEFAULT_MODEL_ID) return null;
  return modelsForAgent(provider).find((m) => m.id === model)?.label ?? model;
}
