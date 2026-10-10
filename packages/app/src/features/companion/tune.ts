import {
  COMPANION_TUNE_TARGET_SPOKEN,
  buildPersonaFromAnswers,
  tuneAnswersForPrompt,
  type CompanionPersonaReply,
  type CompanionPersonaRequest,
  type CompanionTuneAnswers,
  type CompanionTuneTarget,
  type GitOpResult,
} from '@midnite/studio-shared';

import { say, type ConciergeDeps } from './concierge';
import {
  beginTuneInterview,
  beginTuneReview,
  beginTuneTweak,
  currentTuneSession,
  setTuneSession,
  stepTuneSession,
  type TuneDraft,
  type TuneSession,
} from './conversation';

/**
 * "Tune me" and quick tweaks, out loud — Phase 109 Theme H.
 *
 * `conversation.ts` decides what each reply means; this file does what it
 * says — speaks the next question, asks the agent CLI to write the text
 * (`ask.ts`'s `'persona'` mode), falls back to the template, reads back the
 * summary, and hands the confirm to `handoff.ts`, which owns the one pending
 * question and the setter. Nothing here writes a setting.
 *
 * Decisions 4, 6 and 11, as settled: personality and About me are never
 * dictated — only an interview or a tweak can produce them; with no agent CLI
 * an interview fills the local template and a tweak points to the page; and
 * the read-back is the ≤200-character summary, with the full text only on
 * request, before anything is applied through the confirm tier.
 */

/** What the tune flow needs besides speaking — `handoff.ts` assembles it over `runtime.ts`'s bridge and its own pending slot. */
export type TunePort = {
  /** `mstudio:companion:ask` in `'persona'` mode: the draft, or why there is none. */
  persona: (request: CompanionPersonaRequest) => Promise<GitOpResult<CompanionPersonaReply>>;
  /** Whether anything on the agent roster has a headless mode — no CLI means the template (interview) or the page (tweak). */
  hasAgentCli: () => boolean;
  /** What the field says now — a tweak rewrites it, an interview keeps what still fits. */
  currentText: (target: CompanionTuneTarget) => string;
  /** Ask, through the confirm tier, to replace `target` with `text`; a yes applies it as a tuned change. */
  askToReplace: (target: CompanionTuneTarget, text: string) => Promise<void>;
  /** Say `line` and offer to open Settings ▸ Companion on a yes. */
  offerSettingsPage: (line: string) => Promise<void>;
};

export type TuneDeps = ConciergeDeps & { tune: TunePort };

/** Decision 6's line for a tweak with no agent CLI, verbatim from the phase doc. */
export const TWEAK_NEEDS_CLI = 'I need an agent CLI for that — want me to open Settings, Companion?';

/** A tweak only ever revises the personality — honorifics stay the `setting` grammar's. */
const TWEAK_TARGET: CompanionTuneTarget = 'companionPersonality';

/**
 * The draft being written, and the session it belongs to.
 *
 * Module state beside the session it serves, and for one reason: a new line
 * of input starts a new flow and aborts the old one (`runtime.ts`'s `begin`),
 * which would otherwise drop a CLI answer that is still on its way. A reply
 * mid-write ("hello?") awaits the same promise under its own flow instead of
 * asking the CLI twice.
 */
let composing: { session: TuneSession; draft: Promise<TuneDraft | { error: string }> } | null = null;

/** Drop any interview or tweak in progress. Tests only. */
export function resetTuneStateForTest(): void {
  composing = null;
  setTuneSession(null);
}

/** "Tune yourself" / "let me tell you about me": open the interview and ask the first question. */
export async function startTuneInterview(target: CompanionTuneTarget, deps: TuneDeps): Promise<void> {
  composing = null;
  const { session, say: line } = beginTuneInterview(target, Date.now());
  setTuneSession(session);
  await say(deps, line);
}

/**
 * "Be more sarcastic": ask the CLI to revise the personality with that one
 * instruction, then read back like an interview. With no CLI there is no
 * template for a tweak — the sentence cannot be applied without one — so it
 * points to the page (Decision 6).
 */
