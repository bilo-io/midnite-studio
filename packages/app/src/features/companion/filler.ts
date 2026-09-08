import {
  COMPANION_FILLER_THRESHOLD_MS,
  COMPANION_MUSIC_OFFER_MS,
  COMPANION_PHRASES,
  interpolatePhrase,
  nextFillerDelayMs,
  pickPhrase,
  type CompanionPhraseKind,
  type CompanionState,
} from '@midnite/studio-shared';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { stopCompanionAudio, suspendCompanionAudio } from './audio/context';
import { startElevator, stopElevator } from './audio/elevator';
import { stopWhistle, whistle } from './audio/whistle';
import { companionTtsSpeaker } from './speaker';

/**
 * What happens between "on it" and "here we are" (Phase 79 Theme G).
 *
 * A wait that says nothing reads as a wait that has failed. A wait that says
 * something every five seconds reads as a wait that is nagging. So: **nothing
 * for the first six seconds**, then one thing, then nothing for another
 * twenty-five to forty — randomised, because a metronomic voice is what makes
 * a companion feel like a progress bar.
 *
 * Three rules matter more than the timings, and all three are about not
 * talking over something that matters:
 *
 * - **Never while the agent is `waiting`.** A `waiting` pty is one asking the
 *   user a question. A fun fact on top of that is the worst thing this feature
 *   could do, and it is the one case the scheduler checks before every turn
 *   rather than only when it starts.
 * - **Never over a read-back.** The speaker is asked whether it is busy; a
 *   filler that interleaved with the answer would make both unintelligible.
 * - **Stops instantly on any user action.** Mic press, keypress, panel close,
 *   a state change out of loading — `stopFillers()` is one call and it takes
 *   the whistle and the elevator loop with it.
 *
 * The turn rotation is `filler → quote → whistle`, which keeps the phase doc's
 * alternation between the two spoken banks intact while giving the whistle
 * somewhere to happen. The doc specifies the alternation and the melodies but
 * not where a melody is triggered; this is that decision, in the one place it
 * can be read.
 */

/** What the scheduler needs to know about the world, read fresh on every tick. */
export type FillerHostState = {
  state: CompanionState;
  /**
   * The activity of the pty a hand-off is waiting on, or `null` when there is
   * no hand-off. `'waiting'` suppresses every turn — see above.
   */
  ptyActivity: 'thinking' | 'waiting' | 'idle' | null;
};

/**
 * How long a blocked turn waits before looking again.
 *
 * Two seconds rather than the full spacing: an agent is `waiting` for as long
 * as it takes a human to answer a prompt, and re-rolling the whole 25–40 s gap
 * because of a one-second overlap would make the companion silent for a
 * minute over nothing. Two seconds is also long enough that a `waiting` agent
 * costs one timer every two seconds rather than a poll.
 */
export const FILLER_RETRY_MS = 2_000;

/** The two states that count as "loading" — the companion's own work, and an agent's. */
export function isLoadingState(state: CompanionState): boolean {
  return state === 'thinking' || state === 'handoff';
}

export type FillerDeps = {
  getState: () => FillerHostState;
  /** Fire-and-forget: the scheduler never waits on a line it started. */
  speak: (text: string) => void;
  isSpeaking: () => boolean;
  playWhistle: () => void;
  /** `companionMusicOffer`, read at offer time so flipping it mid-wait works. */
  musicOfferEnabled: () => boolean;
  /** Resolves `{name}` in the offer phrase. */
  honorific: () => string;
  /** Pick from a bank, honouring the store's no-repeat window and recording the pick. */
  pick: (kind: CompanionPhraseKind) => string;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (handle: number) => void;
  rng: () => number;
};

export const defaultFillerDeps = (): Omit<FillerDeps, 'getState'> => ({
  speak: (text) => {
    void companionTtsSpeaker.speak(text);
  },
  isSpeaking: () => companionTtsSpeaker.isSpeaking(),
  playWhistle: () => {
    whistle();
  },
  musicOfferEnabled: () => useUiStore.getState().companionMusicOffer,
  honorific: () => useUiStore.getState().companionHonorific,
  pick: (kind) => {
    const store = useCompanionStore.getState();
    const phrase = pickPhrase(COMPANION_PHRASES[kind], store.recentPhrases[kind] ?? []);
    if (phrase.length > 0) store.notePhrase(kind, phrase);
    return phrase;
  },
  setTimer: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  clearTimer: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  rng: Math.random,
});

export type FillerScheduler = {
  /** Begin (or restart) the schedule for one loading episode. */
  start: () => void;
  /** Stop everything: the timers, the whistle and the elevator loop. */
  stop: () => void;
  isRunning: () => boolean;
  /** Which turn the rotation is on. Exposed for the tests, not for callers. */
  turns: () => number;
};

