import {
  COMPANION_TUNE_QUESTIONS,
  COMPANION_TUNE_TARGET_SPOKEN,
  buildPersonaFromAnswers,
  classifyTuneReply,
  type CompanionPersonaReply,
  type CompanionTuneAnswers,
  type CompanionTuneTarget,
} from '@midnite/studio-shared';

/**
 * The "tune me" interview — Phase 109 Theme H. "Tune yourself" and "be more
 * sarcastic", as a turn-by-turn state machine.
 *
 * Personality and About me never take raw dictation (Decision 4). They are
 * written from a short interview — three or four fixed questions from
 * `COMPANION_TUNE_QUESTIONS`, one per turn — or from a one-line tweak, by the
 * user's agent CLI through `ask.ts`'s `'persona'` mode, and the template when
 * there is none (Decision 6). Then the companion reads back the summary, asks
 * "Want to hear all of it?" (Decision 11), and only then asks to replace the
 * text, through the confirm tier.
 *
 * The machine here is pure: {@link stepTuneSession} takes the session and
 * what the user said and returns what happens next, and nothing in it speaks,
 * asks a CLI or writes a setting — `tune.ts` does those, around it. It lives
 * beside `conversation.ts` rather than in it (where the phase doc placed it)
 * because that file owns the microphone: importing it pulls in the recorder,
 * the speaker and `voice-ports.ts`'s store subscriptions, and `handoff.ts`,
 * which reaches this machine, must stay free of device code. The
 * session itself is one module-level slot, like `handoff.ts`'s `declined`: a
 * conversational scrap that lives for a few turns, never persisted. Every
 * answer is an ordinary turn in the thread already, posted before it reaches
 * here.
 *
 * "Skip", "start over" and "cancel" work at every stage. A session nobody has
 * answered for {@link TUNE_SESSION_IDLE_MS} is dropped, so a "push" said the
 * next morning is not taken as the answer to a question asked the night before.
 */

/** Where the draft came from — said once on the template path, so the user knows why it reads plainly. */
export type TuneDraft = CompanionPersonaReply & { source: 'agent' | 'template' };

/** How a session started. An interview can start over; a tweak has nothing to start over from. */
export type TuneOrigin = 'interview' | 'tweak';

export type TuneSession =
  | {
      stage: 'asking';
      origin: 'interview';
      target: CompanionTuneTarget;
      /** The question waiting on an answer — an index into `COMPANION_TUNE_QUESTIONS[target]`. */
      index: number;
      answers: CompanionTuneAnswers;
      at: number;
    }
  | {
      /** Waiting on the agent CLI (or about to fill the template). */
      stage: 'composing';
      origin: TuneOrigin;
      target: CompanionTuneTarget;
      at: number;
    }
  | {
      /** The summary has been read back; "Want to hear all of it?" is waiting on a yes or no. */
      stage: 'hearAll';
      origin: TuneOrigin;
      target: CompanionTuneTarget;
      draft: TuneDraft;
      at: number;
    };

/** What happens after one reply. Every arm but `compose` and `confirm` is just "say this". */
export type TuneStep =
  /** Say `say`, and wait for the next reply in `session`. */
  | { kind: 'ask'; session: TuneSession; say: string }
  /** The interview is answered: write `target` from `answers`, then {@link beginTuneReview}. */
  | { kind: 'compose'; session: Extract<TuneSession, { stage: 'composing' }>; answers: CompanionTuneAnswers }
  /** Still writing: say so, and leave the session as it is. */
  | { kind: 'wait'; session: TuneSession; say: string }
  /** Over with nothing written — cancelled, or every question skipped. */
  | { kind: 'end'; say: string }
  /** The read-back is done: read the whole draft first when `readAll`, then ask to apply it. */
  | { kind: 'confirm'; target: CompanionTuneTarget; draft: TuneDraft; readAll: boolean };

/** Five minutes, the same memory `handoff.ts` gives a declined command. */
export const TUNE_SESSION_IDLE_MS = 5 * 60 * 1000;

const HEAR_ALL = 'Want to hear all of it?';

function leftAsItWas(target: CompanionTuneTarget): string {
  return `Okay, I've left ${COMPANION_TUNE_TARGET_SPOKEN[target]} as it was.`;
}

function questionAt(target: CompanionTuneTarget, index: number): string {
  return (COMPANION_TUNE_QUESTIONS[target][index] as { ask: string }).ask;
}

/**
 * Start an interview: the session at its first question, and the line that
 * opens it — what is about to happen, the three steering words, and the first
 * question.
 */
