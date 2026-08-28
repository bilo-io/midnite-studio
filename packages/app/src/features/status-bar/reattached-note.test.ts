import { describe, expect, it } from 'vitest';

import { noteText } from './reattached-note';

describe('noteText', () => {
  it('returns null for 0', () => {
    expect(noteText(0)).toBeNull();
  });

  it('returns null for negative counts', () => {
    expect(noteText(-1)).toBeNull();
  });

  it('formats single session correctly', () => {
    expect(noteText(1)).toBe('Reattached 1 session');
  });

  it('formats multiple sessions with plural suffix', () => {
    expect(noteText(3)).toBe('Reattached 3 sessions');
    expect(noteText(10)).toBe('Reattached 10 sessions');
  });
});
