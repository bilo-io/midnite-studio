import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/git-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgentsStore, mergeAgents } from './agents-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mgit-agents-'));
  dirs.push(dir);
  return dir;
};

const writeAgents = async (dir: string, body: string): Promise<void> =>
  writeFile(join(dir, 'agents.json'), body, 'utf8');

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

/**
 * A user-added agent, deliberately NOT one of the builtins — `codex` sat here
 * until the roster grew to four and it stopped being an unknown id, which is
 * the whole point of the "appends an unknown id" case below.
 */
const roo: AgentDefinition = {
  id: 'roo',
  label: 'Roo Code',
  command: 'roo',
  args: [],
  accent: '#14B8A6',
};

/** The same, carrying both fields Phase 21 added — a merge has to preserve them. */
const gemini: AgentDefinition = {
  id: 'gemini',
  label: 'Gemini CLI',
  command: 'gemini',
  args: [],
  accent: '#4285F4',
  icon: 'SiGooglegemini',
  install: 'npm i -g @google/gemini-cli',
};

describe('createAgentsStore', () => {
  it('serves the builtins when there is no agents.json', async () => {
    expect(await createAgentsStore(await tempDir()).load()).toEqual([...BUILTIN_AGENTS]);
  });

  /**
   * A hand-edited config is the one file here a user will get wrong, and the
   * cost of being strict about it is an app that will not start.
   */
  it('falls back to the builtins on a corrupt file', async () => {
    const dir = await tempDir();
    await writeAgents(dir, '{ not json');

    expect(await createAgentsStore(dir).load()).toEqual([...BUILTIN_AGENTS]);
  });

  it('reads a bare array', async () => {
    const dir = await tempDir();
    await writeAgents(dir, JSON.stringify([roo]));

    expect(await createAgentsStore(dir).load()).toContainEqual(roo);
  });

  it('reads the { agents: [...] } form too', async () => {
    const dir = await tempDir();
    await writeAgents(dir, JSON.stringify({ agents: [roo] }));

    expect(await createAgentsStore(dir).load()).toContainEqual(roo);
  });
});

describe('mergeAgents', () => {
  it('appends an unknown id after the builtins', () => {
    const merged = mergeAgents(BUILTIN_AGENTS, [roo]);

    expect(merged).toHaveLength(BUILTIN_AGENTS.length + 1);
    expect(merged.at(-1)).toEqual(roo);
  });

  /**
   * In place, not appended: retuning Claude's command should not move it to the
   * bottom of a menu the user has learned the shape of.
   */
  it('replaces a builtin by id, keeping its position', () => {
    const override = { ...BUILTIN_AGENTS[0]!, command: 'claude --dangerously-skip-permissions' };
    const merged = mergeAgents(BUILTIN_AGENTS, [roo, override]);

    expect(merged[0]).toEqual(override);
    expect(merged).toHaveLength(BUILTIN_AGENTS.length + 1);
  });

  it('drops only the entries that fail the schema', () => {
    const merged = mergeAgents(BUILTIN_AGENTS, [{ id: 'broken' }, roo, null, 'nope']);

    expect(merged).toEqual([...BUILTIN_AGENTS, roo]);
  });

  it('ignores a shape that is not a roster at all', () => {
    expect(mergeAgents(BUILTIN_AGENTS, null)).toEqual([...BUILTIN_AGENTS]);
    expect(mergeAgents(BUILTIN_AGENTS, 42)).toEqual([...BUILTIN_AGENTS]);
    expect(mergeAgents(BUILTIN_AGENTS, { nothing: true })).toEqual([...BUILTIN_AGENTS]);
  });

  it('defaults args, so an entry can omit them', () => {
    const merged = mergeAgents([], [{ id: 'a', label: 'A', command: 'a', accent: '#fff' }]);

    expect(merged[0]?.args).toEqual([]);
  });

  /**
   * `icon` and `install` are the two fields Phase 21 added, and they are what a
   * user-added agent uses to bring its own mark and its own install hint. A
   * merge that dropped either would leave the entry looking like a builtin the
   * registry has never heard of.
   */
  it('carries a user entry\'s icon and install through the merge', () => {
    const merged = mergeAgents(BUILTIN_AGENTS, [gemini]);

    expect(merged.at(-1)).toEqual(gemini);
  });

  it('leaves icon and install absent when the entry omits them', () => {
    const merged = mergeAgents([], [{ id: 'a', label: 'A', command: 'a', accent: '#fff' }]);

    expect(merged[0]).not.toHaveProperty('icon');
    expect(merged[0]).not.toHaveProperty('install');
  });

  it('lets an override add an icon to a builtin without touching the rest', () => {
    const claude = BUILTIN_AGENTS[0]!;
    const merged = mergeAgents(BUILTIN_AGENTS, [{ ...claude, icon: 'SiAnthropic' }]);

    expect(merged[0]).toEqual({ ...claude, icon: 'SiAnthropic' });
    expect(merged).toHaveLength(BUILTIN_AGENTS.length);
  });

  /**
   * The original guarantee — one typo must not cost the rest of the file — now
   * has two more optional fields to typo, and an optional field that fails its
   * own constraint has to drop the ENTRY rather than silently parse without it.
   */
  it.each([
    ['an empty icon', { icon: '' }],
    ['an empty install', { install: '' }],
    ['a non-string icon', { icon: 42 }],
  ])('drops an entry with %s, keeping the others', (_name, bad) => {
    const merged = mergeAgents(BUILTIN_AGENTS, [{ ...gemini, ...bad }, roo]);

    expect(merged).toEqual([...BUILTIN_AGENTS, roo]);
  });
});
