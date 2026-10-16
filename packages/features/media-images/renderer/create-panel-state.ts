import {
  IMAGE_ASPECTS,
  IMAGE_MAX_COUNT,
  imageModelsFor,
  type ImageAspect,
  type ImageModelInfo,
  type ImageProviderId,
  type ImageSidecar,
} from '@midnite/studio-shared';

/**
 * The Images create panel's form state (Phase 99 Theme C) — a pure reducer,
 * so "switching provider resets an unknown model" and "Re-run prompt loads a
 * sidecar" are tested without rendering a thing.
 */
export type CreateState = {
  prompt: string;
  provider: ImageProviderId;
  model: string;
  aspect: ImageAspect;
  count: number;
};

export type CreateAction =
  | { type: 'prompt'; prompt: string }
  /** `discovered` = Ollama's reported models, for the dependent model list. */
  | { type: 'provider'; provider: ImageProviderId; discovered?: readonly ImageModelInfo[] }
  | { type: 'model'; model: string }
  | { type: 'aspect'; aspect: ImageAspect }
  | { type: 'count'; count: number }
  | { type: 'rerun'; sidecar: ImageSidecar };

export function initialCreateState(provider: ImageProviderId, model: string): CreateState {
  const models = imageModelsFor(provider);
  const known = models.length === 0 || models.some((m) => m.id === model);
  return { prompt: '', provider, model: known ? model : (models[0]?.id ?? ''), aspect: '1:1', count: 1 };
}

const clampCount = (count: number) => Math.min(IMAGE_MAX_COUNT, Math.max(1, Math.round(count) || 1));

export function createPanelReducer(state: CreateState, action: CreateAction): CreateState {
  switch (action.type) {
    case 'prompt':
      return { ...state, prompt: action.prompt };
    case 'provider': {
      if (action.provider === state.provider) return state;
      const models = imageModelsFor(action.provider, action.discovered);
      const keep = models.some((m) => m.id === state.model);
      return { ...state, provider: action.provider, model: keep ? state.model : (models[0]?.id ?? '') };
    }
    case 'model':
      return { ...state, model: action.model };
    case 'aspect':
      return (IMAGE_ASPECTS as readonly string[]).includes(action.aspect) ? { ...state, aspect: action.aspect } : state;
    case 'count':
      return { ...state, count: clampCount(action.count) };
    case 'rerun':
      return {
        ...state,
        prompt: action.sidecar.prompt,
        provider: action.sidecar.provider,
        model: action.sidecar.model,
        aspect: action.sidecar.aspect,
      };
  }
}

/** Why Generate is disabled, or `undefined` when it can run. */
export function generateBlockedReason(
  state: CreateState,
  status: { available: boolean; reason?: string | undefined } | undefined,
  running: boolean,
): string | undefined {
  if (running) return 'Generating…';
  if (!state.prompt.trim()) return 'Write a prompt first.';
  if (!state.model) return 'Pick a model.';
  if (status && !status.available) return status.reason ?? 'This provider is unavailable.';
  return undefined;
}
