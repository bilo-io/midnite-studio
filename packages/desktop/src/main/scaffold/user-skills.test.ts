import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { installUserSkills } from './user-skills';

const roots: string[] = [];
async function track<T extends string>(root: T): Promise<T> {
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('installUserSkills', () => {
  it('returns failure if the source skills directory does not exist', async () => {
    const nonExistent = join(tmpdir(), 'non-existent-skills-dir-' + Date.now());
    const target = await track(await mkdtemp(join(tmpdir(), 'mstudio-target-skills-')));

    const res = await installUserSkills(nonExistent, target);
    if (!res.ok && res.kind === 'error') {
      expect(res.message).toMatch(/not found/i);
    }
  });

  it('recursively copies skill directories and creates target directory if missing', async () => {
    const source = await track(await mkdtemp(join(tmpdir(), 'mstudio-source-skills-')));
    const targetParent = await track(await mkdtemp(join(tmpdir(), 'mstudio-target-skills-')));
    const target = join(targetParent, 'deep', 'skills');

    // Create 2 skill directories and 1 loose file in source
    await mkdir(join(source, 'midnite-create'), { recursive: true });
    await writeFile(join(source, 'midnite-create', 'SKILL.md'), '# Exec Skill');

    await mkdir(join(source, 'midnite-ideate'), { recursive: true });
    await writeFile(join(source, 'midnite-ideate', 'SKILL.md'), '# Brainstorm Skill');

    // Loose file that shouldn't be treated as a skill directory
    await writeFile(join(source, 'README.txt'), 'Not a skill');

    const res = await installUserSkills(source, target);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.copied).toEqual(['midnite-create', 'midnite-ideate']);
      expect(res.value.targetDir).toBe(target);
    }

    // Verify files in target
    const execSkill = await readFile(join(target, 'midnite-create', 'SKILL.md'), 'utf-8');
    expect(execSkill).toBe('# Exec Skill');

    const brainstormSkill = await readFile(join(target, 'midnite-ideate', 'SKILL.md'), 'utf-8');
    expect(brainstormSkill).toBe('# Brainstorm Skill');
  });
});
