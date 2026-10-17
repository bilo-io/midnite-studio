import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { mediaGameMain, type MediaGameMainServices } from './main';
import { mediaGameManifest } from './manifest';

/** Never reached: a bad payload is answered before a service is called, and "unavailable" answers before a port is. */
const refusing = (): never => {
  throw new Error('the runtime must not be reached');
};
const runtime = new Proxy({}, { get: () => refusing }) as MediaGameMainServices['runtime'];
const log = Object.assign(() => undefined, { info: () => undefined, warn: () => undefined, error: () => undefined });

const services = (over: Partial<MediaGameMainServices> = {}): MediaGameMainServices => ({
  runtime,
  log,
  pickSavePath: async () => null,
  ...over,
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-game manifest', () => {
  it('belongs to the media folder, composed by Gamer (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-game']).toEqual({ folder: mediaGameManifest.feature, placement: 'gamer' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaGameManifest.feature])).toContain(mediaGameManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaGameManifest.views).toEqual([]);
  });

  it('names only real games channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaGameManifest.ipc, ...mediaGameManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:games:/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels, agents and play-tests or not', () => {
    for (const over of [{}, { agents: { run: refusing, cancel: refusing, undo: refusing }, playtests: { list: refusing, run: refusing } }]) {
      const ctx = createRecordingContext();
      mediaGameMain.register(ctx, services(over));
      expect([...ctx.channels].sort()).toEqual([...mediaGameManifest.ipc].sort());
    }
  });
});

describe('media-game main half', () => {
  it('answers agents and play-tests as unavailable in an app that wires neither', async () => {
    const ctx = createRecordingContext();
    mediaGameMain.register(ctx, services());
    expect(await ctx.invoke(CHANNELS.gamesAgentRun, { gameId: 'g0123456789ab', prompt: 'hi' })).toMatchObject({
      ok: false,
    });
    expect(await ctx.invoke(CHANNELS.gamesPlaytests, { gameId: 'g0123456789ab' })).toEqual({
      ok: false,
      kind: 'error',
      message: 'Play-tests are not available in this app.',
    });
  });

  it('answers a bad payload with the envelope or the empty value, never a throw', async () => {
    const ctx = createRecordingContext();
    mediaGameMain.register(ctx, services());
    expect(await ctx.invoke(CHANNELS.gamesRun, {})).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.gamesLogs, {})).toEqual({ runId: null, entries: [] });
    expect(await ctx.invoke(CHANNELS.gamesGetManifest, {})).toMatchObject({ manifest: null });
  });
});
