import { useMemo } from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import {
  BUILTIN_AGENTS,
  COUNCIL_MEMBER_PROVIDERS,
  councilProfileBaseRefusal,
  isCouncilProfileBase,
  modelsForAgent,
  type AgentProfile,
  type CouncilMemberProvider,
  type CouncilProfileRole,
} from '@midnite/studio-shared';

import { useCouncilsHost, type CouncilsAgentProfiles, type CouncilsPickerModel, type CouncilsPickerProvider } from './host';

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

/** What a member seat runs as: a roster agent, or a custom agent over its base (#1699). */
export type CouncilSeat = { provider: CouncilMemberProvider; model?: string | undefined; agentProfileId?: string | undefined };

/** The seat fields a pick in the member picker sets; `undefined` clears one. */
export type CouncilSeatPatch = { provider: CouncilMemberProvider; model: undefined; agentProfileId: string | undefined };

export const YOUR_AGENTS_GROUP = 'Your agents';
export const ROSTER_GROUP = 'Agents';

export type CouncilProviders = {
  /** Every council provider, as the picker lists it; a CLI the probe could not find is disabled. */
  providers: CouncilsPickerProvider[];
  /** The member picker's list: the custom agents a seat can run as first, then {@link providers} (#1699). */
  seats: CouncilsPickerProvider[];
  /** The providers the probe did not rule out, in roster order. */
  installed: CouncilMemberProvider[];
  icon: (provider: string) => IconComponent;
  accent: (provider: string) => string | undefined;
  /** A custom agent's glyph: its own icon over its base CLI's, as the terminal's `+` menu draws it. */
  profileIcon: (profile: AgentProfile) => IconComponent;
  /** A saved custom agent by id, or `null` (deleted, or not loaded yet — see `profilesLoaded`). */
  profile: (profileId: string) => AgentProfile | null;
  profilesLoaded: boolean;
  /** The picker id a seat shows as selected: its custom agent while it resolves, else its provider. */
  seatValue: (seat: CouncilSeat) => string;
  /** The seat fields for a picked id, or `null` for an id that is neither. */
  seatPatch: (id: string) => CouncilSeatPatch | null;
  /** The seat's custom agent was deleted, so it runs as its `provider`. Only once the list has loaded. */
  seatFellBack: (seat: CouncilSeat) => boolean;
  /**
   * What the UI flags about a seat's custom agent, or `null` when it runs as set (#1713): deleted (it runs
   * as its base), or moved onto a base a council cannot read (the run will refuse it) — said here, before a run.
   */
  seatNotice: (seat: CouncilSeat, role?: CouncilProfileRole) => string | null;
};

const NO_PROFILES: CouncilsAgentProfiles = { profiles: [], loaded: true };
const useNoProfiles = (): CouncilsAgentProfiles => NO_PROFILES;

export function useCouncilProviders(): CouncilProviders {
  const host = useCouncilsHost();
  const { agents, status } = host.useAgentRoster();
  // The host is fixed for the tree's lifetime, so this is the same hook on every render.
  const useProfiles = host.useAgentProfiles ?? useNoProfiles;
  const { profiles: savedProfiles, loaded: profilesLoaded } = useProfiles();
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

    // Only a custom agent whose base is itself a council provider can sit: its answer is read as its base's.
    const seatable = savedProfiles.filter((p) => isCouncilProfileBase(p.baseAgentId));
    const byId = new Map(seatable.map((p) => [p.id, p]));
    const profileIcon = (p: AgentProfile): IconComponent => resolveAgentIcon({ id: p.baseAgentId, ...(p.icon ? { icon: p.icon } : {}) });
    const profileEntries = seatable.map((p): CouncilsPickerProvider => {
      const base = p.baseAgentId as CouncilMemberProvider;
      return {
        id: p.id,
        label: p.name,
        icon: profileIcon(p),
        color: p.accent,
        group: YOUR_AGENTS_GROUP,
        ...(missing(base) ? { disabled: true, reason: `${p.name} runs on ${PROVIDER_LABEL[base]}, which is not installed` } : {}),
      };
    });
    const seats = profileEntries.length > 0 ? [...profileEntries, ...providers.map((p) => ({ ...p, group: ROSTER_GROUP }))] : providers;

    const profile = (profileId: string) => byId.get(profileId) ?? null;
    const seatValue = (seat: CouncilSeat) => (seat.agentProfileId && byId.has(seat.agentProfileId) ? seat.agentProfileId : seat.provider);
    const seatPatch = (id: string): CouncilSeatPatch | null => {
      const picked = byId.get(id);
      if (picked) return { provider: picked.baseAgentId as CouncilMemberProvider, model: undefined, agentProfileId: picked.id };
      return isProvider(id) ? { provider: id, model: undefined, agentProfileId: undefined } : null;
    };
    const seatFellBack = (seat: CouncilSeat) =>
      profilesLoaded && seat.agentProfileId !== undefined && !savedProfiles.some((p) => p.id === seat.agentProfileId);
    const agentLabel = (id: string) => agentOf(id)?.label ?? BUILTIN_AGENTS.find((a) => a.id === id)?.label ?? id;
    const seatNotice = (seat: CouncilSeat, role: CouncilProfileRole = 'seat'): string | null => {
      if (seat.agentProfileId === undefined) return null;
      if (seatFellBack(seat)) return deletedSeatNotice(seat.provider, false, role);
      const moved = byId.has(seat.agentProfileId) ? undefined : savedProfiles.find((p) => p.id === seat.agentProfileId);
      return moved ? councilProfileBaseRefusal(moved.name, agentLabel(moved.baseAgentId), role) : null;
    };
    return {
      providers,
      seats,
      installed,
      icon,
      accent,
      profileIcon,
      profile,
      profilesLoaded,
      seatValue,
      seatPatch,
      seatFellBack,
      seatNotice,
    };
  }, [agents, status, resolveAgentIcon, savedProfiles, profilesLoaded]);
}

const isProvider = (id: string): id is CouncilMemberProvider => (COUNCIL_MEMBER_PROVIDERS as readonly string[]).includes(id);

/** A seat's picker models: none for a custom agent, whose own model it runs. */
export function seatModelOptions(seat: CouncilSeat): CouncilsPickerModel[] {
  return seat.agentProfileId ? [] : councilModelOptions(seat.provider);
}

/** What the council UI says about a seat (or the synthesizer) whose custom agent was deleted. */
export function deletedSeatNotice(provider: CouncilMemberProvider, ran: boolean, role: CouncilProfileRole = 'seat'): string {
  if (ran) return `Custom agent deleted, so this answer came from ${PROVIDER_LABEL[provider]}.`;
  const who = role === 'synthesizer' ? 'the synthesizer' : 'this seat';
  return `Custom agent deleted, so ${who} runs as ${PROVIDER_LABEL[provider]}. Pick another agent to change it.`;
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
