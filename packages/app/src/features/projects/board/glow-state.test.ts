import { describe, expect, it } from 'vitest';

import { deriveCardGlowState } from './glow-state';

describe('deriveCardGlowState', () => {
  it('running and no question: pulsing running state', () => {
    expect(deriveCardGlowState({ running: true, waiting: false, isOpen: false })).toBe('running');
  });

  it('running with a question on screen: waiting wins over running', () => {
    expect(deriveCardGlowState({ running: true, waiting: true, isOpen: false })).toBe('waiting');
  });

  it('waiting flag ignored once the session is not running', () => {
    // A stale `waiting` reading with no live session should never happen, but
    // running=false is the authority either way.
    expect(deriveCardGlowState({ running: false, waiting: true, isOpen: false })).toBe('idle');
  });

  it('not running, but this card is open: static ring', () => {
    expect(deriveCardGlowState({ running: false, waiting: false, isOpen: true })).toBe('open');
  });

  it('running beats open — a running card pulses even while its own detail pane is open', () => {
    expect(deriveCardGlowState({ running: true, waiting: false, isOpen: true })).toBe('running');
  });

  it('neither running nor open: no glow', () => {
    expect(deriveCardGlowState({ running: false, waiting: false, isOpen: false })).toBe('idle');
  });
});
