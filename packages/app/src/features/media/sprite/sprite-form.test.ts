import { describe, expect, it } from 'vitest';
import { MAP_NEEDS_TILESET, SpriteAssetSpecSchema } from '@midnite/studio-shared';

import {
  envBlockedReason,
  envFormToSpec,
  envGenerates,
  parsePropLines,
  formRecommendation,
  initialEnvForm,
  initialSheetForm,
  mirrorApplies,
  needsRig,
  providerBlockedFor,
  sheetBlockedReason,
  sheetFormToSpec,
  withReferenceProvider,
} from './sprite-form';

const form = () => ({ ...initialSheetForm('gemini', 'm'), name: 'Knight', prompt: 'a knight' });

describe('sheet form', () => {
  it('starts with the side preset clips and the recommended method', () => {
    const f = initialSheetForm('gemini', 'm');
    expect(f.clips.map((c) => c.name)).toEqual(['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'hurt', 'die']);
    expect(f.method).toBe('hand-drawn');
  });

  it('becomes a spec the schema accepts', () => {
    const spec = SpriteAssetSpecSchema.parse(sheetFormToSpec(form()));
    expect(spec).toMatchObject({ kind: 'sheet', name: 'Knight', frameSize: [64, 64], method: 'hand-drawn', provider: 'gemini' });
  });

  it('names what blocks Generate', () => {
    expect(sheetBlockedReason(initialSheetForm('gemini', 'm'))).toBe('Name the sprite first.');
    expect(sheetBlockedReason({ ...form(), prompt: '' })).toBe('Describe what to draw.');
    expect(sheetBlockedReason({ ...form(), clips: [] })).toBe('Add at least one clip.');
    expect(sheetBlockedReason({ ...form(), clips: [{ name: 'Walk!', frames: 4, fps: 8, loop: 'loop' }] })).toMatch(/lower-case/);
    expect(sheetBlockedReason(form())).toBeNull();
  });

  it('swaps Generate for an attach prompt when rendering with no model, and recommends rendering once one is attached', () => {
    const f = { ...form(), method: 'rendered' as const };
    expect(needsRig(f)).toBe(true);
    const attached = { ...f, rig: { project: 'characters', path: 'knight' } };
    expect(needsRig(attached)).toBe(false);
    expect(formRecommendation({ ...form(), rig: attached.rig }).method).toBe('rendered');
    expect(sheetFormToSpec(attached).reference).toEqual({ kind: 'model', project: 'characters', path: 'knight' });
  });
});

describe('hand-drawn (Phase 106 Theme D)', () => {
  it('disables reference-blind providers with the reason, only for hand-drawn', () => {
    expect(providerBlockedFor('hand-drawn', 'agy')).toBe("Antigravity CLI can't use a reference image, so frames would not match. Pick Gemini or OpenAI.");
    expect(providerBlockedFor('hand-drawn', 'openai')).toBeNull();
    expect(providerBlockedFor('one-shot', 'agy')).toBeNull();
  });

  it('moves a hand-drawn form off a provider or model that cannot take a reference', () => {
    expect(withReferenceProvider({ ...form(), provider: 'agy', model: 'agy-default' })).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash-image' });
    expect(withReferenceProvider({ ...form(), provider: 'gemini', model: 'imagen-4.0-generate-001' }).model).toBe('gemini-2.5-flash-image');
    expect(withReferenceProvider({ ...form(), method: 'one-shot', provider: 'agy', model: 'agy-default' }).provider).toBe('agy');
    expect(sheetBlockedReason({ ...form(), provider: 'gemini', model: 'imagen-4.0-generate-001' })).toMatch(/Imagen can't use a reference image/);
  });

  it('writes the consistency switch and mirroring into the spec', () => {
    const spec = SpriteAssetSpecSchema.parse(sheetFormToSpec({ ...form(), checkConsistency: false, asymmetric: true }));
    expect(spec).toMatchObject({ consistency: { enabled: false }, mirror: false });
    expect(mirrorApplies(form())).toBe(true);
    expect(mirrorApplies({ ...form(), directions: 4 })).toBe(false);
  });
});

describe('environment form', () => {
  it('maps each kind to its spec kind', () => {
    const base = { ...initialEnvForm(), name: 'x' };
    const kinds = (['tileset', 'isometric', 'background', 'prop-sheet', 'map'] as const).map((kind) => SpriteAssetSpecSchema.parse(envFormToSpec({ ...base, kind })));
    expect(kinds.map((k) => k.kind)).toEqual(['tileset', 'tileset', 'background', 'prop-sheet', 'map']);
    expect(kinds[1]).toMatchObject({ projection: 'isometric' });
  });

  it('needs a name', () => {
    expect(envBlockedReason(initialEnvForm())).toBe('Name the asset first.');
  });

  it('starts as a 32 px blob47 grass and dirt tileset', () => {
    const spec = SpriteAssetSpecSchema.parse(envFormToSpec({ ...initialEnvForm(), name: 'Meadow' }));
    expect(spec).toMatchObject({ kind: 'tileset', tileSize: 32, scheme: 'blob47', transitions: [{ a: 'grass', b: 'dirt' }] });
    expect(spec.kind === 'tileset' && spec.terrains.map((t) => t.id)).toEqual(['grass', 'dirt']);
    expect(envBlockedReason({ ...initialEnvForm(), name: 'Meadow' })).toBeNull();
  });

  it('refuses a transition to a terrain the tileset lacks', () => {
    const form = { ...initialEnvForm(), name: 'x', transitions: [{ a: 'grass', b: 'lava' }] };
    expect(envBlockedReason(form)).toMatch(/lava/);
  });

  it('renders a terrain instead of drawing bases, and wants one picked', () => {
    const form = { ...initialEnvForm(), name: 'x', fromTerrain: { project: '', terrain: '', metresPerTile: 4 } };
    expect(envBlockedReason(form)).toBe('Pick a terrain to render.');
    const picked = { ...form, fromTerrain: { project: 'terrains', terrain: 'isle-1', metresPerTile: 8 } };
    expect(envBlockedReason(picked)).toBeNull();
    expect(envFormToSpec(picked)).toMatchObject({ fromTerrain: { project: 'terrains', terrain: 'isle-1', metresPerTile: 8 } });
  });

  it('a background carries its layers and size', () => {
    const spec = SpriteAssetSpecSchema.parse(envFormToSpec({ ...initialEnvForm(), name: 'Dusk', kind: 'background', bgSize: [1280, 720] }));
    expect(spec).toMatchObject({ kind: 'background', size: [1280, 720] });
    expect(spec.kind === 'background' && spec.layers.map((l) => l.scrollFactor)).toEqual([0, 0.2, 0.5, 0.8]);
    const dup = { ...initialEnvForm(), name: 'x', kind: 'background' as const, layers: [...initialEnvForm().layers, { name: 'far', prompt: '', scrollFactor: 0.3 }] };
    expect(envBlockedReason(dup)).toMatch(/far/);
  });

  it('a prop sheet reads one prop per line', () => {
    expect(parsePropLines('crate: a wooden crate\n\n  Big Barrel \n3 coins: gold')).toEqual([
      { name: 'crate', prompt: 'a wooden crate' },
      { name: 'big-barrel', prompt: 'Big Barrel' },
      { name: 'prop-3-coins', prompt: 'gold' },
    ]);
    const form = { ...initialEnvForm(), name: 'Camp', kind: 'prop-sheet' as const };
    expect(SpriteAssetSpecSchema.parse(envFormToSpec(form))).toMatchObject({ kind: 'prop-sheet', props: [{ name: 'crate' }, { name: 'barrel' }, { name: 'sign' }] });
    expect(envBlockedReason({ ...form, propsText: '  ' })).toBe('Add at least one prop.');
    expect(envBlockedReason({ ...form, propsText: 'crate\ncrate: another' })).toBe('Two props are called crate.');
  });

  it('a map needs a tileset, takes the layout engine and its decorations, and is generated (Theme J)', () => {
    expect(envGenerates('map')).toBe(true);
    const form = { ...initialEnvForm(), name: 'Island', kind: 'map' as const };
    expect(envBlockedReason(form)).toBe(MAP_NEEDS_TILESET);
    const ready = { ...form, mapTileset: 'meadow-20261004-120000', mapProps: 'crates-20261004-120000', mapDensity: 0.3 };
    expect(envBlockedReason(ready)).toBeNull();
    expect(SpriteAssetSpecSchema.parse(envFormToSpec(ready, { kind: 'ollama', model: 'qwen2.5:7b' }))).toMatchObject({
      kind: 'map',
      size: [32, 24],
      tileset: { group: 'tilesets', asset: 'meadow-20261004-120000' },
      decorations: { props: { group: 'objects', asset: 'crates-20261004-120000' }, density: 0.3 },
      engine: { kind: 'ollama', model: 'qwen2.5:7b' },
    });
  });
});
