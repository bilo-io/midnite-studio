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
