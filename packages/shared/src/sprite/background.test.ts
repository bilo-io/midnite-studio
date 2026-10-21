import { describe, expect, it } from 'vitest';

import { BackgroundSpecSchema } from '../media-sprite';
import { backgroundBlocker, BackgroundJsonSchema, backgroundLayerFile, buildBackgroundJson, isOpaqueLayer } from './background';

describe('background.json', () => {
  const spec = BackgroundSpecSchema.parse({ kind: 'background', name: 'dusk' });

  it('defaults to four layers with the doc scroll factors', () => {
    expect(spec.size).toEqual([1920, 1080]);
    expect(spec.layers.map((l) => [l.name, l.scrollFactor])).toEqual([['sky', 0], ['far', 0.2], ['mid', 0.5], ['near', 0.8]]);
  });

  it('lists each layer image with its scroll factor', () => {
    const json = buildBackgroundJson(spec);
    expect(() => BackgroundJsonSchema.parse(json)).not.toThrow();
    expect(json).toMatchObject({ version: 1, size: [1920, 1080] });
    expect(json.layers[1]).toEqual({ image: backgroundLayerFile('far'), scrollFactor: 0.2 });
  });

  it('takes three to five layers', () => {
    const layer = (name: string) => ({ name, prompt: '', scrollFactor: 0.5 });
    expect(BackgroundSpecSchema.safeParse({ kind: 'background', name: 'x', layers: [layer('a'), layer('b')] }).success).toBe(false);
    expect(BackgroundSpecSchema.safeParse({ kind: 'background', name: 'x', layers: ['a', 'b', 'c', 'd', 'e', 'f'].map(layer) }).success).toBe(false);
    expect(BackgroundSpecSchema.safeParse({ kind: 'background', name: 'x', layers: ['a', 'b', 'c'].map(layer) }).success).toBe(true);
  });

  it('refuses duplicate layer names and keeps only the sky opaque', () => {
    expect(backgroundBlocker({ layers: [...spec.layers, { name: 'far', prompt: '', scrollFactor: 0.3 }] })).toMatch(/far/);
    expect(backgroundBlocker(spec)).toBeNull();
    expect(isOpaqueLayer('sky')).toBe(true);
    expect(isOpaqueLayer('far')).toBe(false);
  });
});
