// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modelsManifest } from '../manifest';
import { modelsMain } from './index';
import { configureOllamaPullQueue } from './pull-queue';

const KEY = 'ollama-cloud-key-123';

describe('models main', () => {
  let ctx: ReturnType<typeof createRecordingContext>;
  const calls: { url: string; headers: Record<string, string> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    // No test here can reach the network: every request lands on this stub.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        calls.push({ url: String(url), headers: init?.headers ?? {} });
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }),
    );
    ctx = createRecordingContext();
    modelsMain.register(ctx, { cloudApiKey: async () => KEY });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    configureOllamaPullQueue(null);
  });

  it('registers exactly the manifest channels', () => {
    expect([...ctx.channels].sort()).toEqual([...modelsManifest.ipc].sort());
  });

  it('sends the cloud key to ollama.com from main and never back to the renderer', async () => {
    const out = await ctx.invoke(CHANNELS.ollamaCloudList);
    expect(out).toMatchObject({ ok: true, value: { models: [] } });
    expect(JSON.stringify(out)).not.toContain(KEY);
    expect(calls[0]?.url).toContain('ollama.com/api/tags');
    expect(calls[0]?.headers['authorization']).toBe(`Bearer ${KEY}`);
  });

  it('asks the cloud without a credential when the vault refuses', async () => {
    const refused = createRecordingContext();
    modelsMain.register(refused, { cloudApiKey: async () => null });
    await refused.invoke(CHANNELS.ollamaCloudList);
    expect(calls[0]?.headers['authorization']).toBeUndefined();
  });

  it('turns an invalid payload into a failure instead of throwing', async () => {
    expect(await ctx.invoke(CHANNELS.ollamaShow, { nope: true })).toMatchObject({ ok: false, kind: 'error' });
  });
});
