import { describe, expect, it } from 'vitest';

import { createPanelReducer, generateBlockedReason, initialCreateState } from './create-panel-state';
import { positionLabel, stepIndex } from './lightbox-nav';

describe('create panel reducer (Phase 99 Theme C)', () => {
  it('starts from the defaults, repairing a model the provider does not offer', () => {
    expect(initialCreateState('gemini', 'gemini-2.5-flash-image')).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      aspect: '1:1',
      count: 1,
    });
    expect(initialCreateState('openai', 'gone-model').model).toBe('gpt-image-1');
  });

  it('switching provider resets the model to that provider’s first', () => {
    const state = initialCreateState('gemini', 'gemini-2.5-flash-image');
    const next = createPanelReducer(state, { type: 'provider', provider: 'openai' });
    expect(next).toMatchObject({ provider: 'openai', model: 'gpt-image-1' });
    expect(createPanelReducer(next, { type: 'provider', provider: 'openai' })).toBe(next);
    const ollama = createPanelReducer(state, {
      type: 'provider',
      provider: 'ollama',
      discovered: [{ id: 'x/z-image-turbo', label: 'z' }],
    });
    expect(ollama.model).toBe('x/z-image-turbo');
  });

  it('clamps count and loads a sidecar for Re-run', () => {
    let state = initialCreateState('gemini', 'gemini-2.5-flash-image');
    state = createPanelReducer(state, { type: 'count', count: 9 });
    expect(state.count).toBe(4);
    state = createPanelReducer(state, { type: 'count', count: 0 });
    expect(state.count).toBe(1);
    state = createPanelReducer(state, {
      type: 'rerun',
      sidecar: {
        version: 1,
        file: 'a.png',
        prompt: 'again',
        provider: 'openai',
        model: 'gpt-image-1-mini',
        aspect: '16:9',
        createdAt: 'now',
      },
    });
    expect(state).toMatchObject({ prompt: 'again', provider: 'openai', model: 'gpt-image-1-mini', aspect: '16:9' });
  });

  it('explains why Generate is blocked', () => {
    const state = initialCreateState('gemini', 'gemini-2.5-flash-image');
    expect(generateBlockedReason(state, undefined, false)).toBe('Write a prompt first.');
    const ready = createPanelReducer(state, { type: 'prompt', prompt: 'fox' });
    expect(generateBlockedReason(ready, { available: true }, false)).toBeUndefined();
    expect(generateBlockedReason(ready, { available: false, reason: 'no key' }, false)).toBe('no key');
    expect(generateBlockedReason(ready, { available: true }, true)).toBe('Generating…');
  });
});

describe('lightbox stepping', () => {
  it('wraps both ways and labels one-based', () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBeNull();
    expect(positionLabel(2, 40)).toBe('3/40');
  });
});
