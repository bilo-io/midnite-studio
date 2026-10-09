import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { isGameMcpToolId } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { GAME_SKILL_DIRS, seedGameSkills } from './skills';

const repoRoot = resolve(__dirname, '../../../../..');
const templateDir = join(repoRoot, 'templates', 'media-game');
const skillsDir = join(templateDir, 'skills');
const GENRES = ['fps', 'rts', 'arpg', 'crime', 'shooter', 'fighter', 'soulslike', 'rpg', 'character-action', 'open-world'];

async function walk(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
    const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(dir, next)));
    else out.push(next);
  }
  return out.sort();
}

const names = async () => (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();

describe('game skills (Phase 107 Theme L)', () => {
  it('is the build skill plus one recipe per genre', async () => {
    expect(await names()).toEqual(['midnite-media-game-build', ...GENRES.map((g) => `midnite-media-game-${g}`)].sort());
  });

  it('has front matter with name = folder and a description', async () => {
    for (const name of await names()) {
      const text = await readFile(join(skillsDir, name, 'SKILL.md'), 'utf8');
      const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
      expect(match, `${name} has no front matter`).not.toBeNull();
      const front = match![1]!;
      expect(/^name: (.+)$/m.exec(front)?.[1], `${name} name`).toBe(name);
      expect((/^description: (.+)$/m.exec(front)?.[1] ?? '').length, `${name} description`).toBeGreaterThan(40);
    }
  });

  it('names only game_* tools that exist', async () => {
    for (const name of await names()) {
      const text = await readFile(join(skillsDir, name, 'SKILL.md'), 'utf8');
      for (const token of text.match(/\bgame_[a-z_]+/g) ?? []) {
        expect(isGameMcpToolId(token), `${name}: ${token} is not a game MCP tool`).toBe(true);
      }
    }
  });

  it('quotes tuning numbers that equal the kit defaults', async () => {
    const sources: { file: string; text: string }[] = [];
    for (const root of [join(templateDir, 'kit'), join(templateDir, 'genres')]) {
      for (const file of await walk(root)) {
        if (file.endsWith('.js')) sources.push({ file, text: await readFile(join(root, file), 'utf8') });
      }
    }
    let checked = 0;
    for (const name of await names()) {
      const text = await readFile(join(skillsDir, name, 'SKILL.md'), 'utf8');
      for (const match of text.matchAll(/`([A-Za-z_][A-Za-z0-9_.]*) = (-?\d+(?:\.\d+)?)`/g)) {
        const [, path, value] = match;
        const last = path!.split('.').at(-1)!;
        const pattern = new RegExp(`\\b${last}\\b\\s*[:=]\\s*${value!.replace('.', '\\.')}(?![\\d.])`);
        expect(
          sources.some((s) => pattern.test(s.text)),
          `${name}: \`${path} = ${value}\` matches no kit or genre default`,
        ).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  describe('seeding', () => {
    let dest: string | null = null;
    afterEach(async () => {
      if (dest) await rm(dest, { recursive: true, force: true });
      dest = null;
    });

    it('writes every skill into all three skill folders (11 x 3 files)', async () => {
      dest = await mkdtemp(join(tmpdir(), 'midnite-skills-'));
      const seeded = await seedGameSkills(templateDir, dest);
      expect(seeded).toHaveLength(11);
      let files = 0;
      for (const dir of GAME_SKILL_DIRS) {
        for (const name of seeded) {
          const source = await readFile(join(skillsDir, name, 'SKILL.md'), 'utf8');
          expect(await readFile(join(dest, dir, name, 'SKILL.md'), 'utf8')).toBe(source);
          files += 1;
        }
      }
      expect(files).toBe(33);
      expect((await walk(dest)).length).toBe(33);
    });

    it('seeds nothing when the template has no skills folder', async () => {
      dest = await mkdtemp(join(tmpdir(), 'midnite-skills-'));
      expect(await seedGameSkills(join(dest, 'missing'), dest)).toEqual([]);
      await expect(stat(join(dest, '.claude'))).rejects.toThrow();
    });
  });
});
