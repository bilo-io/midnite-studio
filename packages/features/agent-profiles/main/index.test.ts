// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecordingContext } from '@midnite/studio-runtime';
import { AgentProfileSchema, CHANNELS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { agentProfilesManifest } from '../manifest';
import { agentProfilesMain, configureAgentProfiles, resetAgentProfilesState, saveAgentProfile } from './index';
import { createAgentProfilesStore } from './agent-profiles-store';

const valid = (extra: Record<string, unknown> = {}) => ({
  id: 'profile-a',
  name: 'Reviewer',
  baseAgentId: 'claude',
  accent: '#112233',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('agent profiles main', () => {
  let dir: string;
  let picked: string | null;
  let savePath: string | null;
  let ctx: ReturnType<typeof createRecordingContext>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'agent-profiles-main-'));
    picked = null;
    savePath = null;
    configureAgentProfiles(createAgentProfilesStore(dir));
    ctx = createRecordingContext();
    agentProfilesMain.register(ctx, {
      dialogs: { pickFile: async () => picked, pickSavePath: async () => savePath },
    });
  });
  afterEach(async () => {
    resetAgentProfilesState();
    await rm(dir, { recursive: true, force: true });
  });

  it('registers exactly the manifest channels', () => {
    expect([...ctx.channels].sort()).toEqual([...agentProfilesManifest.ipc].sort());
  });

  it('saves, lists and deletes over the wire, with a conflict inside ok', async () => {
    const saved = (await ctx.invoke(CHANNELS.agentProfileSave, { profile: valid(), expectedUpdatedAt: null })) as {
      ok: true;
      value: { status: string; profile: { updatedAt: number } };
    };
    expect(saved).toMatchObject({ ok: true, value: { status: 'saved' } });
    const stale = await ctx.invoke(CHANNELS.agentProfileSave, { profile: valid(), expectedUpdatedAt: saved.value.profile.updatedAt - 1 });
    expect(stale).toMatchObject({ ok: true, value: { status: 'conflict' } });
    expect(await ctx.invoke(CHANNELS.agentProfileList)).toMatchObject({ ok: true, value: { profiles: [{ id: 'profile-a' }] } });
    expect(await ctx.invoke(CHANNELS.agentProfileDelete, { id: 'profile-a' })).toMatchObject({ ok: true });
  });

  it('turns an invalid payload and a thrown save into failures', async () => {
    expect(await ctx.invoke(CHANNELS.agentProfileSave, { profile: { id: 1 } })).toMatchObject({ ok: false, kind: 'error' });
  });

  it('imports a valid file with a new id and an (imported) name', async () => {
    await saveAgentProfile(AgentProfileSchema.parse(valid()), null);
    picked = join(dir, 'in.agent.json');
    await writeFile(picked, JSON.stringify({ version: 1, profile: valid({ id: 'profile-zzz' }) }));
    const res = (await ctx.invoke(CHANNELS.agentProfileImport)) as { ok: true; value: { profile: { id: string; name: string } } };
    expect(res.ok).toBe(true);
    expect(res.value.profile.id).not.toBe('profile-zzz');
    expect(res.value.profile.id.startsWith('profile-')).toBe(true);
    expect(res.value.profile.name).toBe('Reviewer (imported)');
  });

  it('fails a 2 MB file and a non-agent JSON with their copy', async () => {
    picked = join(dir, 'big.json');
    await writeFile(picked, 'x'.repeat(2_000_000));
    expect(await ctx.invoke(CHANNELS.agentProfileImport)).toMatchObject({ ok: false, message: 'That file is too large to be an agent.' });
    await writeFile(picked, JSON.stringify({ hello: 'world' }));
    expect(await ctx.invoke(CHANNELS.agentProfileImport)).toMatchObject({ ok: false, message: 'That file is not a Midnite agent.' });
    await writeFile(picked, 'not json at all');
    expect(await ctx.invoke(CHANNELS.agentProfileImport)).toMatchObject({ ok: false, message: 'That file is not a Midnite agent.' });
  });

  it('exports { version: 1, profile } to the picked path', async () => {
    await saveAgentProfile(AgentProfileSchema.parse(valid({ name: 'Code Reviewer!' })), null);
    savePath = join(dir, 'out.agent.json');
    expect(await ctx.invoke(CHANNELS.agentProfileExport, { id: 'profile-a' })).toMatchObject({ ok: true, value: { path: savePath } });
    const file = JSON.parse(await readFile(savePath, 'utf8')) as { version: number; profile: { id: string } };
    expect(file).toMatchObject({ version: 1, profile: { id: 'profile-a' } });
  });

  it('gives null when a dialog is dismissed', async () => {
    await saveAgentProfile(AgentProfileSchema.parse(valid()), null);
    expect(await ctx.invoke(CHANNELS.agentProfileImport)).toMatchObject({ ok: true, value: { profile: null } });
    expect(await ctx.invoke(CHANNELS.agentProfileExport, { id: 'profile-a' })).toMatchObject({ ok: true, value: { path: null } });
  });

  it('prepareLaunch without a launch service fails', async () => {
    expect(await ctx.invoke(CHANNELS.agentProfilePrepareLaunch, { profileId: 'profile-a', cwd: '/r', resume: false })).toMatchObject({
      ok: false,
      message: 'Launching needs Midnite Studio.',
    });
  });

  it('prepareLaunch with a launch service passes the stored profile', async () => {
    await saveAgentProfile(AgentProfileSchema.parse(valid()), null);
    const ctx2 = createRecordingContext();
    agentProfilesMain.register(ctx2, {
      dialogs: { pickFile: async () => null, pickSavePath: async () => null },
      launch: { prepare: async (p, req) => ({ launchId: 'L1', line: `${p.id}@${req.cwd}:${req.resume}` }) },
    });
    expect(await ctx2.invoke(CHANNELS.agentProfilePrepareLaunch, { profileId: 'profile-a', cwd: '/r', resume: true })).toMatchObject({
      ok: true,
      value: { launchId: 'L1', line: 'profile-a@/r:true' },
    });
  });
});
