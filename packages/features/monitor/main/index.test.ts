// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { monitorMain, type OllamaPort } from './index';
import { monitorManifest } from '../manifest';

const ollama: OllamaPort = {
  baseUrl: () => 'http://127.0.0.1:1',
  version: () => Promise.reject(new Error('offline')),
};

describe('monitor main', () => {
  it('registers exactly the manifest channels', () => {
    const ctx = createRecordingContext();
    monitorMain.register(ctx, { ollama });
    expect([...ctx.channels].sort()).toEqual([...monitorManifest.ipc].sort());
  });

  it('hands the composer the sampler, and a bad start payload is reported, not thrown', async () => {
    const ctx = createRecordingContext();
    const onMetricsService = vi.fn();
    const warn = vi.fn();
    monitorMain.register(ctx, { ollama, onMetricsService, warn });
    expect(onMetricsService).toHaveBeenCalledTimes(1);
    await ctx.invoke(CHANNELS.metricsStart, { intervalMs: 'nope' });
    expect(warn).toHaveBeenCalledTimes(1);
    await ctx.invoke(CHANNELS.metricsStop);
  });

  it('answers system health with the injected daemon probe', async () => {
    const ctx = createRecordingContext();
    monitorMain.register(ctx, { ollama });
    const health = (await ctx.invoke(CHANNELS.systemHealth)) as { ollamaDaemon: { reachable: boolean; host: string } };
    expect(health.ollamaDaemon).toMatchObject({ reachable: false, host: 'http://127.0.0.1:1' });
  }, 20_000);

  it('answers agent usage empty without sessions or a home dir', async () => {
    const ctx = createRecordingContext();
    monitorMain.register(ctx, {});
    expect(await ctx.invoke(CHANNELS.monitorAgentUsage)).toEqual({ sessions: [], agents: [] });
  });
});
