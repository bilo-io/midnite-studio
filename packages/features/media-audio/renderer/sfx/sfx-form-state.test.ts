import { describe, expect, it } from 'vitest';

import { initialSfxForm, sfxFormFromSidecar, toSfxRequest } from './sfx-form-state';

describe('toSfxRequest', () => {
  it('sends every knob, with no seed when the field is empty (a random one per run)', () => {
    expect(toSfxRequest({ ...initialSfxForm(), prompt: '  laser zap ' })).toEqual({
      prompt: 'laser zap',
      options: { seconds: 3, steps: 8, cfgScale: 1, variations: 1 },
    });
  });

  it('keeps a seed and a name, and a negative prompt only when guidance is on', () => {
    const base = { ...initialSfxForm(), prompt: 'door creak', name: 'Door', seed: '42', negativePrompt: 'music' };
    expect(toSfxRequest(base)).toEqual({ prompt: 'door creak', name: 'Door', options: { seconds: 3, steps: 8, cfgScale: 1, variations: 1, seed: 42 } });
    expect(toSfxRequest({ ...base, cfgScale: 3 })).toMatchObject({ options: { cfgScale: 3, negativePrompt: 'music', seed: 42 } });
  });

  it('names what is wrong', () => {
    expect(toSfxRequest({ ...initialSfxForm(), prompt: ' ' })).toEqual({ error: 'Describe the sound.' });
    expect(toSfxRequest({ ...initialSfxForm(), prompt: 'x', seed: '9999999999' })).toMatchObject({ error: expect.stringMatching(/seed/) });
    expect(toSfxRequest({ ...initialSfxForm(), prompt: 'x'.repeat(501) })).toMatchObject({ error: expect.stringMatching(/500/) });
  });
});

describe('sfxFormFromSidecar', () => {
  it('reloads a take’s prompt and settings, seed included, as one variation', () => {
    const form = sfxFormFromSidecar({
      version: 1,
      kind: 'sfx',
      file: 'a.wav',
      prompt: 'zap',
      negativePrompt: 'hum',
      seconds: 2,
      steps: 12,
      cfgScale: 2.5,
      seed: 7,
      sampleRate: 44_100,
      channels: 2,
      model: { name: 'm', repo: 'r', revision: 'v', upstream: 'u' },
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    expect(form).toEqual({ prompt: 'zap', name: '', seconds: 2, steps: 12, cfgScale: 2.5, variations: 1, seed: '7', negativePrompt: 'hum' });
  });
});
