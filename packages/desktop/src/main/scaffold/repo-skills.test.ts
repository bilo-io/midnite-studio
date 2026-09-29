import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listRepoSkills, parseSkillFrontmatter, skillSourceOrder } from './repo-skills';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mstudio-repo-skills-'));
  roots.push(root);
  return root;
}

async function skill(root: string, source: string, dir: string, body: string): Promise<void> {
  const path = join(root, source, 'skills', dir);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'SKILL.md'), body);
}

describe('parseSkillFrontmatter', () => {
  it('reads plain, quoted and block-scalar values', () => {
    expect(
      parseSkillFrontmatter('---\nname: midnite-create\ndescription: Pick themes, build, merge.\n---\n# Body'),
    ).toEqual({ name: 'midnite-create', description: 'Pick themes, build, merge.' });
    expect(parseSkillFrontmatter('---\nname: "g"\ndescription: "Use for: \\"any\\" question"\n---')).toEqual({
      name: 'g',
      description: 'Use for: "any" question',
    });
    expect(parseSkillFrontmatter("---\nname: 'x'\ndescription: 'it''s fine'\n---")).toEqual({
      name: 'x',
      description: "it's fine",
    });
    expect(parseSkillFrontmatter('---\nname: y\ndescription: >\n  folded\n  onto one line\nallowed-tools: Bash\n---')).toEqual({
      name: 'y',
      description: 'folded onto one line',
    });
  });

  it('returns null without a terminated frontmatter block', () => {
    expect(parseSkillFrontmatter('# no frontmatter')).toBeNull();
    expect(parseSkillFrontmatter('---\nname: x\n')).toBeNull();
  });

  it('tolerates CRLF and a BOM', () => {
    expect(parseSkillFrontmatter('﻿---\r\nname: z\r\ndescription: d\r\n---\r\n')).toEqual({
      name: 'z',
      description: 'd',
    });
  });
});

describe('skillSourceOrder', () => {
  it("reads the launching agent's own directory first", () => {
    expect(skillSourceOrder('claude')[0]).toBe('.claude');
    expect(skillSourceOrder(undefined)[0]).toBe('.claude');
    expect(skillSourceOrder('codex')[0]).toBe('.codex');
    expect(skillSourceOrder('agy')[0]).toBe('.agents');
  });
});

describe('listRepoSkills', () => {
  it('lists every SKILL.md, deduped by name in agent order, sorted', async () => {
    const root = await repo();
    await skill(root, '.claude', 'midnite-create', '---\nname: midnite-create\ndescription: claude copy\n---\n');
    await skill(root, '.codex', 'midnite-create', '---\nname: midnite-create\ndescription: codex copy\n---\n');
    await skill(root, '.agents', 'graphify', '---\nname: graphify\ndescription: graph it\n---\n');
    await skill(root, '.claude', 'no-front', '# nothing');

    const claude = await listRepoSkills(root, 'claude');
    expect(claude).toEqual({
      ok: true,
      value: {
        skills: [
          { name: 'graphify', description: 'graph it', source: '.agents' },
          { name: 'midnite-create', description: 'claude copy', source: '.claude' },
          // No frontmatter: the directory name stands in, description empty.
          { name: 'no-front', description: '', source: '.claude' },
        ],
      },
    });

    const codex = await listRepoSkills(root, 'codex');
    expect(codex.ok && codex.value.skills.find((s) => s.name === 'midnite-create')?.description).toBe(
      'codex copy',
    );
  });

  it('skips a directory with no SKILL.md and names that are not one path segment', async () => {
    const root = await repo();
    await mkdir(join(root, '.claude', 'skills', 'empty'), { recursive: true });
    await skill(root, '.claude', 'bad', '---\nname: rm -rf /\ndescription: nope\n---\n');
    expect(await listRepoSkills(root)).toEqual({ ok: true, value: { skills: [] } });
  });

  it('answers an empty list for a repo with no skill directories', async () => {
    expect(await listRepoSkills(await repo())).toEqual({ ok: true, value: { skills: [] } });
  });
});
