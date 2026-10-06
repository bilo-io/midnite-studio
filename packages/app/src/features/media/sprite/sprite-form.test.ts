import { describe, expect, it } from 'vitest';
import { SpriteAssetSpecSchema } from '@midnite/studio-shared';

import {
  envBlockedReason,
  envFormToSpec,
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
});
