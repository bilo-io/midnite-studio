import type { SongEffect, SongEffectType } from '@midnite/studio-shared';

/**
 * The effects catalogue (Phase 101 Theme F): what each effect is called, which parameters it
 * exposes and their ranges. Pure data — `tone-host.ts` maps the same parameter names onto Tone.js
 * options, so a song stores only `{type, params}` and never a Tone class.
 */
export type EffectParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
};

export type EffectSpec = {
  type: SongEffectType;
  label: string;
  params: readonly EffectParamSpec[];
};

const p = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  step: number,
  unit = '',
): EffectParamSpec => ({
  key,
  label,
  min,
  max,
  step,
  default: def,
  unit,
});

export const EFFECTS: Record<SongEffectType, EffectSpec> = {
  reverb: {
    type: 'reverb',
    label: 'Reverb',
    params: [
      p('decay', 'Decay', 0.1, 10, 2.5, 0.1, 's'),
      p('preDelay', 'Pre-delay', 0, 0.5, 0.01, 0.01, 's'),
      p('wet', 'Mix', 0, 1, 0.3, 0.01),
    ],
  },
  delay: {
    type: 'delay',
    label: 'Delay',
    params: [
      p('delayTime', 'Time', 0.01, 1, 0.25, 0.01, 's'),
      p('feedback', 'Feedback', 0, 0.95, 0.35, 0.01),
      p('wet', 'Mix', 0, 1, 0.3, 0.01),
    ],
  },
  eq3: {
    type: 'eq3',
    label: 'EQ',
    params: [
      p('low', 'Low', -24, 24, 0, 0.5, 'dB'),
      p('mid', 'Mid', -24, 24, 0, 0.5, 'dB'),
      p('high', 'High', -24, 24, 0, 0.5, 'dB'),
    ],
  },
  compressor: {
    type: 'compressor',
    label: 'Compressor',
    params: [
      p('threshold', 'Threshold', -60, 0, -24, 1, 'dB'),
      p('ratio', 'Ratio', 1, 20, 4, 0.5),
      p('attack', 'Attack', 0, 1, 0.003, 0.001, 's'),
      p('release', 'Release', 0, 1, 0.25, 0.01, 's'),
    ],
  },
  chorus: {
    type: 'chorus',
    label: 'Chorus',
    params: [
      p('frequency', 'Rate', 0.1, 10, 1.5, 0.1, 'Hz'),
      p('depth', 'Depth', 0, 1, 0.7, 0.01),
      p('wet', 'Mix', 0, 1, 0.5, 0.01),
    ],
  },
  distortion: {
    type: 'distortion',
    label: 'Distortion',
    params: [p('distortion', 'Drive', 0, 1, 0.4, 0.01), p('wet', 'Mix', 0, 1, 1, 0.01)],
  },
  filter: {
    type: 'filter',
    label: 'Low-pass filter',
    params: [
      p('frequency', 'Cutoff', 20, 20000, 4000, 10, 'Hz'),
      p('Q', 'Resonance', 0.1, 20, 1, 0.1),
    ],
  },
};

export const EFFECT_TYPES = Object.keys(EFFECTS) as SongEffectType[];

export const paramSpec = (type: SongEffectType, key: string): EffectParamSpec | undefined =>
  EFFECTS[type].params.find((s) => s.key === key);

export const clampParam = (spec: EffectParamSpec, value: number): number =>
  Math.min(spec.max, Math.max(spec.min, value));

/** A parameter's value on an effect: the stored one clamped into range, else the default. */
export function effectParam(effect: Pick<SongEffect, 'type' | 'params'>, key: string): number {
  const spec = paramSpec(effect.type, key);
  if (!spec) return effect.params[key] ?? 0;
  const stored = effect.params[key];
  return stored === undefined ? spec.default : clampParam(spec, stored);
}

/** Every parameter of an effect, defaults filled in. */
export function resolvedParams(
  effect: Pick<SongEffect, 'type' | 'params'>,
): Record<string, number> {
  return Object.fromEntries(
    EFFECTS[effect.type].params.map((s) => [s.key, effectParam(effect, s.key)]),
  );
}
