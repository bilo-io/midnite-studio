import { describe, expect, it } from 'vitest';

import { MEDIA_TABS, MEDIA_TAB_EXPORT_FORMATS, REPO_SCOPED_MEDIA_TABS } from './media';
import {
  DEFAULT_GAMES_SETTINGS,
  GameManifestSchema,
  GamesSettingsSchema,
  gameSlug,
  parseGameManifest,
} from './media-game';

const manifest = {
  version: 1,
  name: 'Moon Rover',
  engine: 'phaser',
  dimension: '2d',
  perspective: 'platformer',
  genre: null,
  starter: 'blank',
  cameraPresets: [],
  entry: 'index.html',
  kitVersion: '0.1.0',
  vendored: {},
  assets: [],
  network: 'off',
  deterministic: false,
  keepSaveData: false,
};

describe('GameManifestSchema', () => {
  it('round trips', () => {
    const parsed = parseGameManifest(manifest);
    expect(parsed).toEqual({ ok: true, manifest });
    expect(parseGameManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(parsed);
  });

  it('keeps keys an agent added', () => {
    const parsed = parseGameManifest({ ...manifest, notes: 'jump height tuned' });
    expect(parsed.ok && (parsed.manifest as Record<string, unknown>)['notes']).toBe('jump height tuned');
  });

  it('fills defaults for the optional fields', () => {
    const { cameraPresets, assets, network, deterministic, keepSaveData, vendored, entry, ...minimal } = manifest;
    void [cameraPresets, assets, network, deterministic, keepSaveData, vendored, entry];
    const parsed = parseGameManifest(minimal);
    expect(parsed.ok && parsed.manifest).toMatchObject({ network: 'off', deterministic: false, keepSaveData: false, assets: [], entry: 'index.html' });
  });

  it('returns issues instead of throwing on a hand-edited file', () => {
    for (const bad of [null, 'text', 42, [], {}, { ...manifest, engine: 'unity' }, { ...manifest, kitVersion: 'latest' }, { ...manifest, name: '' }]) {
      const parsed = parseGameManifest(bad);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.issues.length).toBeGreaterThan(0);
    }
    const parsed = parseGameManifest({ ...manifest, engine: 'unity' });
    expect(!parsed.ok && parsed.issues[0]?.path).toBe('engine');
  });

  it('rejects a name longer than 80 characters', () => {
    expect(GameManifestSchema.safeParse({ ...manifest, name: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('games settings', () => {
  it('defaults match the documented ones', () => {
    expect(DEFAULT_GAMES_SETTINGS).toEqual({
      version: 1,
      gamesRoot: null,
      defaultEngine: 'phaser',
      defaultNetwork: 'off',
      squashRunCommits: false,
    });
    expect(GamesSettingsSchema.safeParse(DEFAULT_GAMES_SETTINGS).success).toBe(true);
  });
});

describe('gameSlug', () => {
  it.each([
    ['Moon Rover', 'moon-rover'],
    ['  Café  Run!! ', 'cafe-run'],
    ['../../etc/passwd', 'etc-passwd'],
    ['***', 'game'],
    ['x'.repeat(100), 'x'.repeat(60)],
  ])('%j -> %j', (name, slug) => {
    expect(gameSlug(name)).toBe(slug);
  });
});

describe('the game tab', () => {
  it('is a Media tab that does not need an open repo', () => {
    expect(MEDIA_TABS).toContain('game');
    expect(REPO_SCOPED_MEDIA_TABS).not.toContain('game');
    expect(MEDIA_TAB_EXPORT_FORMATS.game).toEqual(['game-html', 'game-zip', 'game-folder']);
  });
});
