import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  knownSkillRoots,
  listKnownSkills,
  listRepoSkills,
  parseSkillFrontmatter,
  skillSourceOrder,
} from './repo-skills';

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
    expect(parseSkillFrontmatter('\uFEFF---\r\nname: z\r\ndescription: d\r\n---\r\n')).toEqual({
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

describe('listKnownSkills', () => {
  it('merges repo, user and bundled skills, first root wins a name, each labelled by source', async () => {
    const workdir = await repo();
    const home = await repo();
    const bundled = await repo();
    await skill(workdir, '.claude', 'ekko-pr-review', '---\nname: ekko-pr-review\ndescription: Review a PR.\n---');
    await skill(workdir, '.codex', 'shared', '---\nname: shared\ndescription: repo copy\n---');
    await skill(home, '.claude', 'shared', '---\nname: shared\ndescription: user copy\n---');
    await skill(home, '.claude', 'pr-feedback', '---\nname: pr-feedback\n---');
    await mkdir(join(bundled, 'midnite-sitrep'), { recursive: true });
    await writeFile(join(bundled, 'midnite-sitrep', 'SKILL.md'), '---\nname: midnite-sitrep\ndescription: >\n  Status\n  table.\n---');
    await mkdir(join(bundled, 'pr-feedback'), { recursive: true });
    await writeFile(join(bundled, 'pr-feedback', 'SKILL.md'), '---\nname: pr-feedback\n---');

    const result = await listKnownSkills(knownSkillRoots({ bundledDir: bundled, workdir, home }));
    expect(result).toEqual({
      ok: true,
      value: {
        skills: [
          { name: 'ekko-pr-review', description: 'Review a PR.', source: 'repo' },
          { name: 'midnite-sitrep', description: 'Status table.', source: 'midnite' },
          { name: 'pr-feedback', source: 'user' },
          { name: 'shared', description: 'repo copy', source: 'repo' },
        ],
      },
    });
  });

  it('skips missing roots and unreadable skills, and needs no repo', async () => {
    const home = await repo();
    await mkdir(join(home, '.claude', 'skills', 'empty'), { recursive: true });
    await skill(home, '.claude', 'bad', '---\nname: has space\n---');
    const result = await listKnownSkills(
      knownSkillRoots({ bundledDir: join(home, 'nope'), workdir: null, home }),
    );
    expect(result).toEqual({ ok: true, value: { skills: [] } });
  });

  it('orders roots repo → user → bundled', () => {
    expect(
      knownSkillRoots({ bundledDir: '/b', workdir: '/w', home: '/h' }).map((r) => [r.dir, r.source]),
    ).toEqual([
      [join('/w', '.claude', 'skills'), 'repo'],
      [join('/w', '.agents', 'skills'), 'repo'],
      [join('/w', '.codex', 'skills'), 'repo'],
      [join('/h', '.claude', 'skills'), 'user'],
      ['/b', 'midnite'],
    ]);
  });
});
