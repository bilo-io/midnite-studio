import { describe, expect, it } from 'vitest';

import { launchOverrideFor, ollamaModelFromOption, ollamaOptionId } from './launch-options';

describe('per-launch Ollama picker values (Phase 96 Theme I)', () => {
  it('round-trips a model name through its option id', () => {
    expect(ollamaModelFromOption(ollamaOptionId('qwen3:14b'))).toBe('qwen3:14b');
  });

  it('treats a LoopModel token as no Ollama pick', () => {
    expect(ollamaModelFromOption('opus-5')).toBeNull();
    expect(ollamaModelFromOption('ollama:')).toBeNull();
    expect(launchOverrideFor('default')).toBeUndefined();
  });

  it('an Ollama pick becomes startAgent’s override', () => {
    expect(launchOverrideFor(ollamaOptionId('qwen3:14b'))).toEqual({ backend: 'ollama', model: 'qwen3:14b' });
  });
});
