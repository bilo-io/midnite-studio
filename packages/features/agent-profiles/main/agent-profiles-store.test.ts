// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentProfileSchema, type AgentProfile } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentProfilesStore } from './agent-profiles-store';

const profile = (id: string, extra: Record<string, unknown> = {}): AgentProfile =>
  AgentProfileSchema.parse({ id, name: id, baseAgentId: 'claude', accent: '#112233', createdAt: 1, updatedAt: 1, ...extra });

describe('agent profiles store', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'agent-profiles-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('gives [] for a missing and for a malformed file', async () => {
    const store = createAgentProfilesStore(dir);
    expect(await store.load()).toEqual([]);
    await writeFile(join(dir, 'agent-profiles.json'), '{not json');
    expect(await store.load()).toEqual([]);
  });

  it('round-trips, drops an invalid entry and leaves no .tmp behind', async () => {
    const store = createAgentProfilesStore(dir);
    await store.save([profile('profile-a'), profile('profile-b')]);
    expect((await store.load()).map((p) => p.id)).toEqual(['profile-a', 'profile-b']);
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);

    const file = join(dir, 'agent-profiles.json');
    const raw = JSON.parse(await readFile(file, 'utf8')) as { profiles: unknown[] };
    raw.profiles.push({ id: 'nope' });
    await writeFile(file, JSON.stringify(raw));
    expect((await store.load()).map((p) => p.id)).toEqual(['profile-a', 'profile-b']);
  });

  it('writes the prompt file with mode 0600 and removes it when empty', async () => {
    const store = createAgentProfilesStore(dir);
    const path = await store.writePrompt('profile-a', 'Be terse.');
    expect(path).toBe(store.promptPath('profile-a'));
    expect(await readFile(path!, 'utf8')).toBe('Be terse.');
    expect((await stat(path!)).mode & 0o777).toBe(0o600);
    expect(await store.writePrompt('profile-a', '')).toBeNull();
    await expect(stat(path!)).rejects.toThrow();
  });

  it('refuses a path-shaped id', () => {
    expect(() => createAgentProfilesStore(dir).promptPath('profile-../x')).toThrow();
  });
});
