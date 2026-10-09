import { describe, expect, it } from 'vitest';

import { MEDIA_TABS, MEDIA_TAB_EXPORT_FORMATS, REPO_SCOPED_MEDIA_TABS } from './media';
import {
  GAME_REPLAY_MAX_FRAMES,
  GamePlaytestSchema,
  GameReplaySchema,
  checkGameOllamaPath,
  DEFAULT_GAMES_SETTINGS,
  GAME_PASSES_DEFAULT,
  GAME_PASSES_MAX,
  GameAgentRunRequestSchema,
  GameAgentUndoRequestSchema,
  gameEngineWarnings,
  GAMES_OLLAMA_WARNING,
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

describe('Theme M — create and iterate', () => {
  it('accepts only .js/.json paths under src/ in an Ollama envelope', () => {
    expect(checkGameOllamaPath('src/main.js')).toEqual({ ok: true, path: 'src/main.js' });
    expect(checkGameOllamaPath('./src//data/quests.json')).toEqual({ ok: true, path: 'src/data/quests.json' });
    for (const bad of ['kit/core/rng.js', 'vendor/phaser.js', '../src/main.js', 'src/../kit/x.js', '/src/main.js', 'C:/src/x.js', 'src/readme.md', 'src\\..\\kit\\x.js']) {
      expect(checkGameOllamaPath(bad).ok, bad).toBe(false);
    }
  });

  it('warns for Ollama engines only, and bounds a run request', () => {
    expect(gameEngineWarnings({ kind: 'ollama', model: 'qwen' })).toEqual([GAMES_OLLAMA_WARNING]);
    expect(gameEngineWarnings({ kind: 'agent', agentId: 'claude' })).toEqual([]);
    expect(gameEngineWarnings(undefined)).toEqual([]);
    const base = { gameId: 'g1', prompt: 'jump', engine: { kind: 'agent', agentId: 'claude' } };
    expect(GameAgentRunRequestSchema.parse(base).passes).toBe(GAME_PASSES_DEFAULT);
    expect(GameAgentRunRequestSchema.safeParse({ ...base, passes: GAME_PASSES_MAX + 1 }).success).toBe(false);
    expect(GameAgentRunRequestSchema.safeParse({ ...base, prompt: '  ' }).success).toBe(false);
    expect(GameAgentUndoRequestSchema.safeParse({ gameId: 'g1', sha: '--abort' }).success).toBe(false);
  });
});

describe('play-test schemas (Theme O)', () => {
  const replay = { version: 1, seed: 7, frames: 120, events: [{ f: 0, action: 'right', down: true }, { f: 90, action: 'right', down: false }] };

  it('round-trips a replay through JSON', () => {
    const parsed = GameReplaySchema.parse(JSON.parse(JSON.stringify(replay)));
    expect(GameReplaySchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(replay);
  });

  it('refuses an event past the replay’s end and a frame count past the cap', () => {
    expect(GameReplaySchema.safeParse({ ...replay, events: [{ f: 121, action: 'right', down: true }] }).success).toBe(false);
    expect(GameReplaySchema.safeParse({ ...replay, frames: GAME_REPLAY_MAX_FRAMES + 1 }).success).toBe(false);
  });

  it('accepts a play-test with an inline replay or a path, and both assertion kinds', () => {
    const playtest = {
      version: 1,
      name: 'smoke',
      replay,
      asserts: [
        { frame: 120, kind: 'state', path: '$.scene', op: 'eq', value: 'level' },
        { frame: 120, kind: 'frame', tolerance: 0.02 },
      ],
    };
    expect(GamePlaytestSchema.safeParse(playtest).success).toBe(true);
    expect(GamePlaytestSchema.safeParse({ ...playtest, replay: 'playtests/replays/walk.replay.json' }).success).toBe(true);
    expect(GamePlaytestSchema.safeParse({ ...playtest, asserts: [] }).success).toBe(false);
    expect(GamePlaytestSchema.safeParse({ ...playtest, name: '../x' }).success).toBe(false);
    expect(GamePlaytestSchema.safeParse({ ...playtest, asserts: [{ frame: 1, kind: 'state', path: '$', op: 'matches' }] }).success).toBe(false);
  });
});
