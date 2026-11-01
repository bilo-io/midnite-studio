import { SFX_OPTION_DEFAULTS, SFX_PROMPT_MAX, SFX_SEED_MAX, type SfxOptions, type SfxSidecar } from '@midnite/studio-shared';

/**
 * The SFX prompt form, as plain state: every knob the model takes, with the seed held as text so the field can
 * be empty (empty = a fresh random seed per generation, which the sidecar and file name then record).
 */
export type SfxFormState = {
  prompt: string;
  name: string;
  seconds: number;
  steps: number;
  cfgScale: number;
  variations: number;
  seed: string;
  negativePrompt: string;
};

export const initialSfxForm = (): SfxFormState => ({
  prompt: '',
  name: '',
  seconds: SFX_OPTION_DEFAULTS.seconds,
  steps: SFX_OPTION_DEFAULTS.steps,
  cfgScale: SFX_OPTION_DEFAULTS.cfgScale,
  variations: SFX_OPTION_DEFAULTS.variations,
  seed: '',
  negativePrompt: '',
});

/** A take's sidecar back into the form — "make another like this one", seed included. */
export function sfxFormFromSidecar(sidecar: SfxSidecar): SfxFormState {
  return {
    prompt: sidecar.prompt,
    name: '',
    seconds: sidecar.seconds,
    steps: sidecar.steps,
    cfgScale: sidecar.cfgScale,
    variations: 1,
    seed: String(sidecar.seed),
    negativePrompt: sidecar.negativePrompt ?? '',
  };
}

export type SfxFormRequest = { prompt: string; name?: string; options: SfxOptions };

/** The form as a generate request, or the first thing wrong with it. */
export function toSfxRequest(state: SfxFormState): SfxFormRequest | { error: string } {
  const prompt = state.prompt.trim();
  if (!prompt) return { error: 'Describe the sound.' };
  if (prompt.length > SFX_PROMPT_MAX) return { error: `Keep the prompt under ${SFX_PROMPT_MAX} characters.` };
  const seedText = state.seed.trim();
  const seed = seedText === '' ? undefined : Number(seedText);
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > SFX_SEED_MAX)) return { error: `The seed is a whole number from 0 to ${SFX_SEED_MAX}.` };
  const negativePrompt = state.cfgScale > 1 ? state.negativePrompt.trim() : '';
  const name = state.name.trim();
  return {
    prompt,
    ...(name ? { name } : {}),
    options: {
      seconds: state.seconds,
      steps: state.steps,
      cfgScale: state.cfgScale,
      variations: state.variations,
      ...(seed !== undefined ? { seed } : {}),
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };
}