export function beginTuneInterview(
  target: CompanionTuneTarget,
  now: number = Date.now(),
): { session: TuneSession; say: string } {
  const count = COMPANION_TUNE_QUESTIONS[target].length;
  const opener =
    target === 'companionPersonality'
      ? `Let's tune my personality — ${count} quick questions.`
      : `Tell me about you — ${count} quick questions.`;
  return {
    session: { stage: 'asking', origin: 'interview', target, index: 0, answers: {}, at: now },
    say: `${opener} Say skip, start over or cancel at any point. ${questionAt(target, 0)}`,
  };
}

/** A tweak goes straight to writing — there are no questions to ask. */
export function beginTuneTweak(
  target: CompanionTuneTarget,
  now: number = Date.now(),
): Extract<TuneSession, { stage: 'composing' }> {
  return { stage: 'composing', origin: 'tweak', target, at: now };
}

/**
 * A draft is ready: read back its summary and ask whether to hear the rest
 * (Decision 11). The template path says so first, once, so a plainer text is
 * not a surprise.
 */
export function beginTuneReview(
  origin: TuneOrigin,
  target: CompanionTuneTarget,
  draft: TuneDraft,
  now: number = Date.now(),
): { session: TuneSession; say: string } {
  const lead = draft.source === 'template' ? "I've filled in the basic template from your answers. " : '';
  return {
    session: { stage: 'hearAll', origin, target, draft, at: now },
    say: `${lead}Here's the gist: ${draft.summary} ${HEAR_ALL}`,
  };
}

function startOver(session: TuneSession, now: number): TuneStep {
  if (session.origin === 'tweak') return { kind: 'end', say: leftAsItWas(session.target) };
  return {
    kind: 'ask',
    session: { stage: 'asking', origin: 'interview', target: session.target, index: 0, answers: {}, at: now },
    say: `Starting over. ${questionAt(session.target, 0)}`,
  };
}

/** Move past the current question: the next one, or — after the last — write from what was said. */
function advance(
  session: Extract<TuneSession, { stage: 'asking' }>,
  answers: CompanionTuneAnswers,
  now: number,
): TuneStep {
  const next = session.index + 1;
  if (next < COMPANION_TUNE_QUESTIONS[session.target].length) {
    return { kind: 'ask', session: { ...session, index: next, answers, at: now }, say: questionAt(session.target, next) };
  }
  // The template is the measure of "said anything": an answer that cleans to
  // nothing ("um") counts as skipped, for the CLI's prompt as much as here.
  if (buildPersonaFromAnswers(session.target, answers).text === '') {
    return {
      kind: 'end',
      say: `You skipped every question, so I've left ${COMPANION_TUNE_TARGET_SPOKEN[session.target]} as it was.`,
    };
  }
  return {
    kind: 'compose',
    session: { stage: 'composing', origin: 'interview', target: session.target, at: now },
    answers,
  };
}

/**
 * One reply, one step. Pure: `session` is never mutated, and the returned
 * step carries the next one.
 */
export function stepTuneSession(session: TuneSession, text: string, now: number = Date.now()): TuneStep {
  const reply = classifyTuneReply(text);
  if (reply === 'cancel') return { kind: 'end', say: leftAsItWas(session.target) };
  if (reply === 'startOver') return startOver(session, now);

  switch (session.stage) {
    case 'asking': {
      if (reply === 'skip' || reply === 'no') return advance(session, session.answers, now);
      // "Anything I should avoid?" "Yes." — the answer is still to come.
      if (reply === 'yes') return { kind: 'ask', session: { ...session, at: now }, say: 'Go on.' };
      const question = COMPANION_TUNE_QUESTIONS[session.target][session.index] as { id: string };
      return advance(session, { ...session.answers, [question.id]: text.trim() }, now);
    }
    case 'composing':
      return { kind: 'wait', session, say: 'Still writing it — one moment. Say cancel to drop it.' };
    case 'hearAll':
      if (reply === 'yes') return { kind: 'confirm', target: session.target, draft: session.draft, readAll: true };
      if (reply === 'no' || reply === 'skip') {
        return { kind: 'confirm', target: session.target, draft: session.draft, readAll: false };
      }
      return { kind: 'ask', session: { ...session, at: now }, say: `${HEAR_ALL} Yes or no.` };
  }
}

let tuneSession: TuneSession | null = null;

/** The session waiting on a reply, or `null` — and `null` once it has sat idle past {@link TUNE_SESSION_IDLE_MS}. */
export function currentTuneSession(now: number = Date.now()): TuneSession | null {
  if (tuneSession !== null && now - tuneSession.at > TUNE_SESSION_IDLE_MS) tuneSession = null;
  return tuneSession;
}

/** Replace (or, with `null`, end) the session. */
export function setTuneSession(next: TuneSession | null): void {
  tuneSession = next;
}
