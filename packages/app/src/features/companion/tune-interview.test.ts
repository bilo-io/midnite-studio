/**
 * Vitest/jsdom: the "tune me" interview's state machine (Phase 109 Theme H).
 * No browser capability needed — `stepTuneSession` is pure, and time is a
 * number passed in.
 */
import { COMPANION_TUNE_QUESTIONS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TUNE_SESSION_IDLE_MS,
  beginTuneInterview,
  beginTuneReview,
  beginTuneTweak,
  currentTuneSession,
  setTuneSession,
  stepTuneSession,
  type TuneDraft,
  type TuneSession,
  type TuneStep,
} from './tune-interview';

const PERSONALITY = COMPANION_TUNE_QUESTIONS.companionPersonality.map((q) => q.ask);
const ABOUT = COMPANION_TUNE_QUESTIONS.companionAboutUser.map((q) => q.ask);

const draft: TuneDraft = { text: 'Keep it dry. No jargon.', summary: 'Dry, no jargon.', source: 'agent' };

/** Assert a step is `ask` and hand back its session, for chaining. */
function asked(step: TuneStep, say?: string): TuneSession {
  expect(step.kind).toBe('ask');
  if (step.kind !== 'ask') throw new Error('not ask');
  if (say !== undefined) expect(step.say).toBe(say);
  return step.session;
}

/** Answer every remaining question with `replies`, in order, from `session`. */
function run(session: TuneSession, replies: readonly string[]): TuneStep {
  let current = session;
  let step: TuneStep | null = null;
  for (const reply of replies) {
    step = stepTuneSession(current, reply, 0);
    if (step.kind === 'ask') current = step.session;
  }
  if (step === null) throw new Error('no replies');
  return step;
}

afterEach(() => setTuneSession(null));

describe('beginTuneInterview', () => {
  it('opens the personality interview with what is coming, the steering words and the first question', () => {
    const { session, say } = beginTuneInterview('companionPersonality', 5);
    expect(session).toEqual({
      stage: 'asking',
      origin: 'interview',
      target: 'companionPersonality',
      index: 0,
      answers: {},
      at: 5,
    });
    expect(say).toBe(
      `Let's tune my personality — 4 quick questions. Say skip, start over or cancel at any point. ${PERSONALITY[0]}`,
    );
  });

  it('opens About me with its own count and first question', () => {
    const { say } = beginTuneInterview('companionAboutUser');
    expect(say).toBe(`Tell me about you — 3 quick questions. Say skip, start over or cancel at any point. ${ABOUT[0]}`);
  });
});

describe('stepTuneSession — asking', () => {
  const start = () => beginTuneInterview('companionPersonality', 0).session;

  it('records an answer as said and asks the next question', () => {
    const session = asked(stepTuneSession(start(), '  Warm and a bit dry. ', 10), PERSONALITY[1]);
    expect(session).toMatchObject({ stage: 'asking', index: 1, answers: { tone: 'Warm and a bit dry.' }, at: 10 });
  });

  it('walks every question and then asks to compose from all the answers', () => {
    const step = run(start(), ['dry', 'just the essentials', 'a little', 'jargon']);
    expect(step).toEqual({
      kind: 'compose',
      session: { stage: 'composing', origin: 'interview', target: 'companionPersonality', at: 0 },
      answers: { tone: 'dry', length: 'just the essentials', humour: 'a little', avoid: 'jargon' },
    });
  });

  it('skips a question on "skip", "no" or "I don\'t know", leaving it out of the answers', () => {
    const step = run(start(), ['skip', 'no', 'plenty', "I don't know"]);
    expect(step).toMatchObject({ kind: 'compose', answers: { humour: 'plenty' } });
  });

  it('holds the question on a bare "yes" — the answer is still to come', () => {
    const atAvoid = run(start(), ['dry', 'short', 'none']);
    const session = asked(atAvoid);
    expect(session).toMatchObject({ index: 3 });
    const held = asked(stepTuneSession(session, 'Yes.', 0), 'Go on.');
    expect(held).toMatchObject({ index: 3 });
    expect(stepTuneSession(held, 'emojis', 0)).toMatchObject({ kind: 'compose', answers: { avoid: 'emojis' } });
  });

  it('ends without writing anything when every question was skipped', () => {
    expect(run(start(), ['skip', 'skip', 'pass', 'nothing'])).toEqual({
      kind: 'end',
      say: "You skipped every question, so I've left my personality as it was.",
    });
  });

  it('counts an answer of nothing but filler as skipped', () => {
    expect(run(start(), ['um', 'skip', 'skip', 'skip'])).toMatchObject({ kind: 'end' });
  });

  it('starts over from the first question with the answers cleared', () => {
    const midway = asked(run(start(), ['dry', 'short']));
    const restarted = asked(stepTuneSession(midway, "Let's start over.", 3), `Starting over. ${PERSONALITY[0]}`);
    expect(restarted).toEqual({
      stage: 'asking',
      origin: 'interview',
      target: 'companionPersonality',
      index: 0,
      answers: {},
      at: 3,
    });
  });

  it('cancels at any question, saying nothing was changed', () => {
    const midway = asked(run(start(), ['dry']));
    expect(stepTuneSession(midway, 'cancel', 0)).toEqual({
      kind: 'end',
      say: "Okay, I've left my personality as it was.",
    });
    expect(stepTuneSession(beginTuneInterview('companionAboutUser').session, 'never mind', 0)).toEqual({
      kind: 'end',
      say: "Okay, I've left what I know about you as it was.",
    });
  });

  it('takes "stop" mid-interview as cancel', () => {
    expect(stepTuneSession(start(), 'stop', 0)).toMatchObject({ kind: 'end' });
  });

  it('takes an answer that merely contains a steering word as an answer', () => {
    const session = asked(stepTuneSession(start(), 'skip the small talk', 0));
    expect(session).toMatchObject({ answers: { tone: 'skip the small talk' } });
  });

  it('runs the About me interview to its three answers', () => {
    const step = run(beginTuneInterview('companionAboutUser', 0).session, ['Bilo', 'the desktop app', 'short']);
    expect(step).toMatchObject({
      kind: 'compose',
      session: { target: 'companionAboutUser', origin: 'interview' },
      answers: { name: 'Bilo', work: 'the desktop app', updates: 'short' },
    });
  });

  it('never mutates the session it was given', () => {
    const session = start();
    const frozen = JSON.stringify(session);
    stepTuneSession(session, 'dry', 1);
    stepTuneSession(session, 'start over', 1);
    expect(JSON.stringify(session)).toBe(frozen);
  });
});

