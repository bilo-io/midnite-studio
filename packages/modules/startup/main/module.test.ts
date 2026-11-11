// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { startupModuleMain } from './module';

describe('startupModuleMain', () => {
  it('declares the one startup channel', () => {
    expect(startupModuleMain.channels).toEqual([CHANNELS.startup]);
  });

  it('answers an op, emits startupChanged after a write, and refuses a malformed payload as invalid', async () => {
    const ctx = createRecordingContext();
    const userData = await mkdtemp(join(tmpdir(), 'startup-mod-'));
    startupModuleMain.register(ctx, { electron: { userData } as never });
    const got = await ctx.invoke(CHANNELS.startup, { op: 'get' });
    expect(got).toMatchObject({ ok: true, value: { revision: 0, readOnly: false } });
    const customer = { id: '00000000-0000-4000-8000-000000000030', name: 'Client', address: '' };
    expect(await ctx.invoke(CHANNELS.startup, { op: 'upsertCustomer', customer })).toMatchObject({ ok: true });
    expect(ctx.emitted).toContainEqual({ channel: EVENT_CHANNELS.startupChanged, payload: { revision: 1 } });
    expect(await ctx.invoke(CHANNELS.startup, { op: 'nope' })).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
