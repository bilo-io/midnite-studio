import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateVideoSkills, renameVideoSkillRefs } from './skills-migrate';

const OLD_W = 'video-write-editorial-script';
const NEW_W = 'midnite-media-video-write-editorial-script';
const OLD_E = 'video-execute-editorial-script';
const NEW_E = 'midnite-media-video-execute-editorial-script';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const stockWrite = `---\nname: ${OLD_W}\n---\nHand off to \`${OLD_E}\`.\n`;
const stockExec = `---\nname: ${OLD_E}\n---\nNeeds \`${OLD_W}\` first.\n`;
const HASHES = { [OLD_W]: sha(stockWrite), [OLD_E]: sha(stockExec) };

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'video-skills-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const skillFile = (name: string, dir = '.claude'): string => join(root, dir, 'skills', name, 'SKILL.md');
const seed = (name: string, text: string, dir = '.claude'): void => {
  mkdirSync(join(root, dir, 'skills', name), { recursive: true });
  writeFileSync(skillFile(name, dir), text);
};

describe('renameVideoSkillRefs', () => {
  it('rewrites old names, leaves new names alone, and is idempotent', () => {
    const once = renameVideoSkillRefs(`/${OLD_W} then ${OLD_E}`);
    expect(once).toBe(`/${NEW_W} then ${NEW_E}`);
    expect(renameVideoSkillRefs(once)).toBe(once);
  });
});

describe('migrateVideoSkills', () => {
  it('renames stock legacy skills, leaving no old directory and renaming the frontmatter', async () => {
    seed(OLD_W, stockWrite);
    seed(OLD_E, stockExec);
    const done = await migrateVideoSkills(root, HASHES);

    expect(done.map((d) => d.action)).toEqual(['renamed', 'renamed']);
    expect(existsSync(join(root, '.claude', 'skills', OLD_W))).toBe(false);
    expect(readFileSync(skillFile(NEW_W), 'utf8')).toContain(`name: ${NEW_W}`);
    expect(readFileSync(skillFile(NEW_E), 'utf8')).toContain(`\`${NEW_W}\``);
  });

  it('copies a user-edited legacy skill, keeping the edits and the old directory untouched', async () => {
    const edited = `${stockWrite}\nMY HOUSE RULE: always 30fps.\n`;
    seed(OLD_W, edited);
    const done = await migrateVideoSkills(root, HASHES);

    expect(done).toEqual([{ dir: '.claude', legacy: OLD_W, action: 'copied' }]);
    expect(readFileSync(skillFile(OLD_W), 'utf8')).toBe(edited);
    const copy = readFileSync(skillFile(NEW_W), 'utf8');
    expect(copy).toContain('MY HOUSE RULE: always 30fps.');
    expect(copy).toContain(`name: ${NEW_W}`);
  });

  it('never overwrites a skill that already exists under the new name', async () => {
    seed(OLD_W, stockWrite);
    seed(NEW_W, 'user text under the new name');
    expect(await migrateVideoSkills(root, HASHES)).toEqual([]);
    expect(readFileSync(skillFile(NEW_W), 'utf8')).toBe('user text under the new name');
    expect(existsSync(skillFile(OLD_W))).toBe(true);
  });

  it('is idempotent and also migrates the .agents and .codex mirrors', async () => {
    seed(OLD_W, stockWrite, '.agents');
    seed(OLD_W, stockWrite, '.codex');
    expect(await migrateVideoSkills(root, HASHES)).toHaveLength(2);
    expect(await migrateVideoSkills(root, HASHES)).toEqual([]);
    expect(existsSync(skillFile(NEW_W, '.codex'))).toBe(true);
  });

  it('does nothing for a root with no legacy skills or no skills dir at all', async () => {
    expect(await migrateVideoSkills(root, HASHES)).toEqual([]);
  });
});