describe('stepTuneSession — composing', () => {
  it('asks for patience on anything but cancel or start over', () => {
    const session = beginTuneTweak('companionPersonality', 0);
    expect(stepTuneSession(session, 'hello?', 0)).toEqual({
      kind: 'wait',
      session,
      say: 'Still writing it — one moment. Say cancel to drop it.',
    });
  });

  it('cancels', () => {
    expect(stepTuneSession(beginTuneTweak('companionPersonality'), 'cancel', 0)).toMatchObject({ kind: 'end' });
  });

  it('starts an interview over, but ends a tweak — there is nothing to start over from', () => {
    const interview: TuneSession = { stage: 'composing', origin: 'interview', target: 'companionAboutUser', at: 0 };
    asked(stepTuneSession(interview, 'start over', 0), `Starting over. ${ABOUT[0]}`);
    expect(stepTuneSession(beginTuneTweak('companionPersonality'), 'start over', 0)).toEqual({
      kind: 'end',
      say: "Okay, I've left my personality as it was.",
    });
  });
});

describe('beginTuneReview and the "hear all of it" step', () => {
  it('reads back the summary and asks whether to hear the rest (Decision 11)', () => {
    const { session, say } = beginTuneReview('interview', 'companionPersonality', draft, 7);
    expect(session).toEqual({ stage: 'hearAll', origin: 'interview', target: 'companionPersonality', draft, at: 7 });
    expect(say).toBe("Here's the gist: Dry, no jargon. Want to hear all of it?");
  });

  it('says once that the template wrote it when there was no CLI', () => {
    const { say } = beginTuneReview('interview', 'companionPersonality', { ...draft, source: 'template' });
    expect(say).toBe(
      "I've filled in the basic template from your answers. Here's the gist: Dry, no jargon. Want to hear all of it?",
    );
  });

  const review = () => beginTuneReview('tweak', 'companionPersonality', draft, 0).session;

  it('reads it all on yes, then confirms', () => {
    expect(stepTuneSession(review(), 'yes please', 0)).toEqual({
      kind: 'confirm',
      target: 'companionPersonality',
      draft,
      readAll: true,
    });
  });

  it('goes straight to the confirm on no or skip', () => {
    for (const reply of ['no', 'just the summary', 'skip']) {
      expect(stepTuneSession(review(), reply, 0)).toMatchObject({ kind: 'confirm', readAll: false });
    }
  });

  it('asks again on anything else', () => {
    asked(stepTuneSession(review(), 'hmm, maybe', 0), 'Want to hear all of it? Yes or no.');
  });

  it('cancels, and an interview can still start over from here', () => {
    expect(stepTuneSession(review(), 'cancel', 0)).toMatchObject({ kind: 'end' });
    const fromInterview = beginTuneReview('interview', 'companionPersonality', draft, 0).session;
    asked(stepTuneSession(fromInterview, 'start again', 0), `Starting over. ${PERSONALITY[0]}`);
  });
});

describe('the session slot', () => {
  it('holds one session until replaced or ended', () => {
    expect(currentTuneSession()).toBeNull();
    const { session } = beginTuneInterview('companionPersonality', 1000);
    setTuneSession(session);
    expect(currentTuneSession(1000)).toBe(session);
    setTuneSession(null);
    expect(currentTuneSession(1000)).toBeNull();
  });

  it('drops a session left idle past the timeout', () => {
    const { session } = beginTuneInterview('companionPersonality', 1000);
    setTuneSession(session);
    expect(currentTuneSession(1000 + TUNE_SESSION_IDLE_MS)).toBe(session);
    expect(currentTuneSession(1001 + TUNE_SESSION_IDLE_MS)).toBeNull();
    // Dropped, not merely hidden.
    expect(currentTuneSession(1000)).toBeNull();
  });
});
