import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  failure,
  ok,
  type GitOpResult,
  type InstallUserSkillsResult,
} from '@midnite/studio-shared';

/**
 * Copies user-level skills from the template tree (`templates/midnite/.claude/skills`)
 * into the user's Claude config directory (`~/.claude/skills`).
 *
 * Each directory inside `sourceDir` represents an agent skill and is recursively copied.
 */
export async function installUserSkills(
  sourceDir: string,
  targetDir: string,
): Promise<GitOpResult<InstallUserSkillsResult>> {
  if (!existsSync(sourceDir)) {
    return failure(`Skill templates directory not found: ${sourceDir}`);
  }

  try {
    mkdirSync(targetDir, { recursive: true });
    const entries = readdirSync(sourceDir, { withFileTypes: true });
    const copied: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const src = join(sourceDir, entry.name);
        const dest = join(targetDir, entry.name);
        cpSync(src, dest, { recursive: true, force: true });
        copied.push(entry.name);
      }
    }

    return ok({ copied: copied.sort(), targetDir });
  } catch (err) {
    return failure(err instanceof Error ? err.message : String(err));
  }
}
