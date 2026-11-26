import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { installUserSkills, installUserSkillsAll, USER_SKILLS_MANIFEST } from './user-skills';

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

  async function kit(files: Record<string, string>): Promise<string> {
    const root = await track(await mkdtemp(join(tmpdir(), 'mstudio-kit-')));
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(join(root, rel, '..'), { recursive: true });
      await writeFile(join(root, rel), text);
    }
    return root;
  }
  const exists = (p: string) =>
    access(p).then(
      () => true,
      () => false,
    );

  it('upgrades a skill it installed and nobody touched, dropping files the kit no longer has', async () => {
    const target = await track(await mkdtemp(join(tmpdir(), 'mstudio-target-skills-')));
    const v1 = await kit({ 'midnite-plan/SKILL.md': 'v1', 'midnite-plan/old.md': 'gone in v2' });
    expect((await installUserSkills(v1, target)).ok).toBe(true);

    const v2 = await kit({ 'midnite-plan/SKILL.md': 'v2' });
    const res = await installUserSkills(v2, target);
    expect(res.ok && res.value).toMatchObject({ copied: ['midnite-plan'], skipped: [] });
    expect(await readFile(join(target, 'midnite-plan', 'SKILL.md'), 'utf8')).toBe('v2');
    expect(await exists(join(target, 'midnite-plan', 'old.md'))).toBe(false);
  });

  it('skips and reports a skill the user edited since the last install, leaving it byte-for-byte', async () => {
    const target = await track(await mkdtemp(join(tmpdir(), 'mstudio-target-skills-')));
    await installUserSkills(await kit({ 'midnite-plan/SKILL.md': 'v1' }), target);
    await writeFile(join(target, 'midnite-plan', 'SKILL.md'), 'my edit');

    const res = await installUserSkills(
      await kit({ 'midnite-plan/SKILL.md': 'v2', 'midnite-build/SKILL.md': 'b' }),
      target,
    );
    expect(res.ok && res.value).toMatchObject({
      copied: ['midnite-build'],
      skipped: [
        { skill: 'midnite-plan', targetDir: target, reason: 'edited since the last install' },
      ],
    });
    expect(await readFile(join(target, 'midnite-plan', 'SKILL.md'), 'utf8')).toBe('my edit');
  });

  it('never overwrites a same-named skill it did not install, but adopts one that is already identical', async () => {
    const target = await track(await mkdtemp(join(tmpdir(), 'mstudio-target-skills-')));
    await mkdir(join(target, 'midnite-plan'), { recursive: true });
    await writeFile(join(target, 'midnite-plan', 'SKILL.md'), 'someone else');
    await mkdir(join(target, 'midnite-build'), { recursive: true });
    await writeFile(join(target, 'midnite-build', 'SKILL.md'), 'b');

    const res = await installUserSkills(
      await kit({ 'midnite-plan/SKILL.md': 'v1', 'midnite-build/SKILL.md': 'b' }),
      target,
    );
    expect(res.ok && res.value).toMatchObject({
      copied: ['midnite-build'],
      skipped: [
        { skill: 'midnite-plan', reason: 'already there, not installed by Midnite Studio' },
      ],
    });
    expect(await readFile(join(target, 'midnite-plan', 'SKILL.md'), 'utf8')).toBe('someone else');
    const manifest = JSON.parse(await readFile(join(target, USER_SKILLS_MANIFEST), 'utf8'));
    expect(Object.keys(manifest.skills)).toEqual(['midnite-build']);
  });

  it('skips a skill whose name is taken by a plain file instead of failing the whole install', async () => {
    const target = await track(await mkdtemp(join(tmpdir(), 'mstudio-target-skills-')));
    await writeFile(join(target, 'midnite-plan'), 'not a folder');
    const res = await installUserSkills(
      await kit({ 'midnite-plan/SKILL.md': 'v1', 'midnite-build/SKILL.md': 'b' }),
      target,
    );
    expect(res.ok && res.value).toMatchObject({
      copied: ['midnite-build'],
      skipped: [{ skill: 'midnite-plan', reason: 'a file of that name is in the way' }],
    });
  });

  it('installs both mirrors and merges the reports', async () => {
    const home = await track(await mkdtemp(join(tmpdir(), 'mstudio-home-')));
    const source = await kit({
      '.claude/skills/midnite-plan/SKILL.md': 'c',
      '.agents/skills/midnite-plan/SKILL.md': 'a',
    });
    const res = await installUserSkillsAll(
      ['.claude', '.agents'].map((cli) => ({
        sourceDir: join(source, cli, 'skills'),
        targetDir: join(home, cli, 'skills'),
      })),
    );
    expect(res.ok && res.value).toEqual({
      copied: ['midnite-plan'],
      skipped: [],
      targetDir: join(home, '.claude', 'skills'),
      targetDirs: [join(home, '.claude', 'skills'), join(home, '.agents', 'skills')],
    });
    expect(
      await readFile(join(home, '.agents', 'skills', 'midnite-plan', 'SKILL.md'), 'utf8'),
    ).toBe('a');
  });
});
