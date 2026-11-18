import { describe, expect, it } from 'vitest';

import { providerName, succinctDescription } from './loop-session-label';

describe('succinctDescription', () => {
  it.each([
    ['Midnite address issue triage', 'address issue triage'],
    ['Midnite phase doc planning', 'phase doc planning'],
    ['Midnite build iteration across FEATURES, SECURITY, ISSUES', 'build iteration'],
    ['Midnite build: issues, security, performance', 'build'],
    ['midnite-studio refactor the terminal store and its tests now', 'refactor the terminal store'],
    ['Review PRs — routine first', 'Review PRs'],
  ])('%s → %s', (raw, gist) => {
    expect(succinctDescription(raw, 'midnite-studio')).toBe(gist);
  });

  it('is absent when the agent has set no title', () => {
    expect(succinctDescription(undefined, 'repo')).toBeUndefined();
    expect(succinctDescription('   ', 'repo')).toBeUndefined();
  });

  it('keeps a lone leading word rather than emptying the gist', () => {
    expect(succinctDescription('Midnite', 'repo')).toBe('Midnite');
  });
});

describe('providerName', () => {
  it('names the provider, not its CLI product', () => {
    expect(providerName('Claude Code')).toBe('Claude');
    expect(providerName('Codex')).toBe('Codex');
    expect(providerName(undefined)).toBe('Agent');
  });
});
