import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The skill folders the agent CLIs read, relative to a game repo's root: Claude Code reads
 * `.claude/skills/`; Codex, Antigravity and most other CLIs read `.agents/skills/`.
 */
export const GAME_SKILL_DIRS = ['.claude/skills', '.agents/skills'] as const;

/**
 * Seed `templates/media-game/skills/<name>/` into `<dest>/.claude/skills/`,
 * and `.agents/skills/` — one copy per skill folder, the
 * `main/video/scaffold.ts` pattern. A template without a `skills/` folder (a
 * minimal test fixture) seeds nothing. Returns the skill names seeded.
 */
export async function seedGameSkills(templateDir: string, dest: string): Promise<string[]> {
  const source = join(templateDir, 'skills');
  let names: string[];
  try {
    await stat(source);
    names = (await readdir(source, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
  for (const dir of GAME_SKILL_DIRS) {
    for (const name of names) {
      await cp(join(source, name), join(dest, dir, name), { recursive: true, force: true });
    }
  }
  return names;
}
