import {
  AGENT_COMMAND_IDS,
  type AgentCommandId,
  type ForgeProjectItem,
  type RepoSkill,
} from '@midnite/studio-shared';

import { AGENT_COMMANDS } from '../../agent/agent-commands';

/**
 * The Projects card skill picker's pure half — what the combobox suggests,
 * what it prepopulates with, and how a stored value becomes the text Play
 * sends. Kept out of the component so every rule is a plain unit test.
 */

export type SkillSuggestionGroup = 'recent' | 'midnite' | 'other' | 'builtin';

export type SkillSuggestion = {
  /** What selecting it puts in the input, and so what Play sends. */
  value: string;
  label: string;
  description: string;
  group: SkillSuggestionGroup;
};

export const SKILL_GROUP_LABEL: Record<SkillSuggestionGroup, string> = {
  recent: 'Recent',
  midnite: 'Midnite skills',
  other: 'Other repo skills',
  builtin: 'Skills',
};

/** `useUiStore`'s `agentSkills` — seeded with `DEFAULT_AGENT_SKILLS`, so
 *  every id carries a template in practice; `undefined` is tolerated for a
 *  store that has not hydrated. */
type AgentSkills = Readonly<Partial<Record<AgentCommandId, string>>> | undefined;

/** The two defaults the picker can fall back to, should `agentSkills` carry
 *  no template for them — the same values `DEFAULT_AGENT_SKILLS` ships.
 *  Held here rather than imported so this module never reaches into the
 *  store (which half the board's tests replace with a selector mock). */
const FALLBACK_TEMPLATES: Partial<Record<AgentCommandId, string>> = {
  execBacklog: '/midnite-create',
  execAdhoc: '/midnite-create-adhoc',
};

/** How many recently-used skills sit above the repo's own catalogue. */
export const RECENT_SKILL_LIMIT = 5;

/**
 * Display order for the midnite family — the order the workflow runs in
 * (build, plan, verify, fan out, release, then housekeeping), not the
 * alphabet, which would lead with `midnite-address-issue`. This ranks
 * whatever the repo actually has; it never adds a skill the repo lacks,
 * and an unlisted `midnite-*` sorts after these by name.
 */
const MIDNITE_ORDER = [
  'midnite-create',
  'midnite-create-adhoc',
  'midnite-ideate',
  'midnite-refine',
  'midnite-verify',
  'midnite-swarm',
  'midnite-release-prep',
  'midnite-release-complete',
  'midnite-address-issue',
  'midnite-triage',
  'midnite-git-report',
  'midnite-git-cleanup',
  'midnite-retro',
  'midnite-setup',
];

const COMMAND_IDS: ReadonlySet<string> = new Set(AGENT_COMMAND_IDS);

function isAgentCommandId(value: string): value is AgentCommandId {
  return COMMAND_IDS.has(value);
}

function template(id: AgentCommandId, agentSkills: AgentSkills): string {
  return (agentSkills?.[id] ?? FALLBACK_TEMPLATES[id] ?? '').trim();
}

/**
 * The text a stored `cardSkillByTask` value stands for. Values written by the
 * combobox are free text and come back verbatim; a value persisted before it
 * — a bare `AgentCommandId` like `execAdhoc` — maps to that command's
 * (possibly user-edited) template, so an old choice keeps launching the same
 * skill without a store migration. Blank means unset.
 */
export function resolveCardSkillText(
  stored: string | undefined,
  agentSkills: AgentSkills,
): string | undefined {
  if (stored === undefined) return undefined;
  const text = isAgentCommandId(stored) ? template(stored, agentSkills) : stored;
  return text.trim() === '' ? undefined : text;
}

/**
 * The distinct skills used on any card, most recent first. `cardSkillByTask`
 * is kept in LRU order by `touchCardSkill` (`card-skill-lru.ts`) — the last
 * key is the last one set — so this is that order read backwards.
 */
export function recentCardSkills(
  cardSkillByTask: Readonly<Record<string, string>> | undefined,
  agentSkills: AgentSkills,
  limit: number = RECENT_SKILL_LIMIT,
): string[] {
  const out: string[] = [];
  const values = Object.values(cardSkillByTask ?? {});
  for (let index = values.length - 1; index >= 0 && out.length < limit; index -= 1) {
    const text = resolveCardSkillText(values[index], agentSkills);
    if (text !== undefined && !out.includes(text)) out.push(text);
  }
  return out;
}

/**
 * An "ad hoc" card is one that is not a phase slice: its title names no
 * `Phase N`. Such a card is already one identified task — `/midnite-create-
 * adhoc`'s own brief — while a phase card is backlog work for
 * `/midnite-create`.
 */
