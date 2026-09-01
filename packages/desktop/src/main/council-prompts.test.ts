import { describe, expect, it } from 'vitest';

import { buildMemberPrompt, buildSynthesisPrompt } from './council-prompts';

describe('buildMemberPrompt', () => {
  it('includes both the role and the topic', () => {
    const prompt = buildMemberPrompt('Should we ship X?', 'Argue the best case.');
    expect(prompt).toContain('Argue the best case.');
    expect(prompt).toContain('Should we ship X?');
  });
});

describe('buildSynthesisPrompt', () => {
  it('attributes each succeeded member by name and role', () => {
    const prompt = buildSynthesisPrompt('Topic', [
      { name: 'Optimist', role: 'Best case', output: 'Ship it.', status: 'succeeded' },
    ]);
    expect(prompt).toContain('Optimist');
    expect(prompt).toContain('Best case');
    expect(prompt).toContain('Ship it.');
  });

  it('names a non-succeeded member by status rather than dropping them', () => {
    const prompt = buildSynthesisPrompt('Topic', [
      { name: 'Skeptic', role: 'Contrary view', output: '', status: 'timeout' },
    ]);
    expect(prompt).toContain('Skeptic');
    expect(prompt).toContain('timeout');
  });

  it('includes the topic', () => {
    const prompt = buildSynthesisPrompt('A specific topic', []);
    expect(prompt).toContain('A specific topic');
  });
});
