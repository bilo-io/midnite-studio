// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { councilsManifest } from '../manifest';
import { councilsMain, configureCouncils, nullCouncilsRunsStore, nullCouncilsStore } from './index';
import { resetCouncilsForTest } from './council-service';
import type { CouncilRunnerPorts } from './council-runner';

/** Ports that fail the test if a council ever spawns a real process or reads a key. */
function ports(): CouncilRunnerPorts {
  return {
    createPty: vi.fn(async () => ({ ok: false as const, message: 'no pty in tests' })),
    killPty: vi.fn(),
    onPty: vi.fn(),
    offPty: vi.fn(),
    listAgents: vi.fn(async () => []),
    agentBinding: () => undefined,
    ollamaBaseUrl: () => 'http://127.0.0.1:11434',
    ollamaApiKey: vi.fn(async () => null),
  };
}

describe('councils main', () => {
  let ctx: ReturnType<typeof createRecordingContext>;
  beforeEach(() => {
    resetCouncilsForTest();
    configureCouncils(nullCouncilsStore, nullCouncilsRunsStore);
    ctx = createRecordingContext();
    councilsMain.register(ctx, { runner: ports() });
  });

  it('registers exactly the manifest channels', () => {
    expect([...ctx.channels].sort()).toEqual([...councilsManifest.ipc].sort());
  });

  it('creates, lists and removes a council over the wire', async () => {
    const created = await ctx.invoke(CHANNELS.councilCreate, { name: 'Review board' });
    expect(created).toMatchObject({ ok: true, value: { name: 'Review board' } });
    const listed = (await ctx.invoke(CHANNELS.councilList)) as { councils: { id: string; name: string }[] };
    expect(listed.councils.map((c) => c.name)).toContain('Review board');
    const id = listed.councils[0]!.id;
    expect(await ctx.invoke(CHANNELS.councilRemove, { id })).toMatchObject({ ok: true });
    expect(await ctx.invoke(CHANNELS.councilRemove, { id })).toMatchObject({ ok: false });
  });

  it('turns an invalid payload into a failure instead of throwing', async () => {
    expect(await ctx.invoke(CHANNELS.councilCreate, { name: 42 })).toMatchObject({ ok: false, kind: 'error' });
  });

  it('refuses to start a run on a council that does not exist, spawning nothing', async () => {
    const p = ports();
    const local = createRecordingContext();
    councilsMain.register(local, { runner: p });
    expect(await local.invoke(CHANNELS.councilRunStart, { councilId: 'nope', prompt: 'x' })).toMatchObject({ ok: false });
    expect(p.createPty).not.toHaveBeenCalled();
    expect(p.ollamaApiKey).not.toHaveBeenCalled();
  });
});
