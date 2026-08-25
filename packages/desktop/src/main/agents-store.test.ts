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

const codex: AgentDefinition = {
  id: 'codex',
  label: 'Codex',
  command: 'codex',
  args: [],
  accent: '#10A37F',
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
    await writeAgents(dir, JSON.stringify([codex]));

    expect(await createAgentsStore(dir).load()).toContainEqual(codex);
  });

  it('reads the { agents: [...] } form too', async () => {
    const dir = await tempDir();
    await writeAgents(dir, JSON.stringify({ agents: [codex] }));

    expect(await createAgentsStore(dir).load()).toContainEqual(codex);
  });
});

describe('mergeAgents', () => {
  it('appends an unknown id after the builtins', () => {
    const merged = mergeAgents(BUILTIN_AGENTS, [codex]);

    expect(merged).toHaveLength(BUILTIN_AGENTS.length + 1);
    expect(merged.at(-1)).toEqual(codex);
  });

  /**
   * In place, not appended: retuning Claude's command should not move it to the
   * bottom of a menu the user has learned the shape of.
   */
  it('replaces a builtin by id, keeping its position', () => {
    const override = { ...BUILTIN_AGENTS[0]!, command: 'claude --dangerously-skip-permissions' };
    const merged = mergeAgents(BUILTIN_AGENTS, [codex, override]);

    expect(merged[0]).toEqual(override);
    expect(merged).toHaveLength(BUILTIN_AGENTS.length + 1);
  });

  it('drops only the entries that fail the schema', () => {
    const merged = mergeAgents(BUILTIN_AGENTS, [{ id: 'broken' }, codex, null, 'nope']);

    expect(merged).toEqual([...BUILTIN_AGENTS, codex]);
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
});
