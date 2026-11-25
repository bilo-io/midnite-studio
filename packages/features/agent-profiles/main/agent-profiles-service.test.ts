// @vitest-environment node
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentProfileSchema, MAX_AGENT_PROFILES, type AgentProfile } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT_PROFILE_LIMIT_MESSAGE,
  agentProfilePromptPath,
  configureAgentProfiles,
  deleteAgentProfile,
  listAgentProfiles,
  resetAgentProfilesState,
  saveAgentProfile,
} from './agent-profiles-service';
import { createAgentProfilesStore } from './agent-profiles-store';

const profile = (id: string, extra: Record<string, unknown> = {}): AgentProfile =>
  AgentProfileSchema.parse({ id, name: id, baseAgentId: 'claude', accent: '#112233', createdAt: 5, updatedAt: 5, ...extra });

describe('agent profiles service', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'agent-profiles-svc-'));
    configureAgentProfiles(createAgentProfilesStore(dir));
  });
  afterEach(async () => {
    resetAgentProfilesState();
    await rm(dir, { recursive: true, force: true });
  });

  it('upserts, keeping createdAt and moving updatedAt strictly forward', async () => {
    const first = await saveAgentProfile(profile('profile-a'), null);
    if (first.status !== 'saved') throw new Error('expected saved');
    const second = await saveAgentProfile({ ...first.profile, name: 'Renamed', createdAt: 999 }, first.profile.updatedAt);
    if (second.status !== 'saved') throw new Error('expected saved');
    expect(second.profile.createdAt).toBe(first.profile.createdAt);
    expect(second.profile.updatedAt).toBeGreaterThan(first.profile.updatedAt);
    expect((await listAgentProfiles()).map((p) => p.name)).toEqual(['Renamed']);
  });

  it('answers conflict for a stale expectedUpdatedAt and writes nothing', async () => {
    const first = await saveAgentProfile(profile('profile-a'), null);
    if (first.status !== 'saved') throw new Error('expected saved');
    const stale = await saveAgentProfile({ ...first.profile, name: 'Stale' }, first.profile.updatedAt - 1);
    expect(stale).toMatchObject({ status: 'conflict', current: { name: 'profile-a' } });
    const asNew = await saveAgentProfile(profile('profile-a'), null);
    expect(asNew.status).toBe('conflict');
    expect((await listAgentProfiles())[0]?.name).toBe('profile-a');
  });

  it('lands two concurrent saves of different ids', async () => {
    await Promise.all([saveAgentProfile(profile('profile-a'), null), saveAgentProfile(profile('profile-b'), null)]);
    expect((await listAgentProfiles()).map((p) => p.id).sort()).toEqual(['profile-a', 'profile-b']);
    // and the file agrees
    configureAgentProfiles(createAgentProfilesStore(dir));
    expect(await listAgentProfiles()).toHaveLength(2);
  });

  it('refuses the 201st new agent with the documented copy', async () => {
    for (let i = 0; i < MAX_AGENT_PROFILES; i += 1) await saveAgentProfile(profile(`profile-${i}`), null);
    await expect(saveAgentProfile(profile('profile-over'), null)).rejects.toThrow(
      'You have 200 agents, the most this version keeps. Delete one to add another.',
    );
    expect(AGENT_PROFILE_LIMIT_MESSAGE).toContain('200 agents');
    // an existing agent still saves at the cap
    const [first] = await listAgentProfiles();
    expect((await saveAgentProfile(first!, first!.updatedAt)).status).toBe('saved');
  }, 60_000);

  it('writes the prompt file on save and removes it on delete', async () => {
    await saveAgentProfile(profile('profile-a', { systemPrompt: 'Be terse.' }), null);
    const path = agentProfilePromptPath('profile-a');
    expect((await stat(path)).isFile()).toBe(true);
    await deleteAgentProfile('profile-a');
    await expect(stat(path)).rejects.toThrow();
    expect(await listAgentProfiles()).toEqual([]);
    await expect(deleteAgentProfile('profile-unknown')).resolves.toBeUndefined();
  });
});
