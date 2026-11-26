import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  failure,
  ok,
  type GitOpResult,
  type InstallUserSkillsResult,
} from '@midnite/studio-shared';

/**
 * Written into each user-level skills folder: per skill, the hash of every file
 * this installer wrote there. It is what lets a re-install tell "still exactly
 * what we put there" (safe to upgrade) from "the user has edited it since" or
 * "someone else's skill of the same name" (never touched).
 */
export const USER_SKILLS_MANIFEST = '.midnite-kit.json';

type FileHashes = Record<string, string>;
interface UserSkillsManifest {
  version: 1;
  skills: Record<string, FileHashes>;
}

export type InstallSkipped = InstallUserSkillsResult['skipped'][number];

function hashTree(dir: string): FileHashes {
  const out: FileHashes = {};
  const recurse = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) recurse(full);
      else if (e.isFile()) {
        out[relative(dir, full).split(sep).join('/')] = createHash('sha256')
          .update(readFileSync(full))
          .digest('hex');
      }
    }
  };
  recurse(dir);
  return out;
}

const sameHashes = (a: FileHashes, b: FileHashes): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

function readUserManifest(targetDir: string): UserSkillsManifest {
  try {
    const parsed = JSON.parse(
      readFileSync(join(targetDir, USER_SKILLS_MANIFEST), 'utf8'),
    ) as Partial<UserSkillsManifest>;
    if (parsed?.version === 1 && parsed.skills && typeof parsed.skills === 'object') {
      return { version: 1, skills: parsed.skills };
    }
  } catch {
    // absent or unreadable: nothing here is ours yet
  }
  return { version: 1, skills: {} };
}

/**
 * Copies the kit's skills (each directory of `sourceDir`) into a user-level
 * skills folder such as `~/.claude/skills`, without clobbering anything:
 *
 * - absent there → copied;
 * - already byte-identical → left as is, counted as copied;
 * - exactly what the last install wrote (per `.midnite-kit.json`) → replaced
 *   wholesale with the new version, so a file the kit dropped goes too;
 * - anything else — edited since the last install, or a skill of the same name
 *   this installer never wrote — is **skipped** and reported, never overwritten.
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
    const manifest = readUserManifest(targetDir);
    const copied: string[] = [];
    const skipped: InstallSkipped[] = [];

    for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const src = join(sourceDir, name);
      const dest = join(targetDir, name);
      const want = hashTree(src);

      if (existsSync(dest) && !statSync(dest).isDirectory()) {
        skipped.push({ skill: name, targetDir, reason: 'a file of that name is in the way' });
        continue;
      }
      if (existsSync(dest)) {
        const have = hashTree(dest);
        if (!sameHashes(have, want)) {
          const ours = manifest.skills[name];
          if (!ours || !sameHashes(have, ours)) {
            skipped.push({
              skill: name,
              targetDir,
              reason: ours
                ? 'edited since the last install'
                : 'already there, not installed by Midnite Studio',
            });
            continue;
          }
          rmSync(dest, { recursive: true, force: true });
          cpSync(src, dest, { recursive: true });
        }
      } else {
        cpSync(src, dest, { recursive: true });
      }
      manifest.skills[name] = want;
      copied.push(name);
    }

    writeFileSync(join(targetDir, USER_SKILLS_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    return ok({ copied: copied.sort(), skipped, targetDir, targetDirs: [targetDir] });
  } catch (err) {
    return failure(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Run `installUserSkills` for each `{sourceDir, targetDir}` pair — the kit's
 * `.claude/skills` into `~/.claude/skills` and its `.agents/skills` into
 * `~/.agents/skills` — and merge the reports. The first pair's failure (a
 * missing source) fails the whole call; a later pair's failure is reported as
 * a skip of that folder rather than undoing what the first one wrote.
 */
export async function installUserSkillsAll(
  pairs: readonly { sourceDir: string; targetDir: string }[],
): Promise<GitOpResult<InstallUserSkillsResult>> {
  const copied = new Set<string>();
  const skipped: InstallSkipped[] = [];
  const targetDirs: string[] = [];
  for (const [i, { sourceDir, targetDir }] of pairs.entries()) {
    const res = await installUserSkills(sourceDir, targetDir);
    if (!res.ok) {
      if (i === 0) return res;
      skipped.push({
        skill: '*',
        targetDir,
        reason: res.kind === 'error' ? res.message : 'could not install',
      });
      continue;
    }
    res.value.copied.forEach((c) => copied.add(c));
    skipped.push(...res.value.skipped);
    targetDirs.push(targetDir);
  }
  return ok({ copied: [...copied].sort(), skipped, targetDir: targetDirs[0] ?? '', targetDirs });
}
