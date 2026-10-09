import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { chatSkillRoots, claudePluginSkillRoots, discoverChatSkills, scanSkillRoots } from './chat-skills';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'mstudio-chat-skills-'));
  dirs.push(d);
  return d;
}

async function skill(root: string, dir: string, body: string): Promise<void> {
  await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, dir, 'SKILL.md'), body);
}

const md = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n# body\n`;

describe('chatSkillRoots', () => {
  it('maps each engine to the folders that agent loads, project before user', () => {
    expect(chatSkillRoots('claude', '/r', '/h')).toEqual([
      { dir: '/r/.claude/skills', scope: 'project' },
      { dir: '/h/.claude/skills', scope: 'user' },
    ]);
    expect(chatSkillRoots('codex', null, '/h').map((r) => r.dir)).toEqual(['/h/.codex/skills', '/h/.agents/skills']);
    expect(chatSkillRoots('agy', '/r', '/h').map((r) => r.dir)).toEqual(['/r/.agents/skills', '/h/.agents/skills']);
    expect(chatSkillRoots('ollama', '/r', '/h')).toEqual([]);
  });
});

describe('scanSkillRoots', () => {
  it('reads name + description from frontmatter, dedupes first-wins and sorts', async () => {
    const a = await temp();
    const b = await temp();
    await skill(a, 'zeta', md('zeta', 'Last one'));
    await skill(a, 'dir-name', md('renamed', 'Frontmatter name wins'));
    await skill(b, 'zeta', md('zeta', 'Shadowed copy'));
    await skill(b, 'no-front', '# just a heading\n');
    await skill(b, 'bad', md('has space', 'Not invocable'));
    await mkdir(join(b, 'empty'), { recursive: true });

    const skills = await scanSkillRoots([
      { dir: a, scope: 'project' },
      { dir: b, scope: 'user' },
      { dir: join(b, 'missing'), scope: 'user' },
    ]);
    expect(skills).toEqual([
      { name: 'no-front', description: '', scope: 'user' },
      { name: 'renamed', description: 'Frontmatter name wins', scope: 'project' },
      { name: 'zeta', description: 'Last one', scope: 'project' },
    ]);
  });

  it('collapses a multi-line description to one line and applies a root prefix', async () => {
    const a = await temp();
    await skill(a, 'deploy', '---\nname: deploy\ndescription: >\n  Ship it\n  to prod\n---\n');
    expect(await scanSkillRoots([{ dir: a, scope: 'plugin', prefix: 'vercel:' }])).toEqual([
      { name: 'vercel:deploy', description: 'Ship it to prod', scope: 'plugin' },
    ]);
  });
});

describe('claude plugins', () => {
  it('reads installed plugins, skipping ones disabled in settings', async () => {
    const home = await temp();
    const on = join(home, 'cache', 'on');
    const off = join(home, 'cache', 'off');
    await skill(join(on, 'skills'), 'deploy', md('deploy', 'Deploy'));
    await skill(join(off, 'skills'), 'hidden', md('hidden', 'Hidden'));
    await mkdir(join(home, '.claude', 'plugins'), { recursive: true });
    await writeFile(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'vercel@mkt': [{ installPath: on }], 'quiet@mkt': [{ installPath: off }] } }),
    );
    await writeFile(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'quiet@mkt': false } }));

    expect(await claudePluginSkillRoots(home)).toEqual([{ dir: join(on, 'skills'), scope: 'plugin', prefix: 'vercel:' }]);

    await skill(join(home, '.claude', 'skills'), 'mine', md('mine', 'User skill'));
    const repo = await temp();
    await skill(join(repo, '.claude', 'skills'), 'sitrep', md('sitrep', 'Status table'));
    await skill(join(repo, '.agents', 'skills'), 'agents-only', md('agents-only', 'Not for Claude'));
    const found = await discoverChatSkills({ engine: 'claude', repoPath: repo, home });
    expect(found.map((s) => [s.name, s.scope])).toEqual([
      ['mine', 'user'],
      ['sitrep', 'project'],
      ['vercel:deploy', 'plugin'],
    ]);
  });

  it('treats a missing or malformed manifest as no plugins', async () => {
    const home = await temp();
    expect(await claudePluginSkillRoots(home)).toEqual([]);
    await mkdir(join(home, '.claude', 'plugins'), { recursive: true });
    await writeFile(join(home, '.claude', 'plugins', 'installed_plugins.json'), '{nope');
    expect(await claudePluginSkillRoots(home)).toEqual([]);
  });
});
