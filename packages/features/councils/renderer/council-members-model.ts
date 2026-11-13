import {
  COUNCIL_SYNTHESIS_PRESETS,
  type CouncilMember,
  type CouncilMemberProvider,
  type CouncilRecommendedMember,
  type CouncilSynthesisType,
} from '@midnite/studio-shared';

/**
 * How the config panel reshapes a council's members (Phase 134 Themes C–E),
 * kept pure so the rules are tested without rendering the panel.
 *
 * Every rule keeps the user's agent choices where it can: slot `i` of the new
 * members runs on whatever agent and model slot `i` ran on before, and a slot
 * that did not exist takes the last member's.
 */

type Seat = { provider: CouncilMemberProvider; model?: string };

const FALLBACK_SEAT: Seat = { provider: 'agy' };

function seatAt(members: readonly CouncilMember[], index: number): Seat {
  const member = members[index] ?? members[members.length - 1];
  if (!member) return FALLBACK_SEAT;
  return { provider: member.provider, ...(member.model ? { model: member.model } : {}) };
}

const newId = (): string => crypto.randomUUID();

/** A preset's members, seated on the current members' agents. Custom keeps the members as they are. */
export function applyPresetMembers(members: readonly CouncilMember[], type: CouncilSynthesisType): CouncilMember[] {
  if (type === 'custom') return [...members];
  return COUNCIL_SYNTHESIS_PRESETS[type].members.map((preset, index) => ({
    id: newId(),
    name: preset.name,
    role: preset.role,
    ...seatAt(members, index),
  }));
}

/**
 * The members at a new count: trimmed from the end, or grown with the preset's
 * next unused member (Custom, or a preset run out of members, adds a generic one).
 */
export function resizeMembers(
  members: readonly CouncilMember[],
  count: number,
  type: CouncilSynthesisType,
): CouncilMember[] {
  if (count <= members.length) return members.slice(0, Math.max(0, count));
  const preset = type === 'custom' ? [] : COUNCIL_SYNTHESIS_PRESETS[type].members;
  const taken = new Set(members.map((m) => m.name));
  const unused = preset.filter((p) => !taken.has(p.name));
  const next = [...members];
  while (next.length < count) {
    const from = unused.shift();
    next.push({
      id: newId(),
      name: from?.name ?? `Member ${next.length + 1}`,
      role: from?.role ?? "Describe this member's perspective.",
      ...seatAt(members, next.length),
    });
  }
  return next;
}

/** Generated (or recommended) members as council members, each with a fresh id. */
export function membersFromGenerated(generated: readonly CouncilRecommendedMember[]): CouncilMember[] {
  return generated.map((m) => ({
    id: newId(),
    name: m.name,
    role: m.role,
    provider: m.provider,
    ...(m.model ? { model: m.model } : {}),
  }));
}

/**
 * The ids that are new in `next` relative to `previous`, each with its place in
 * the cascade — what the panel animates in, one after another.
 */
export function revealOrder(previous: readonly CouncilMember[], next: readonly CouncilMember[]): Map<string, number> {
  const before = new Set(previous.map((m) => m.id));
  const order = new Map<string, number>();
  for (const member of next) if (!before.has(member.id)) order.set(member.id, order.size);
  return order;
}
