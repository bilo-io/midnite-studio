import { describe, expect, it } from 'vitest';

import { conventionalPrefix } from './graph-row';

describe('conventionalPrefix', () => {
  it('captures type(scope): up to and including the colon', () => {
    expect(conventionalPrefix('feat(graph): dim unselected subjects')).toBe('feat(graph):');
  });

  it('captures a bare type: with no scope', () => {
    expect(conventionalPrefix('fix: handle empty subject')).toBe('fix:');
  });

  it('splits on the first colon only', () => {
    expect(conventionalPrefix('docs: see https://example.com: details')).toBe('docs:');
  });

  it('returns null when there is no colon', () => {
    expect(conventionalPrefix('Bump version to 1.2.3')).toBeNull();
  });

  it('returns null when the colon is the first character', () => {
    expect(conventionalPrefix(':thinking: emoji subject')).toBeNull();
  });
});
