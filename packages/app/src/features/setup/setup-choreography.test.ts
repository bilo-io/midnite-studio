import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHOREO,
  centredRect,
  dissolveTimeline,
  flipKeyframes,
  handoffTimeline,
  introTimeline,
  isReducedMotion,
  playTimeline,
  type IntroFrame,
} from './setup-choreography';

/**
 * Phase 98 Themes B and C — the choreography sequencer: the intro's phases,
 * the handoff's, the FLIP maths, and the reduced-motion short-circuit, on
 * fake timers. Ordering inside the overlay (a typed title before its body)
 * is `setup-overlay.test.tsx`.
 */
afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset['motion'];
});

describe('introTimeline', () => {
  it('starts empty and typing, adds one letter per frame, and ends ready', () => {
    const frames = introTimeline('Midnite', false);
    expect(frames[0]).toEqual({ at: 0, frame: { typed: '', phase: 'typing' } });
    expect(frames.slice(1, 8).map((f) => f.frame.typed)).toEqual(['M', 'Mi', 'Mid', 'Midn', 'Midni', 'Midnit', 'Midnite']);
    expect(frames[1]!.at).toBe(CHOREO.introLeadMs);
    expect(frames[2]!.at - frames[1]!.at).toBe(CHOREO.introCharMs);
    const last = frames[frames.length - 1]!;
    expect(last.frame).toEqual({ typed: 'Midnite', phase: 'ready' });
    expect(last.at - frames[7]!.at).toBe(CHOREO.introSettleMs);
    // Strictly increasing: nothing lands out of order.
    for (let i = 1; i < frames.length; i += 1) expect(frames[i]!.at).toBeGreaterThan(frames[i - 1]!.at);
  });

  it('reduced motion is one frame, at 0, already whole and ready', () => {
    expect(introTimeline('Midnite', true)).toEqual([{ at: 0, frame: { typed: 'Midnite', phase: 'ready' } }]);
  });
});

describe('playTimeline', () => {
  beforeEach(() => vi.useFakeTimers());

  it('applies frames at 0 synchronously and the rest at their own time, in order', () => {
    const seen: IntroFrame[] = [];
    playTimeline(introTimeline('Mi', false), (frame) => seen.push(frame));
    expect(seen.map((f) => f.typed)).toEqual(['']);
    vi.advanceTimersByTime(CHOREO.introLeadMs);
    expect(seen.map((f) => f.typed)).toEqual(['', 'M']);
    vi.advanceTimersByTime(CHOREO.introCharMs);
    expect(seen.map((f) => f.typed)).toEqual(['', 'M', 'Mi']);
    expect(seen[seen.length - 1]!.phase).toBe('typing');
    vi.advanceTimersByTime(CHOREO.introSettleMs);
    expect(seen[seen.length - 1]!.phase).toBe('ready');
    // Nothing left running once the last frame has applied.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a reduced-motion timeline lands before it returns, with no timer at all', () => {
    const apply = vi.fn();
    playTimeline(introTimeline('Midnite', true), apply);
    expect(apply).toHaveBeenCalledExactlyOnceWith({ typed: 'Midnite', phase: 'ready' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel drops every frame still to come', () => {
    const apply = vi.fn();
    const cancel = playTimeline(introTimeline('Midnite', false), apply);
    cancel();
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('handoffTimeline', () => {
  it('fades, points for the beat, dissolves, then is done', () => {
    const frames = handoffTimeline(false);
    expect(frames.map((f) => f.frame)).toEqual(['fading', 'pointing', 'dissolving', 'done']);
    expect(frames.map((f) => f.at)).toEqual([
      0,
      CHOREO.handoffFadeMs,
      CHOREO.handoffFadeMs + CHOREO.handoffBeatMs,
      CHOREO.handoffFadeMs + CHOREO.handoffBeatMs + CHOREO.dissolveMs,
    ]);
  });

  it('reduced motion drops both fades but keeps the beat to read the hint', () => {
    expect(handoffTimeline(true)).toEqual([
      { at: 0, frame: 'pointing' },
      { at: CHOREO.handoffBeatMs, frame: 'done' },
    ]);
  });

  it('cutting it short dissolves then closes — or, reduced, closes at once', () => {
    expect(dissolveTimeline(false).map((f) => f.frame)).toEqual(['dissolving', 'done']);
    expect(dissolveTimeline(true)).toEqual([{ at: 0, frame: 'done' }]);
  });
});

describe('FLIP', () => {
  it('inverts from the anchor back over the origin, scaling from the top-left corner', () => {
    const [from, to] = flipKeyframes(
      { left: 200, top: 300, width: 64, height: 64 },
      { left: 40, top: 60, width: 32, height: 32 },
    );
    expect(from).toEqual({ transformOrigin: 'top left', transform: 'translate(160px, 240px) scale(2)' });
    expect(to).toEqual({ transformOrigin: 'top left', transform: 'none' });
  });

  it('centres a square in a container', () => {
    expect(centredRect({ left: 0, top: 0, width: 1000, height: 800 }, 64)).toEqual({
      left: 468,
      top: 368,
      width: 64,
      height: 64,
    });
  });
});

describe('isReducedMotion', () => {
  it("honours data-motion either way, and the OS setting only when motion is not forced 'full'", () => {
    document.documentElement.dataset['motion'] = 'reduced';
    expect(isReducedMotion()).toBe(true);
    document.documentElement.dataset['motion'] = 'full';
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(isReducedMotion()).toBe(false);
    delete document.documentElement.dataset['motion'];
    expect(isReducedMotion()).toBe(true);
    media.mockRestore();
  });
});
