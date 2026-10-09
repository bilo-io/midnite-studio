import { describe, expect, it, vi } from 'vitest';

import { base64ToArrayBuffer, createGmInstrument } from './gm-sampler';

// Fake Tone: the factory is tested for its routing decisions, not for audio.
function fakeTone() {
  const node = () => {
    const self = { connect: vi.fn(() => self), dispose: vi.fn(), triggerAttackRelease: vi.fn(), frequency: { value: 0 } };
    return self;
  };
  const Tone = {
    Gain: vi.fn(node),
    MembraneSynth: vi.fn(node),
    NoiseSynth: vi.fn(node),
    MetalSynth: vi.fn(node),
    PolySynth: vi.fn(node),
    Synth: vi.fn(),
    Sampler: vi.fn(node),
    loaded: vi.fn(async () => undefined),
    now: () => 0,
    getContext: () => ({ rawContext: { decodeAudioData: vi.fn(async () => ({ fake: 'buffer' })) } }),
    Frequency: (value: string | number) => ({ toMidi: () => (typeof value === 'number' ? value : 36), toNote: () => 'C4' }),
  };
  return Tone;
}
const load = (tone: ReturnType<typeof fakeTone>) => async () => tone as never;

const bridgeWith = (result: unknown) => ({ gm: { load: vi.fn(async () => result) } }) as never;

describe('createGmInstrument', () => {
  it('uses the synthesised drum kit on channel 10 without asking main for samples', async () => {
    const bridge = bridgeWith({ ok: false });
    const instrument = await createGmInstrument({ program: 0, channel: 9, bridge, loadTone: load(fakeTone()) });
    expect(instrument.source).toBe('drum-kit');
    expect(instrument.missing).toBe(false);
    expect((bridge as { gm: { load: ReturnType<typeof vi.fn> } }).gm.load).not.toHaveBeenCalled();
  });

  it('builds a Sampler from cached samples', async () => {
    const tone = fakeTone();
    const bridge = bridgeWith({ ok: true, value: { program: 0, notes: { C4: 'QUJD' } } });
    const instrument = await createGmInstrument({ program: 0, bridge, loadTone: load(tone) });
    expect(instrument.source).toBe('sampler');
    expect(tone.Sampler).toHaveBeenCalledOnce();
    expect(instrument.missing).toBe(false);
  });

  it('falls back to a synth, flagged missing, when the program is not downloaded', async () => {
    const instrument = await createGmInstrument({
      program: 40,
      bridge: bridgeWith({ ok: false, kind: 'error', message: 'Instrument not downloaded' }),
      loadTone: load(fakeTone()),
    });
    expect(instrument.source).toBe('synth-fallback');
    expect(instrument.missing).toBe(true);
  });

  it('falls back to a synth when the bridge throws or is absent', async () => {
    const throwing = { gm: { load: vi.fn(async () => { throw new Error('boom'); }) } } as never;
    expect((await createGmInstrument({ program: 1, bridge: throwing, loadTone: load(fakeTone()) })).source).toBe('synth-fallback');
    expect((await createGmInstrument({ program: 1, loadTone: load(fakeTone()) })).source).toBe('synth-fallback');
  });
});

describe('base64ToArrayBuffer', () => {
  it('decodes bytes', () => {
    expect(Array.from(new Uint8Array(base64ToArrayBuffer('QUJD')))).toEqual([65, 66, 67]);
  });
});