export function createFillerScheduler(deps: FillerDeps): FillerScheduler {
  let fillerTimer: number | null = null;
  let offerTimer: number | null = null;
  let running = false;
  let turn = 0;
  /** Once per loading episode, per the phase doc — not once per launch. */
  let musicOffered = false;
  /**
   * Which spoken bank is next.
   *
   * Kept across whistle turns so the alternation the doc specifies is between
   * the *spoken* turns, not between every turn — a whistle in the middle does
   * not make two fillers in a row.
   */
  let nextSpokenBank: 'fillers' | 'quotes' = 'fillers';

  const clearTimers = (): void => {
    if (fillerTimer !== null) deps.clearTimer(fillerTimer);
    if (offerTimer !== null) deps.clearTimer(offerTimer);
    fillerTimer = null;
    offerTimer = null;
  };

  /** Can a turn happen right now? Re-read every time — none of this is cached. */
  const canSpeakNow = (): boolean => {
    const host = deps.getState();
    if (!running || !isLoadingState(host.state)) return false;
    if (host.ptyActivity === 'waiting') return false;
    return !deps.isSpeaking();
  };

  const scheduleFiller = (ms: number): void => {
    if (fillerTimer !== null) deps.clearTimer(fillerTimer);
    fillerTimer = deps.setTimer(() => {
      fillerTimer = null;
      if (!running) return;

      const host = deps.getState();
      /*
        Left loading while the timer was pending — a hand-off that finished, a
        cancel. Stop rather than reschedule: the caller sends `stop()` too, but
        a timer that outlives its reason is how a filler ends up landing over a
        read-back.
      */
      if (!isLoadingState(host.state)) {
        running = false;
        clearTimers();
        return;
      }

      if (!canSpeakNow()) {
        scheduleFiller(FILLER_RETRY_MS);
        return;
      }

      takeTurn();
      scheduleFiller(nextFillerDelayMs(deps.rng));
    }, ms);
  };

  const takeTurn = (): void => {
    // Every third turn is a whistle; the other two speak, alternating banks.
    if (turn % 3 === 2) {
      deps.playWhistle();
    } else {
      const bank = nextSpokenBank;
      nextSpokenBank = bank === 'fillers' ? 'quotes' : 'fillers';
      const phrase = deps.pick(bank);
      if (phrase.length > 0) deps.speak(interpolatePhrase(phrase, deps.honorific()));
    }
    turn += 1;
  };

  const scheduleOffer = (ms: number): void => {
    if (offerTimer !== null) deps.clearTimer(offerTimer);
    offerTimer = deps.setTimer(() => {
      offerTimer = null;
      if (!running || musicOffered) return;
      if (!isLoadingState(deps.getState().state)) return;
      /*
        The switch is read here rather than at `start()`: a user who turns the
        offer off during a long wait should not then be asked.
      */
      if (!deps.musicOfferEnabled()) return;
      if (!canSpeakNow()) {
        scheduleOffer(FILLER_RETRY_MS);
        return;
      }
      musicOffered = true;
      const phrase = deps.pick('musicOffers');
      if (phrase.length > 0) deps.speak(interpolatePhrase(phrase, deps.honorific()));
    }, ms);
  };

  return {
    start: () => {
      // Restart, not resume: a new hand-off gets its own six-second grace and
      // its own single music offer.
      clearTimers();
      running = true;
      turn = 0;
      musicOffered = false;
      nextSpokenBank = 'fillers';
      scheduleFiller(COMPANION_FILLER_THRESHOLD_MS);
      scheduleOffer(COMPANION_MUSIC_OFFER_MS);
    },

    stop: () => {
      running = false;
      clearTimers();
      stopWhistle();
      stopElevator();
    },

    isRunning: () => running,
    turns: () => turn,
  };
}

let scheduler: FillerScheduler | null = null;

/**
 * Start the loading personality for the current wait.
 *
 * `getState` is a thunk rather than a snapshot because every rule above is
 * re-evaluated on each tick — a hand-off that becomes `waiting` between the
 * threshold and the turn has to suppress that turn, and a snapshot taken at
 * `start()` could not know.
 */
export function startFillers(getState: () => FillerHostState): void {
  scheduler?.stop();
  scheduler = createFillerScheduler({ ...defaultFillerDeps(), getState });
  scheduler.start();
}

/** Stop the timers, the whistle and the loop. Safe to call when nothing is running. */
export function stopFillers(): void {
  scheduler?.stop();
}

/**
 * The hard stop, for the six triggers the phase names — read-back start, mic
 * press, textarea keypress, panel close, and a hidden window.
 *
 * Beyond `stopFillers()` it cuts the master gain (so a whistle mid-envelope
 * goes quiet rather than finishing its scheduled notes) and parks the audio
 * thread, since the user action that got us here is also evidence nothing more
 * is wanted.
 */
export function stopCompanionPersonality(): void {
  stopFillers();
  stopCompanionAudio();
  suspendCompanionAudio();
}

/** The music offer accepted (grammar `kind: 'music'`). Exported for Theme E's concierge. */
export function acceptMusicOffer(): void {
  void startElevator();
}

/** The music offer declined, or the wait over. */
export function declineMusicOffer(): void {
  stopElevator();
}

/** Reset module state. Tests only. */
export function __resetFillersForTest(): void {
  scheduler?.stop();
  scheduler = null;
}
