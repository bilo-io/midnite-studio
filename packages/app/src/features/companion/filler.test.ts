import {
  COMPANION_FILLER_SPACING_MS,
  COMPANION_FILLER_THRESHOLD_MS,
  COMPANION_MUSIC_OFFER_MS,
  COMPANION_PHRASES,
  type CompanionPhraseKind,
  type CompanionState,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import {
  FILLER_RETRY_MS,
  createFillerScheduler,
  defaultFillerDeps,
  isLoadingState,
  type FillerDeps,
  type FillerHostState,
} from './filler';

/**
 * Phase 79 Theme G — the filler scheduler, under fake timers.
 *
 * Every timing the phase doc names is asserted here rather than eyeballed: the
 * 6 s threshold, the 25–40 s spacing, the suppression while an agent is
 * `waiting`, and the music offer landing at 20 s exactly once.
 */

function harness(over: Partial<FillerDeps> & { initial?: FillerHostState } = {}) {
  let host: FillerHostState = over.initial ?? { state: 'handoff', ptyActivity: 'thinking' };
  const spoken: string[] = [];
  const whistles: number[] = [];
  let speaking = false;
  let musicEnabled = true;

  const deps: FillerDeps = {
    getState: () => host,
    speak: (text) => spoken.push(text),
    isSpeaking: () => speaking,
    playWhistle: () => whistles.push(Date.now()),
    musicOfferEnabled: () => musicEnabled,
    honorific: () => '',
    /*
      A sentinel per bank rather than the real phrase. The assertions below are
      about *which bank a turn came from*, and the real phrases carry `{name}`
      — so comparing against them would be testing `interpolatePhrase`, which
      has its own tests in `shared`. `defaultFillerDeps` is covered separately
      at the bottom of this file.
    */
    pick: (kind) => SENTINEL[kind],
    setTimer: (callback, ms) => setTimeout(callback, ms) as unknown as number,
    clearTimer: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    // Mid-window, so the spacing assertion has one exact number to hit.
    rng: () => 0.5,
    ...over,
  };

  return {
    deps,
    spoken,
    /** Spoken lines that were filler turns — the music offer is counted apart. */
    turns: () => spoken.filter((line) => line !== SENTINEL.musicOffers),
    offers: () => spoken.filter((line) => line === SENTINEL.musicOffers),
    whistles,
    setHost: (next: Partial<FillerHostState>) => {
      host = { ...host, ...next };
    },
    setSpeaking: (value: boolean) => {
      speaking = value;
    },
    setMusicEnabled: (value: boolean) => {
      musicEnabled = value;
    },
  };
}

/** One recognisable line per bank. */
const SENTINEL: Record<CompanionPhraseKind, string> = {
  greetings: 'GREETING',
  signoffs: 'SIGNOFF',
  fillers: 'FILLER',
  quotes: 'QUOTE',
  musicOffers: 'OFFER',
  prompts: 'PROMPT',
};

const MID_SPACING = Math.round(
  COMPANION_FILLER_SPACING_MS.min +
    0.5 * (COMPANION_FILLER_SPACING_MS.max - COMPANION_FILLER_SPACING_MS.min),
);

describe('isLoadingState', () => {
  it('is exactly thinking and handoff', () => {
    const loading: CompanionState[] = ['thinking', 'handoff'];
    const idle: CompanionState[] = ['off', 'idle', 'greeting', 'listening', 'speaking'];
    for (const state of loading) expect(isLoadingState(state)).toBe(true);
    for (const state of idle) expect(isLoadingState(state)).toBe(false);
  });
});

describe('createFillerScheduler', () => {
  it('says nothing at all before the six-second threshold', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      createFillerScheduler(h.deps).start();

      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS - 1);
      expect(h.turns()).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(h.turns()).toEqual(['FILLER']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits the randomised spacing before the next turn', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      createFillerScheduler(h.deps).start();

      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
      expect(h.turns()).toHaveLength(1);

      vi.advanceTimersByTime(MID_SPACING - 1);
      expect(h.turns()).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(h.turns()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never schedules outside the phase doc\'s window', () => {
    vi.useFakeTimers();
    try {
      for (const roll of [0, 1]) {
        const h = harness({ rng: () => roll });
        createFillerScheduler(h.deps).start();
        vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
        const expected = roll === 0 ? COMPANION_FILLER_SPACING_MS.min : COMPANION_FILLER_SPACING_MS.max;

        vi.advanceTimersByTime(expected - 1);
        expect(h.turns()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(h.turns()).toHaveLength(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  /*
    The rotation: two spoken turns alternating between the banks, then a
    whistle — which keeps the doc's fillers/quotes alternation intact while
    giving the melodies somewhere to happen.
  */
  it('alternates the two spoken banks and whistles every third turn', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      createFillerScheduler(h.deps).start();

      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
      vi.advanceTimersByTime(MID_SPACING);
      vi.advanceTimersByTime(MID_SPACING);
      vi.advanceTimersByTime(MID_SPACING);

      // Three spoken turns, alternating, with one whistle taking the third slot.
      expect(h.turns()).toEqual(['FILLER', 'QUOTE', 'FILLER']);
      expect(h.whistles).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /*
    The rule that matters most. A `waiting` pty is one asking the user a
    question; a fun fact on top of that is the worst thing this feature could
    do.
  */
  it('says nothing while the agent is waiting, and resumes once it is not', () => {
    vi.useFakeTimers();
    try {
      const h = harness({ initial: { state: 'handoff', ptyActivity: 'waiting' } });
      createFillerScheduler(h.deps).start();

      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
      expect(h.spoken).toEqual([]);

      // Still nothing, however long it waits — the offer is suppressed too.
      vi.advanceTimersByTime(FILLER_RETRY_MS * 10);
      expect(h.spoken).toEqual([]);

      h.setHost({ ptyActivity: 'thinking' });
      vi.advanceTimersByTime(FILLER_RETRY_MS);
      expect(h.turns()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never speaks over a read-back, and retries after it', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.setSpeaking(true);
      createFillerScheduler(h.deps).start();

      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
      expect(h.spoken).toEqual([]);

      h.setSpeaking(false);
      vi.advanceTimersByTime(FILLER_RETRY_MS);
      expect(h.turns()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops itself when the state leaves loading, rather than firing late', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const scheduler = createFillerScheduler(h.deps);
      scheduler.start();

      h.setHost({ state: 'idle', ptyActivity: null });
      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS + MID_SPACING * 3);

      expect(h.spoken).toEqual([]);
      expect(h.whistles).toEqual([]);
      expect(scheduler.isRunning()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops instantly on stop(), with nothing queued behind it', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const scheduler = createFillerScheduler(h.deps);
      scheduler.start();
      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
      expect(h.turns()).toHaveLength(1);

      scheduler.stop();
      vi.advanceTimersByTime(MID_SPACING * 5);
      expect(h.turns()).toHaveLength(1);
      expect(scheduler.isRunning()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a restart its own grace period and its own offer', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const scheduler = createFillerScheduler(h.deps);
      scheduler.start();
      vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS);
      expect(h.turns()).toHaveLength(1);
      expect(h.offers()).toHaveLength(1);

      scheduler.start();
      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS - 1);
      expect(h.turns()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(h.turns()).toHaveLength(2);
      // The second episode's offer, because it is once per wait, not per launch.
      vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS);
      expect(h.offers()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('the music offer', () => {
    it('lands at twenty seconds, exactly once', () => {
      vi.useFakeTimers();
      try {
        const h = harness();
        createFillerScheduler(h.deps).start();

        vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS - 1);
        expect(h.offers()).toHaveLength(0);

        vi.advanceTimersByTime(1);
        expect(h.offers()).toHaveLength(1);

        vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS * 5);
        expect(h.offers()).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('is not made at all with the switch off', () => {
      vi.useFakeTimers();
      try {
        const h = harness();
        h.setMusicEnabled(false);
        createFillerScheduler(h.deps).start();

        vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS * 3);
        expect(h.offers()).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    /*
      Read at offer time, not at `start()`: a user who turns the offer off
      during a long wait should not then be asked.
    */
    it('honours the switch being turned off mid-wait', () => {
      vi.useFakeTimers();
      try {
        const h = harness();
        createFillerScheduler(h.deps).start();
        vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS - 100);
        h.setMusicEnabled(false);
        vi.advanceTimersByTime(200);
        expect(h.offers()).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits rather than offering over a waiting agent', () => {
      vi.useFakeTimers();
      try {
        const h = harness({ initial: { state: 'handoff', ptyActivity: 'waiting' } });
        createFillerScheduler(h.deps).start();

        vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS + FILLER_RETRY_MS * 3);
        expect(h.spoken).toEqual([]);

        h.setHost({ ptyActivity: 'thinking' });
        vi.advanceTimersByTime(FILLER_RETRY_MS);
        expect(h.offers()).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('is dropped when the wait ends before twenty seconds', () => {
      vi.useFakeTimers();
      try {
        const h = harness();
        createFillerScheduler(h.deps).start();
        vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
        h.setHost({ state: 'speaking', ptyActivity: null });
        vi.advanceTimersByTime(COMPANION_MUSIC_OFFER_MS * 2);
        expect(h.offers()).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('resolves the honorific into what it speaks', () => {
    vi.useFakeTimers();
    try {
      const h = harness({ honorific: () => 'Ada', pick: () => 'Long one{name}. Music?' });
      createFillerScheduler(h.deps).start();
      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS);
      expect(h.spoken[0]).toBe('Long one Ada. Music?');
    } finally {
      vi.useRealTimers();
    }
  });

  it('speaks nothing for an empty bank rather than an empty utterance', () => {
    vi.useFakeTimers();
    try {
      const h = harness({ pick: () => '' });
      createFillerScheduler(h.deps).start();
      vi.advanceTimersByTime(COMPANION_FILLER_THRESHOLD_MS + MID_SPACING * 3);
      expect(h.spoken).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('defaultFillerDeps', () => {
  /*
    The one test that touches the real banks: the harness above deliberately
    substitutes sentinels, so without this nothing would notice `pick`
    reaching for a bank that does not exist.
  */
  it('picks a real phrase from every bank it is asked for', () => {
    const pick = defaultFillerDeps().pick;
    for (const kind of ['fillers', 'quotes', 'musicOffers'] as const) {
      expect(COMPANION_PHRASES[kind] as readonly string[]).toContain(pick(kind));
    }
  });
});
