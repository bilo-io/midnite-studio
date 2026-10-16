import { createHash } from 'node:crypto';
import { cp, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { VIDEO_SKILL_RENAMES } from '@midnite/studio-shared';

/**
 * Phase 99 Theme J — the two editorial skills moved to the namespaced
 * `midnite-media-video-*` names, but a video root scaffolded before that still
 * has the old directories (and the app now looks for the new ones). This brings
 * an existing root forward **without ever deleting something the user wrote**:
 *
 * - **Stock legacy skill** (byte-identical to what a past build shipped) — safe
 *   to *rename*: nothing of the user's is lost, and the root ends up exactly as a
 *   fresh scaffold would be.
 * - **Edited legacy skill** (any other bytes) — *copied* to the new name and the
 *   old directory is left untouched. The copy is the user's own text with only
 *   the skill names rewritten, so their edits carry over; the old directory stays
 *   as their backup (and, being the old name, is no longer referenced by the app).
 * - **New name already present** — nothing is touched.
 *
 * Install-alongside-and-stop-referencing was the fallback considered for every
 * case; it was rejected for the stock case because it leaves two skills with the
 * same job in the agent's list forever. Hash-matching is the one place this is
 * not provably safe, which is why anything that does not match is copied, never
 * moved. Idempotent: a second run finds the new name and does nothing.
 */

/** SHA-256 of each legacy `SKILL.md` as shipped by the last build before the rename (post-HyperFrames). */
export const STOCK_LEGACY_SKILL_HASHES: Readonly<Record<string, string>> = {
  'video-write-editorial-script': '5b6e17b5042943013634abab95692e30b566c1e732b6018bc98ec72ae6791f72',
  'video-execute-editorial-script': '5f75a4ab5c5d8839a73b141ea947b8d190bdd80fb69d3b4dbdb40aa29755913b',
};

/** The directories each CLI reads its skills from. */
export const VIDEO_SKILL_CONVENTION_DIRS = ['.claude', '.agents', '.codex'] as const;

export type VideoSkillMigration = {
  dir: string;
  legacy: string;
  action: 'renamed' | 'copied';
};

/** Rewrites every legacy skill name in `text` to its namespaced one (idempotent on new text). */
export function renameVideoSkillRefs(text: string): string {
  let out = text;
  for (const [legacy, next] of Object.entries(VIDEO_SKILL_RENAMES)) {
    const pattern = new RegExp(`(^|[^-A-Za-z])${legacy}`, 'g');
    out = out.replace(pattern, `$1${next}`);
  }
  return out;
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

export async function migrateVideoSkills(
  root: string,
  stockHashes: Readonly<Record<string, string>> = STOCK_LEGACY_SKILL_HASHES,
): Promise<VideoSkillMigration[]> {
  const done: VideoSkillMigration[] = [];
  for (const dir of VIDEO_SKILL_CONVENTION_DIRS) {
    for (const [legacy, next] of Object.entries(VIDEO_SKILL_RENAMES)) {
      const oldDir = join(root, dir, 'skills', legacy);
      const newDir = join(root, dir, 'skills', next);
      try {
        const oldFile = join(oldDir, 'SKILL.md');
        if (!(await exists(oldFile)) || (await exists(newDir))) continue;
        const bytes = await readFile(oldFile);
        const stock = createHash('sha256').update(bytes).digest('hex') === stockHashes[legacy];
        if (stock) await rename(oldDir, newDir);
        else await cp(oldDir, newDir, { recursive: true, force: false });
        const target = join(newDir, 'SKILL.md');
        await writeFile(target, renameVideoSkillRefs(await readFile(target, 'utf8')));
        done.push({ dir, legacy, action: stock ? 'renamed' : 'copied' });
      } catch {
        // A read-only or half-written root must never break the toolchain probe.
      }
    }
  }
  return done;
}