export function isAdhocCard(item: ForgeProjectItem): boolean {
  return !/\bphase[\s-]*\d+/i.test(item.content.title);
}

/**
 * What the picker prepopulates with, and so what Play sends for a card
 * nobody has chosen a skill for yet:
 *  1. the card's own stored skill;
 *  2. else the most recently used skill on any card;
 *  3. else `execAdhoc`'s template (`/midnite-create-adhoc`) for an ad hoc card;
 *  4. else `execBacklog`'s (`/midnite-create`).
 * (3) and (4) read the Settings ▸ Agent templates, so a repo that has pointed
 * them elsewhere gets its own defaults rather than midnite's.
 */
export function defaultCardSkill({
  item,
  taskKey,
  cardSkillByTask,
  agentSkills,
}: {
  item: ForgeProjectItem;
  taskKey: string;
  cardSkillByTask: Readonly<Record<string, string>> | undefined;
  agentSkills: AgentSkills;
}): string {
  return (
    resolveCardSkillText(cardSkillByTask?.[taskKey], agentSkills) ??
    recentCardSkills(cardSkillByTask, agentSkills, 1)[0] ??
    template(isAdhocCard(item) ? 'execAdhoc' : 'execBacklog', agentSkills)
  );
}

function midniteRank(name: string): number {
  const index = MIDNITE_ORDER.indexOf(name);
  return index === -1 ? MIDNITE_ORDER.length : index;
}

/** The first word of a skill invocation, with its `/` or `$` sigil dropped. */
export function skillHead(text: string): string {
  return (text.trim().split(/\s+/)[0] ?? '').replace(/^[/$]/, '').toLowerCase();
}

/**
 * Every suggestion, in display order:
 *  - **Recent** — the LRU list, on top;
 *  - **Midnite skills** — the repo's `midnite-*` skills, each with its
 *    frontmatter description;
 *  - **Other repo skills** — everything else the repo carries.
 * With no `midnite-*` skill in the repo (or before the list has loaded), the
 * midnite group is replaced by the `tasks`-category commands the picker offered
 * before it read the repo — the `builtin` group — so a repo with no skills
 * of its own still has something to pick.
 *
 * A skill already shown under Recent is not repeated below it.
 */
export function buildSkillSuggestions({
  repoSkills,
  recent,
  agentSkills,
}: {
  repoSkills: readonly RepoSkill[];
  recent: readonly string[];
  agentSkills: AgentSkills;
}): SkillSuggestion[] {
  const describe = new Map(repoSkills.map((skill) => [skill.name.toLowerCase(), skill.description]));
  const recentSuggestions: SkillSuggestion[] = recent.map((text) => ({
    value: text,
    label: text,
    description: describe.get(skillHead(text)) ?? '',
    group: 'recent',
  }));
  const shown = new Set(recent);

  const midnite = repoSkills
    .filter((skill) => skill.name.startsWith('midnite-'))
    .sort((a, b) => midniteRank(a.name) - midniteRank(b.name) || a.name.localeCompare(b.name));
  const other = repoSkills
    .filter((skill) => !skill.name.startsWith('midnite-'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const fromRepo = (skill: RepoSkill, group: SkillSuggestionGroup): SkillSuggestion => ({
    value: `/${skill.name}`,
    label: skill.name,
    description: skill.description,
    group,
  });

  const primary: SkillSuggestion[] =
    midnite.length > 0
      ? midnite.map((skill) => fromRepo(skill, 'midnite'))
      : AGENT_COMMANDS.filter((command) => command.category === 'tasks')
          .map((command): SkillSuggestion => ({
            value: template(command.id as AgentCommandId, agentSkills),
            label: command.label,
            description: template(command.id as AgentCommandId, agentSkills),
            group: 'builtin',
          }))
          .filter((suggestion) => suggestion.value !== '');

  return [
    ...recentSuggestions,
    ...[...primary, ...other.map((skill) => fromRepo(skill, 'other'))].filter(
      (suggestion) => !shown.has(suggestion.value),
    ),
  ];
}

/**
 * Narrow the suggestions to what has been typed. Matches the first word
 * (sigil dropped) against a suggestion's value and label, or the whole query
 * against its description — so `create` finds both create skills, `98 D`
 * after a skill name still keeps that skill, and `release` finds the release
 * pair by description too. An empty query shows everything.
 */
export function filterSkillSuggestions(
  suggestions: readonly SkillSuggestion[],
  query: string,
): SkillSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...suggestions];
  const head = skillHead(needle);
  return suggestions.filter(
    (suggestion) =>
      (head !== '' &&
        (skillHead(suggestion.value).includes(head) || suggestion.label.toLowerCase().includes(head))) ||
      suggestion.description.toLowerCase().includes(needle),
  );
}
