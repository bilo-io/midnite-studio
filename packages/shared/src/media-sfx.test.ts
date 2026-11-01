import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  resolveSfxOptions,
  SFX_DOWNLOAD_BYTES,
  SFX_LICENCE_SHA256,
  SFX_LICENCE_TEXT,
  SFX_PINNED_MANIFEST,
  SFX_REPO,
  SFX_REVISION,
  sfxBlockedReason,
  sfxConsentIsCurrent,
  sfxFileUrl,
  SfxGenerateRequestSchema,
  SfxOptionsSchema,
  sfxSettingsSuffix,
  parseSfxSidecar,
} from './index';

const consent = { licenceSha256: SFX_LICENCE_SHA256, acceptedAt: 'now', revenueAcknowledged: true as const };

describe('Stable Audio Open Small pin', () => {
  it('the licence sha is the sha of the text this build shows', () => {
    expect(createHash('sha256').update(SFX_LICENCE_TEXT, 'utf8').digest('hex')).toBe(SFX_LICENCE_SHA256);
    expect(SFX_LICENCE_TEXT).toContain('Stability AI Community License');
  });

  it('pins the four files at a full commit, and the total matches', () => {
    expect(SFX_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(SFX_PINNED_MANIFEST.assets).sort()).toEqual(['cond.onnx', 'dec.onnx', 'dit.onnx', 'tokenizer.json']);
    for (const a of Object.values(SFX_PINNED_MANIFEST.assets)) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(SFX_DOWNLOAD_BYTES).toBe(1_389_353 + 439_547_211 + 312_575_029 + 1_364_171_978);
    expect(sfxFileUrl('dit.onnx')).toBe(`https://huggingface.co/${SFX_REPO}/resolve/${SFX_REVISION}/dit.onnx`);
  });

  it('consent is current only for this licence text', () => {
    expect(sfxConsentIsCurrent(consent)).toBe(true);
    expect(sfxConsentIsCurrent({ ...consent, licenceSha256: '0'.repeat(64) })).toBe(false);
    expect(sfxConsentIsCurrent(null)).toBe(false);
  });
});

describe('SFX options', () => {
  it('fills the distilled defaults and a random seed', () => {
    expect(resolveSfxOptions(undefined, () => 77)).toEqual({ seconds: 3, steps: 8, cfgScale: 1, variations: 1, seed: 77, negativePrompt: '' });
    expect(resolveSfxOptions({ seed: 0, steps: 12 }, () => 77)).toMatchObject({ seed: 0, steps: 12 });
  });

  it('rejects values the model cannot take', () => {
    expect(SfxOptionsSchema.safeParse({ seconds: 12 }).success).toBe(false);
    expect(SfxOptionsSchema.safeParse({ seconds: 0.2 }).success).toBe(false);
    expect(SfxOptionsSchema.safeParse({ steps: 2.5 }).success).toBe(false);
    expect(SfxOptionsSchema.safeParse({ variations: 5 }).success).toBe(false);
    expect(SfxOptionsSchema.safeParse({ seed: -1 }).success).toBe(false);
    expect(SfxOptionsSchema.safeParse({ seconds: 11.8, steps: 32, cfgScale: 7, variations: 4, seed: 2_147_483_647 }).success).toBe(true);
    expect(SfxGenerateRequestSchema.safeParse({ generationId: 'g', repoId: 'r', project: 'p', prompt: '   ' }).success).toBe(false);
  });

  it('names a file by its settings: length and seed always, the rest only when non-default', () => {
    const base = { seconds: 3, steps: 8, cfgScale: 1, seed: 1234, negativePrompt: '' };
    expect(sfxSettingsSuffix(base)).toBe('3s-s1234');
    expect(sfxSettingsSuffix({ ...base, seconds: 2.5, steps: 12, cfgScale: 2.5, negativePrompt: 'music' })).toBe('2p5s-st12-cfg2p5-neg-s1234');
    expect(sfxSettingsSuffix({ ...base, negativePrompt: 'music' })).toBe('3s-s1234');
  });
});

describe('sfxBlockedReason', () => {
  const status = { state: 'installed' as const, consent, bytesOnDisk: 1, totalBytes: 1 };
  it('walks consent, install, running, prompt in that order', () => {
    expect(sfxBlockedReason(undefined, 'x', false)).toMatch(/Checking/);
    expect(sfxBlockedReason({ ...status, consent: null }, 'x', false)).toMatch(/License/);
    expect(sfxBlockedReason({ ...status, state: 'not-installed' }, 'x', false)).toMatch(/Install/);
    expect(sfxBlockedReason(status, 'x', true)).toMatch(/already running/);
    expect(sfxBlockedReason(status, ' ', false)).toMatch(/Describe/);
    expect(sfxBlockedReason(status, 'zap', false)).toBeNull();
    expect(sfxBlockedReason({ ...status, state: 'unavailable', reason: 'nope' }, 'zap', false)).toBe('nope');
  });
});

describe('parseSfxSidecar', () => {
  it('reads a valid sidecar and refuses anything else', () => {
    const sidecar = {
      version: 1,
      kind: 'sfx',
      file: 'zap.wav',
      prompt: 'zap',
      seconds: 1,
      steps: 8,
      cfgScale: 1,
      seed: 1,
      sampleRate: 44_100,
      channels: 2,
      model: { name: 'm', repo: SFX_REPO, revision: SFX_REVISION, upstream: 'u' },
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    expect(parseSfxSidecar(JSON.stringify(sidecar))?.file).toBe('zap.wav');
    expect(parseSfxSidecar('{')).toBeNull();
    expect(parseSfxSidecar(JSON.stringify({ ...sidecar, kind: 'music' }))).toBeNull();
  });
});
