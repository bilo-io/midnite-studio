import { describe, expect, it } from 'vitest';

import { buildPullModelOptions, findPullOption, isModelInstalled } from './model-pull-options';

describe('model-pull-options', () => {
  it('expands every variant into its own pull tag', () => {
    const options = buildPullModelOptions(
      [{ name: 'llama3.1', variants: ['8b', '70b'], capabilities: ['tools'] }],
      new Set(),
    );
    expect(options.map((o) => o.model)).toEqual(['llama3.1:8b', 'llama3.1:70b']);
    expect(options[0]?.variant).toBe('8b');
  });

  it('marks installed tags and treats bare name as :latest', () => {
    const installed = new Set(['llama3.1:8b']);
    expect(isModelInstalled('llama3.1:8b', installed)).toBe(true);
    expect(isModelInstalled('llama3.1', new Set(['llama3.1:latest']))).toBe(true);
    const options = buildPullModelOptions([{ name: 'llama3.1', variants: ['8b'] }], installed);
    expect(options[0]?.installed).toBe(true);
  });

  it('findPullOption matches the exact tag only', () => {
    const options = buildPullModelOptions([{ name: 'qwen3', variants: ['7b', '14b'] }], new Set());
    expect(findPullOption(options, 'qwen3:14b')?.model).toBe('qwen3:14b');
    expect(findPullOption(options, 'qwen3')).toBeUndefined();
  });

  it('adds :cloud for cloud catalogue rows', () => {
    const options = buildPullModelOptions([{ name: 'gpt-oss', variants: ['120b'], cloud: true }], new Set());
    expect(options[0]?.model).toBe('gpt-oss:120b:cloud');
  });
});