export async function startTuneTweak(instruction: string, deps: TuneDeps): Promise<void> {
  composing = null;
  if (!deps.tune.hasAgentCli()) {
    setTuneSession(null);
    await deps.tune.offerSettingsPage(TWEAK_NEEDS_CLI);
    return;
  }
  const session = beginTuneTweak(TWEAK_TARGET, Date.now());
  setTuneSession(session);
  composing = {
    session,
    draft: agentDraft(deps, {
      mode: 'tweak',
      target: TWEAK_TARGET,
      instruction,
      current: deps.tune.currentText(TWEAK_TARGET),
    }),
  };
  await say(deps, 'Give me a moment to rework that.');
  await awaitDraft(deps);
}

/**
 * One line of input while an interview or tweak is open. `false` when none is
 * — the caller parses the line as usual. Every answer was already posted as
 * an ordinary user turn by the caller; nothing here persists it.
 */
export async function continueTune(text: string, deps: TuneDeps): Promise<boolean> {
  const session = currentTuneSession(Date.now());
  if (session === null) return false;

  const step = stepTuneSession(session, text, Date.now());
  switch (step.kind) {
    case 'ask':
      // A question again — a start-over abandons whatever was being written.
      composing = null;
      setTuneSession(step.session);
      await say(deps, step.say);
      return true;

    case 'wait':
      if (composing === null) {
        // Nothing is actually being written any more — never leave the user
        // stuck behind "one moment".
        setTuneSession(null);
        await say(deps, 'I lost track of that one — say it again whenever you like.');
        return true;
      }
      await say(deps, step.say);
      await awaitDraft(deps);
      return true;

    case 'end':
      composing = null;
      setTuneSession(null);
      await say(deps, step.say);
      return true;

    case 'compose':
      setTuneSession(step.session);
      composing = { session: step.session, draft: interviewDraft(deps, step.session.target, step.answers) };
      await say(deps, 'Thanks — give me a moment to write that up.');
      await awaitDraft(deps);
      return true;

    case 'confirm':
      composing = null;
      setTuneSession(null);
      if (step.readAll) await say(deps, step.draft.text);
      await deps.tune.askToReplace(step.target, step.draft.text);
      return true;
  }
}

/** The CLI's draft, or the reason there is none — never a rejection. */
async function agentDraft(
  deps: TuneDeps,
  request: CompanionPersonaRequest,
): Promise<TuneDraft | { error: string }> {
  try {
    const result = await deps.tune.persona(request);
    if (result.ok) return { ...result.value, source: 'agent' };
    return { error: result.kind === 'error' ? result.message : 'I could not write that.' };
  } catch {
    return { error: 'I could not write that.' };
  }
}

/**
 * The interview's draft: the CLI's when there is one and it answered in shape,
 * otherwise the template — so an interview always ends with something to
 * read back (Decision 6).
 */
async function interviewDraft(
  deps: TuneDeps,
  target: CompanionTuneTarget,
  answers: CompanionTuneAnswers,
): Promise<TuneDraft | { error: string }> {
  const template = (): TuneDraft => ({ ...buildPersonaFromAnswers(target, answers), source: 'template' });
  if (!deps.tune.hasAgentCli()) return template();
  const drafted = await agentDraft(deps, {
    mode: 'interview',
    target,
    answers: tuneAnswersForPrompt(target, answers),
    current: deps.tune.currentText(target),
  });
  return 'error' in drafted ? template() : drafted;
}

/**
 * Wait for the draft in flight and read it back. Silent when this flow was
 * interrupted (the next line picks the same draft up), or when the session it
 * was written for has been cancelled or started over in the meantime.
 */
async function awaitDraft(deps: TuneDeps): Promise<void> {
  const job = composing;
  if (job === null) return;

  const entered = deps.store.send('submit') === 'thinking';
  const outcome = await job.draft;
  if (entered) deps.store.send('settle');
  if (deps.signal.aborted || composing !== job || currentTuneSession(Date.now()) !== job.session) return;
  composing = null;

  const { origin, target } = job.session;
  if ('error' in outcome) {
    setTuneSession(null);
    await say(deps, `${outcome.error} I've left ${COMPANION_TUNE_TARGET_SPOKEN[target]} as it was.`);
    return;
  }

  const review = beginTuneReview(origin, target, outcome, Date.now());
  setTuneSession(review.session);
  // The thread gets the whole draft to read; the speaker gets the summary and
  // the question (Decision 11) — four thousand characters is three minutes aloud.
  await say(deps, `${review.say}\n\n${quote(outcome.text)}`, 'companion', review.say);
}

/** A draft as a markdown quote, so it reads as the proposed text rather than as something said. */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
