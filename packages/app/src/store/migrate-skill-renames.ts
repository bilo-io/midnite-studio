/**
 * The midnite skills renamed after they had already been written into saved
 * menu settings: `midnite-exec` → `midnite-create`, `midnite-exec-adhoc` →
 * `midnite-create-adhoc`, `midnite-exec-swarm` → `midnite-swarm` and
 * `midnite-brainstorm` → `midnite-ideate`.
 *
 * `agentSkills` is persisted and re-spread over the defaults on load, so a blob
 * written before the rename keeps typing the old names — commands that no
 * longer exist. The v23 → v24 `migrate` arm runs every saved prompt through
 * this, including customised ones (`/midnite-exec --dry-run`), since a token
 * naming a deleted skill is broken whatever surrounds it.
 */
const SKILL_RENAMES: readonly (readonly [RegExp, string])[] = [
  [/(?<![\w-])midnite-exec-swarm(?![\w-])/g, 'midnite-swarm'],
  [/(?<![\w-])midnite-exec-adhoc(?![\w-])/g, 'midnite-create-adhoc'],
  [/(?<![\w-])midnite-exec(?![\w-])/g, 'midnite-create'],
  [/(?<![\w-])midnite-brainstorm(?![\w-])/g, 'midnite-ideate'],
];

/**
 * v37 → v38: the bare `/pr-review` and `/pr-feedback` skills no longer exist; the repo's own are
 * `/midnite-pr-review` and `/midnite-pr-feedback`. Kept apart from {@link SKILL_RENAMES} because
 * it needs a leading slash: `/ekko-pr-review` and `/loop-pr-reviews` are other people's skills and
 * must survive. Runs over every persisted skill string, including inside `/loop …`.
 */
const PR_SKILL_RENAMES: readonly (readonly [RegExp, string])[] = [
  [/(?<![\w-])\/pr-review(?![\w-])/g, '/midnite-pr-review'],
  [/(?<![\w-])\/pr-feedback(?![\w-])/g, '/midnite-pr-feedback'],
];

export function renamePrSkills(prompt: string): string {
  return PR_SKILL_RENAMES.reduce((out, [pattern, next]) => out.replace(pattern, next), prompt);
}

/** `renamePrSkills` over every string in a JSON-shaped value (records, arrays, custom loops). */
export function renamePrSkillsDeep(value: unknown): unknown {
  if (typeof value === 'string') return renamePrSkills(value);
  if (Array.isArray(value)) return value.map(renamePrSkillsDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, renamePrSkillsDeep(inner)]));
  }
  return value;
}

/** The v38 arm: every persisted field that can hold a skill string. */
export function migratePrSkills(state: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['agentSkills', 'loopModifierSkills', 'customLoops', 'cardSkillByTask', 'columnSkillByProject']) {
    if (state[key] !== undefined) state[key] = renamePrSkillsDeep(state[key]);
  }
  return state;
}

export function renameLegacySkills(prompt: string): string {
  return SKILL_RENAMES.reduce((out, [pattern, next]) => out.replace(pattern, next), prompt);
}

export function renameLegacySkillsIn(skills: unknown): unknown {
  if (!skills || typeof skills !== 'object') return skills;
  return Object.fromEntries(
    Object.entries(skills as Record<string, unknown>).map(([id, prompt]) => [
      id,
      typeof prompt === 'string' ? renameLegacySkills(prompt) : prompt,
    ]),
  );
}
