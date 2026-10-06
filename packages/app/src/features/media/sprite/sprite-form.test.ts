import { describe, expect, it } from 'vitest';
import { SpriteAssetSpecSchema } from '@midnite/studio-shared';

import {
  envBlockedReason,
  envFormToSpec,
  formRecommendation,
  initialEnvForm,
  initialSheetForm,
  needsRig,
  sheetBlockedReason,
  sheetFormToSpec,
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
