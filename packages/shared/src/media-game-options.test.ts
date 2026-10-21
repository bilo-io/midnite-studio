import { describe, expect, it } from 'vitest';

import {
  GameCreateRequestSchema,
  GameManifestSchema,
  GameOptionsSchema,
  parseGameManifest,
} from './media-game';
import {
  defaultGameOptions,
  emptyGameOptions,
  gameOptionAvailability,
  normalizeGameOptions,
  renderGameOptionsPrompt,
} from './media-game-options';

const OLD_MANIFEST = {
  version: 1,
  name: 'Old',
  engine: 'phaser',
  dimension: '2d',
  perspective: 'platformer',
  genre: null,
  starter: 'platformer',
  kitVersion: '0.9.0',
};

describe('GameOptionsSchema', () => {
  it('parses a manifest written before options existed', () => {
    const parsed = parseGameManifest(OLD_MANIFEST);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.manifest.options).toBeUndefined();
  });

  it('fills defaults for a partial options object', () => {
    const options = GameOptionsSchema.parse({ npcs: true });
    expect(options.npcs).toBe(true);
    expect(options.enemies).toBe(false);
    expect(options.dayNight).toEqual({ enabled: false, minutesPerDay: 4 });
  });

  it('rejects a day length outside 2 to 60 minutes', () => {
    expect(GameOptionsSchema.safeParse({ dayNight: { enabled: true, minutesPerDay: 1 } }).success).toBe(false);
    expect(GameOptionsSchema.safeParse({ dayNight: { enabled: true, minutesPerDay: 61 } }).success).toBe(false);
  });

  it('round-trips through the manifest and the create request', () => {
    const options = { ...emptyGameOptions(), bosses: true };
    expect(GameManifestSchema.parse({ ...OLD_MANIFEST, options }).options).toEqual(options);
    const req = GameCreateRequestSchema.parse({ name: 'x', engine: 'phaser', perspective: 'platformer', options });
    expect(req.options).toEqual(options);
  });
});

describe('defaultGameOptions', () => {
  it('turns everything off for a blank base', () => {
    expect(defaultGameOptions(null)).toEqual(emptyGameOptions());
  });
  it('crime defaults law enforcement and wanted on', () => {
    const o = defaultGameOptions('crime');
    expect(o.lawEnforcement && o.wanted).toBe(true);
    expect(o.dayNight.enabled).toBe(true);
  });
  it('soulslike defaults bosses on and law enforcement off', () => {
    const o = defaultGameOptions('soulslike');
    expect(o.bosses).toBe(true);
    expect(o.lawEnforcement).toBe(false);
  });
  it('every genre default survives normalisation for its native perspective', () => {
    for (const genre of ['fps', 'rts', 'arpg', 'crime', 'shooter', 'fighter', 'soulslike', 'rpg', 'character-action', 'open-world'] as const) {
      const o = defaultGameOptions(genre);
      const native = genre === 'fps' ? 'raycaster' : genre === 'rts' || genre === 'crime' ? 'top-down' : genre === 'arpg' ? 'isometric' : genre === 'shooter' ? 'first-person' : 'third-person';
      expect(normalizeGameOptions(o, { genre, perspective: native }), genre).toEqual(o);
    }
  });
});

describe('availability', () => {
  it('hides the day clock for the raycaster and the fighter, with a reason', () => {
    const ray = gameOptionAvailability('dayNight', { genre: 'fps', perspective: 'raycaster' });
    expect(ray.available).toBe(false);
    expect(gameOptionAvailability('dayNight', { genre: 'fighter', perspective: 'third-person' }).available).toBe(false);
    expect(gameOptionAvailability('dayNight', { genre: 'rpg', perspective: 'third-person' }).available).toBe(true);
  });
  it('wanted needs law enforcement; revenge needs enemies or npcs', () => {
    const ctx = { genre: null, perspective: 'top-down' } as const;
    expect(gameOptionAvailability('wanted', ctx, emptyGameOptions()).available).toBe(false);
    expect(gameOptionAvailability('revenge', ctx, emptyGameOptions()).available).toBe(false);
    expect(gameOptionAvailability('revenge', ctx, { ...emptyGameOptions(), npcs: true }).available).toBe(true);
  });
  it('normalising switches off a child whose parent is off', () => {
    const o = normalizeGameOptions({ ...emptyGameOptions(), wanted: true, revenge: true }, { genre: null, perspective: 'top-down' });
    expect(o.wanted).toBe(false);
    expect(o.revenge).toBe(false);
  });
});

describe('renderGameOptionsPrompt', () => {
  it('lists requested features and names what is left out', () => {
    const text = renderGameOptionsPrompt({
      ...emptyGameOptions(),
      dayNight: { enabled: true, minutesPerDay: 12 },
      npcs: true,
      bosses: true,
    });
    expect(text).toMatch(/^Requested features/);
    expect(text).toContain('- Day/night cycle: one full game day lasts 12 minutes of real time');
    expect(text).toContain('- NPCs:');
    expect(text).toContain('- Bosses:');
    expect(text).toMatch(/Not requested, so do not add: .*enemies.*missions/);
    expect(text).not.toMatch(/- Enemies:/);
  });
  it('says so when nothing is requested', () => {
    expect(renderGameOptionsPrompt(emptyGameOptions())).toContain('- None.');
  });
});
