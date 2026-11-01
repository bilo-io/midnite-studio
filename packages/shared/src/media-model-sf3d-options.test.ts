import { describe, expect, it } from 'vitest';

import { ModelEngineSchema } from './media-model';
import { ModelGenerateSf3dInputSchema } from './media-model-mcp';
import { resolveSf3dOptions, SF3D_OPTION_DEFAULTS, sf3dSettingsSuffix, Sf3dOptionsSchema } from './media-model-sf3d-options';

describe('SF3D options', () => {
  it('fills what is left out with the defaults, and keeps what is set', () => {
    expect(resolveSf3dOptions(undefined)).toEqual(SF3D_OPTION_DEFAULTS);
    expect(resolveSf3dOptions({ threshold: 8, removeBackground: true, fov: undefined })).toEqual({ ...SF3D_OPTION_DEFAULTS, threshold: 8, removeBackground: true });
  });

  it('names only the settings that change the result, in a fixed order', () => {
    expect(sf3dSettingsSuffix(1024, undefined)).toBe('');
    expect(sf3dSettingsSuffix(undefined, { decodeBatch: 8192 })).toBe('');
    expect(sf3dSettingsSuffix(2048, { threshold: 8 })).toBe('tex2048-th8');
    expect(sf3dSettingsSuffix(1024, { fov: 30, removeBackground: true, foregroundRatio: 0.9 })).toBe('bg-fg90-fov30');
    expect(sf3dSettingsSuffix(1024, { removeBackground: true, backgroundTolerance: 40 })).toBe('bg40');
    expect(sf3dSettingsSuffix(1024, { threshold: 7.5, cameraDistance: 1.85, roughness: 0.35, metalness: 0.5, resolution: 200 })).toBe('th7p5-def200-rough35-metal50-cam185');
  });

  it('refuses a value outside its range, and a fractional grid setting', () => {
    expect(Sf3dOptionsSchema.safeParse({ threshold: 41 }).success).toBe(false);
    expect(Sf3dOptionsSchema.safeParse({ resolution: 160.5 }).success).toBe(false);
    expect(Sf3dOptionsSchema.safeParse({ foregroundRatio: 0.4 }).success).toBe(false);
    expect(Sf3dOptionsSchema.safeParse({ foregroundRatio: 0.7, metalness: 1 }).success).toBe(true);
  });

  it('is what the engine seam and the MCP tool take, 4096 textures included', () => {
    expect(ModelEngineSchema.parse({ kind: 'sf3d', textureSize: 4096, options: { threshold: 8 } })).toEqual({ kind: 'sf3d', textureSize: 4096, options: { threshold: 8 } });
    expect(ModelGenerateSf3dInputSchema.safeParse({ repoPath: '/r', project: 'props', imagePath: 'a.png', options: { removeBackground: true } }).success).toBe(true);
    expect(ModelGenerateSf3dInputSchema.safeParse({ repoPath: '/r', project: 'props', imagePath: 'a.png', textureSize: 3000 }).success).toBe(false);
  });
});
