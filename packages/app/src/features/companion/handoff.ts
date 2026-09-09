import {
  COMPANION_COMMAND_IDS,
  COMPANION_READBACK_TAIL_CHARS,
  extractLastAgentTurn,
  parseIntent,
  type CompanionAskReply,
  type CompanionCommandId,
  type CompanionIntent,
  type CompanionVocabulary,
  type GitOpResult,
  type RepoDescriptor,
  type SessionActivity,
} from '@midnite/studio-shared';

import { phrase, say, matchRepoByName, type ConciergeDeps } from './concierge';
import type { AgentCommandId } from '../../store/ui-store';

/**
 * From "start a swarm" to hearing what the swarm did — Phase 79 Theme E.
 *
 * Four things happen here, in order, and each is a seam the previous themes
 * left open. A line of input becomes a {@link CompanionIntent} through
 * `shared`'s keyword grammar. A `command` intent becomes a typed-not-sent
 * agent session through Phase 35's own hand-off. That session's `pty:activity`
 * rungs become the end of the loading state. And its scrollback becomes an
 * `agent` turn plus a spoken summary.
 *
 * Nothing in this file talks to a model except through `deps.ask`, which is
 * `mstudio:companion:ask` — the installed CLI in print mode. The grammar comes
 * first precisely so that most sentences never reach it.
 */

/**
 * Compile-time proof that the companion's command list is a subset of the
 * real thing.
 *
 * `COMPANION_COMMAND_IDS` is declared in `shared`, which cannot import this
 * package's `AgentCommandId` union — the dependency runs the other way. This
 * assignment is what stops the two drifting: rename or remove an id in
 * `ui-store.ts` and the build fails here rather than at runtime, when
 * `skillHandoff` would quietly return `null` and the companion would say it
 * had started something it had not.
 */
const _companionIdsAreAgentCommandIds: readonly AgentCommandId[] = COMPANION_COMMAND_IDS;
void _companionIdsAreAgentCommandIds;

export type HandoffDeps = ConciergeDeps & {
  /** `skillHandoff` bound to the live roster — returns the session, or `null` if it could not start. */
  startSkill: (opts: {
    skillId: CompanionCommandId;
    body?: string;
    autoSend: boolean;
  }) => { id: string } | null;
  /** `window.midniteStudio.companion.ask`. */
  ask: (req: {
    kind: 'route' | 'summarise';
    text: string;
  }) => Promise<GitOpResult<CompanionAskReply>>;
  /** The session's scrollback as text, or `null` when there is no live pty. */
  scrollback: (sessionId: string) => Promise<string | null>;
  /** The roster's activity markers for whatever agent that session is running. */
  markers: (sessionId: string) => { awaitingInput?: string; frameEnd?: string } | undefined;
  /** Type text into a fresh agent session verbatim — the no-CLI fallback. */
  startVerbatim: (text: string) => { id: string } | null;
  /** Which repositories the switch offer can name, and how to pick one. */
  repos: () => Promise<readonly RepoDescriptor[]>;
  selectRepo: (repoId: string) => void;
  /** Theme G's audio, when it exists. Absent means the request is acknowledged and no more. */
  onMusic?: ((on: boolean) => void) | undefined;
  /** Whether the hands-free switch is on AND a provider is configured — the only `autoSend: true`. */
  autoSendAllowed: () => boolean;
  activeHandoff: () => { sessionId: string; command: string } | null;
  setActiveHandoff: (handoff: { sessionId: string; command: string } | null) => void;
  /**
   * Views, settings pages, commands (by tier), skills and repos — what the
   * grammar (`parseIntent`'s `navigate`/`run`) and Theme E's `ask` prompt are
   * both allowed to name. `runtime.ts` builds this once per flow, beside
   * `refreshRoster()`, from `vocabulary.ts`'s `buildVocabulary` — never by
   * hand, and never a second copy of the palette's own tables (Finding 2).
   */
  vocabulary: () => CompanionVocabulary;
};

/**
 * The command a live hand-off refused, kept so a bare "anyway" can mean
 * something.
 *
 * Module state rather than store state, and deliberately: it is a
 * conversational scrap with a lifetime of one exchange, not something worth
 * persisting, rehydrating or rendering. `resetHandoffState` exists for tests,
 * which are the only other caller.
 */
let declined: { intent: CompanionIntent; at: number } | null = null;

/** How long a declined command stays available to "anyway". */
export const DECLINE_MEMORY_MS = 5 * 60 * 1000;

export function resetHandoffState(): void {
  declined = null;
}

/**
 * One line of typed or spoken input, all the way through.
 *
 * Never throws. Every arm ends with the companion having said something,
 * because a companion that silently ignores a sentence is indistinguishable
 * from one that is broken.
 */
export async function submitInput(text: string, deps: HandoffDeps): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === '') return;

  deps.store.addTurn({ role: 'user', text: trimmed, spoken: false });
  await act(parseIntent(trimmed, deps.vocabulary()), deps, trimmed);
}

/**
 * Carry out one intent.
 *
 * Split from {@link submitInput} because the headless router answers *with an
 * intent*, and routing its answer back through the same switch is what keeps
 * "start a swarm" and a sentence the router recognised as one from taking two
 * different code paths. `depth` stops a router that answers `freeform` from
 * recursing forever.
 */
async function act(
  intent: CompanionIntent,
  deps: HandoffDeps,
  original: string,
  depth = 0,
): Promise<void> {
  switch (intent.kind) {
    case 'stop':
      deps.speaker.cancel();
      deps.store.send('interrupt');
      return;

    case 'repeat':
      return repeatLast(deps);

    case 'dismiss':
      declined = null;
      await say(deps, 'Right, staying put.');
      return;

    case 'music':
      deps.onMusic?.(intent.on);
      await say(
        deps,
        intent.on
          ? 'Music on.'
          : 'Music off.',
      );
      return;

    case 'switchRepo':
      return switchRepo(intent.name, deps);

    case 'anyway':
      return runDeclined(deps);

    case 'command':
      return startCommand(intent, deps);

    // Stubs — Theme A lands the schema, the grammar and this exhaustiveness
    // check together so nothing is added to `CompanionIntentSchema` without
    // `act()` handling it; Themes B (navigate), C (run/confirm) and the
    // `help` bullet of C replace each one with the real behaviour.
    case 'navigate':
    case 'run':
    case 'confirm':
    case 'help':
      await say(deps, "I can't do that yet.");
      return;

    case 'freeform':
      return route(intent.text || original, deps, depth);
  }
}

/**
 * Re-speak the last thing the companion said.
 *
 * Exported because it has two entry points: the `repeat` intent, and Theme C's
 * assistant-popover "Repeat" row, which reaches it through the ports registry
 * without a `repeat` ever being typed.
 */
export async function repeatLast(deps: HandoffDeps): Promise<void> {
  const last = [...deps.store.transcript]
    .reverse()
    .find((turn) => turn.role === 'companion' && turn.text.trim() !== '');
  if (!last) {
    await say(deps, 'I have not said anything yet.');
    return;
  }
  // A fresh turn rather than re-speaking the old one in place: the transcript
  // is a record of the conversation, and "say that again" happened.
  await say(deps, last.text);
}

/**
 * Hand the request to a real agent session.
 *
 * **Decision 10, as recommended: one live hand-off at a time, with an
 * override.** The refusal is a spoken sentence rather than a queue, because a
 * queue is invisible — a second command silently waiting behind the first is
 * indistinguishable from a companion that ignored it. Parallel work is what
 * `execSwarm` is for, and "anyway" is there for the case where the user means
 * it.
 *
 * The override reaches the state machine as `exit` then `submit`, exactly as
 * `shared`'s own transition-table docblock predicted — so `handoff` keeps
 * refusing `submit` and the table needed no new row and no new event.
 */
async function startCommand(
  intent: Extract<CompanionIntent, { kind: 'command' }>,
  deps: HandoffDeps,
): Promise<void> {
  const live = deps.activeHandoff();
  if (live && intent.override !== true) {
    declined = { intent, at: Date.now() };
    await say(
      deps,
      `${live.command} is still running — say "anyway" to start another.`,
    );
    return;
  }

  if (live) {
    // The override: retire the old hand-off in the machine's eyes before
    // asking it to accept a new submit.
    deps.store.send('exit');
    deps.setActiveHandoff(null);
  }

  if (deps.store.send('submit') !== 'thinking') return;

  const autoSend = deps.autoSendAllowed();
  const session = deps.startSkill({
    skillId: intent.id,
    ...(intent.body === undefined ? {} : { body: intent.body }),
    autoSend,
  });

  if (!session) {
    deps.store.send('settle');
    await say(
      deps,
      'I could not start that one — check the agent and skill settings.',
    );
    return;
  }

  const command = commandLabel(intent);
  deps.setActiveHandoff({ sessionId: session.id, command });
  declined = null;

  /*
    The spoken confirmation comes BEFORE the machine enters `handoff`, and it
    says which of the two things happened. With hands-free off — the default —
    the command is sitting at a prompt with its Return withheld, and saying so
    is the only way the user knows a keystroke is owed.
  */
  await say(
    deps,
    autoSend
      ? `Running ${command} now.`
      : `I have typed ${command} in a new session — press Return when you are ready.`,
  );

  deps.store.send('handoff');
}

/** "anyway", on its own, after a refusal. */
async function runDeclined(deps: HandoffDeps): Promise<void> {
  const pending = declined;
  // A five-minute memory, because "anyway" after twenty minutes means
  // something else, and starting an agent on a misremembered request is the
  // one outcome worth being conservative about.
  if (!pending || Date.now() - pending.at > DECLINE_MEMORY_MS) {
    await say(deps, 'Anyway what? I have nothing waiting.');
    return;
  }
  declined = null;
  if (pending.intent.kind !== 'command') return act(pending.intent, deps, '');
  return startCommand({ ...pending.intent, override: true }, deps);
}

/** "switch to bilo-mono", or a bare "switch". */
async function switchRepo(name: string | undefined, deps: HandoffDeps): Promise<void> {
  const repos = await deps.repos();
  if (repos.length <= 1) {
    await say(deps, 'There is only the one repository open.');
    return;
  }

  if (name === undefined) {
    await say(deps, `Which one? ${repos.map((repo) => repo.name).join(', ')}.`);
    return;
  }

  const matched = matchRepoByName(repos, name);
  if (!matched) {
    await say(deps, `I could not find a repository called ${name}.`);
    return;
  }

  deps.selectRepo(matched.id);
  await say(deps, `Switching to ${matched.name}.`);
  // The caller re-orients: `runtime.ts` re-runs the overview against the new
  // repo, which is the same path the sidebar's own selection takes.
}

/**
 * The sentence the grammar did not recognise.
 *
 * Two outcomes, and the fallback matters more than the success. When the
 * router answers with an intent, that intent goes back through {@link act} —
 * the same code path a recognised sentence takes, so there is exactly one
 * implementation of "start a swarm". When there is no CLI at all, the text is
 * typed verbatim into a fresh agent session: the companion cannot think, but
 * the user's own agent can, and handing it over beats an apology.
 */
async function route(text: string, deps: HandoffDeps, depth: number): Promise<void> {
  if (depth > 0) {
    // The router already had its turn and answered with another freeform.
    await say(deps, 'I am not sure what to do with that one.');
    return;
  }

  if (deps.store.send('submit') !== 'thinking') return;
  const result = await deps.ask({ kind: 'route', text });

  if (!result.ok) {
    deps.store.send('settle');
    const session = deps.startVerbatim(text);
    await say(
      deps,
      session
        ? 'I cannot think about that myself, so I have typed it into a new agent session for you.'
        : result.kind === 'error'
          ? result.message
          : 'I could not run that.',
    );
    return;
  }

  const reply = result.value;
  if (reply.raw !== undefined && reply.raw !== '') {
    // Unparseable output, posted rather than spoken — the only evidence of
    // what the CLI actually said.
    deps.store.addTurn({ role: 'agent', text: reply.raw, spoken: false });
  }

  deps.store.send('settle');
  await say(deps, reply.say);
  if (reply.intent) await act(reply.intent, deps, text, depth + 1);
}

// --- watching the hand-off -------------------------------------------------

/**
 * How long a hand-off may sit before the companion asks about the Return.
 *
 * Twenty seconds, from the phase doc. Long enough that a cold agent CLI
 * starting up does not trip it, short enough that a user who walked away from
 * a withheld Return finds out before they have forgotten what they asked for.
 */
export const HANDOFF_START_GRACE_MS = 20_000;

export type HandoffWatchEvent =
  | { kind: 'activity'; activity: SessionActivity | undefined }
  | { kind: 'exit'; exitCode: number };

/**
 * Track one hand-off's rungs and decide when the answer is ready.
 *
 * A small state machine of its own, and it is a machine rather than an `if`
 * because the interesting condition is a *sequence*: the loading state ends on
 * the first `waiting` or `idle` **after at least one `thinking`**. Without the
 * "after" clause it ends immediately — a session that has not started yet is
 * `idle`, which is indistinguishable from one that has finished, and the
 * companion would read back the empty scrollback of an agent it just launched.
 *
 * Returned as a plain object so the subscription in `runtime.ts` and its test
 * share the logic without either owning a store subscription.
 */
export function createHandoffTracker(): {
  observe: (event: HandoffWatchEvent) => 'idle' | 'thinking' | 'ready' | 'ended';
  everThought: () => boolean;
} {
  let thought = false;
  let settled = false;

  return {
    everThought: () => thought,
    observe: (event) => {
      if (settled) return 'ended';
      if (event.kind === 'exit') {
        settled = true;
        return 'ended';
      }
      if (event.activity === 'thinking') {
        thought = true;
        return 'thinking';
      }
      if (thought && (event.activity === 'waiting' || event.activity === 'idle')) {
        settled = true;
        return 'ready';
      }
      return 'idle';
    },
  };
}

/**
 * The nudge for a hand-off that never started.
 *
 * The phase doc detects the user's Return "via `mstudio:pty:input` echo".
 * There is no such echo: `pty:input` is a one-way renderer→main send with no
 * event channel behind it, and adding a push channel so the companion can
 * notice a keystroke it already knows it did not send is a lot of wire for a
 * sentence. So the grace period runs from the hand-off being created, and the
 * absence of any `thinking` rung within it is the signal — which is the same
 * fact, observed on the channel that already exists.
 */
export function startNudgeSentence(command: string): string {
  return `${command} has not started yet — did you press Return?`;
}

// --- reading it back -------------------------------------------------------

/**
 * The agent's answer: in the thread whole, spoken as a summary.
 *
 * The two halves are deliberate. `extractLastAgentTurn` cuts one turn out of
 * the scrollback and strips every escape a synthesiser would otherwise read
 * aloud; that cleaned text goes in the thread, where it can be scrolled and
 * copied. What gets *spoken* is a two-to-four sentence summary from the same
 * headless CLI, prefixed with a sign-off phrase — because an agent's answer is
 * markdown with file paths and code in it, and reading that out is unbearable.
 *
 * With no CLI to summarise with, the first 240 characters of the cleaned text
 * are spoken instead, followed by a pointer to the thread. Degraded, but
 * truthful, and the thread still has everything.
 */
export const READBACK_VERBATIM_CHARS = 240;

export async function readBack(
  deps: HandoffDeps,
  sessionId: string,
  outcome: { exitCode?: number } = {},
): Promise<void> {
  const raw = await deps.scrollback(sessionId);
  const cleaned =
    raw === null
      ? ''
      : extractLastAgentTurn(raw, deps.markers(sessionId), COMPANION_READBACK_TAIL_CHARS);

  if (cleaned !== '') deps.store.addTurn({ role: 'agent', text: cleaned, spoken: false });

  if (outcome.exitCode !== undefined && outcome.exitCode !== 0) {
    deps.store.addTurn({
      role: 'agent',
      text: `The session exited with code ${outcome.exitCode}.`,
      spoken: false,
    });
    deps.setActiveHandoff(null);
    deps.store.send('exit');
    await say(deps, 'That session ended with an error — the details are in the thread.');
    deps.store.send('settle');
    return;
  }

  deps.setActiveHandoff(null);
  deps.store.send('exit');

  if (cleaned === '') {
    await say(deps, 'That one finished, but it left nothing I could read back.');
    deps.store.send('settle');
    return;
  }

  const signoff = phrase(deps, 'signoffs');
  const summary = await deps.ask({ kind: 'summarise', text: cleaned });

  deps.store.send('speak');
  await say(deps, signoff);
  if (summary.ok) {
    await say(deps, summary.value.say);
  } else {
    await say(deps, cleaned.slice(0, READBACK_VERBATIM_CHARS));
    await say(deps, 'The rest is in the thread.');
  }
  deps.store.send('settle');
}

/** What the companion calls a command out loud — the skill string, not the id. */
function commandLabel(intent: Extract<CompanionIntent, { kind: 'command' }>): string {
  return COMMAND_SPOKEN_NAMES[intent.id];
}

/**
 * How each command is named in speech.
 *
 * Not the `AgentCommandId` (`execAdhoc` read aloud is nonsense) and not the
 * skill string either (`/midnite-exec-adhoc` is worse). These are what a
 * person would call the thing they just asked for, which is what a
 * confirmation has to say back for the user to know they were understood.
 */
export const COMMAND_SPOKEN_NAMES: Record<CompanionCommandId, string> = {
  execAdhoc: 'an ad hoc task',
  execBacklog: 'the next backlog task',
  execSwarm: 'a swarm',
  brainstorm: 'a brainstorm',
  refine: 'a refinement',
  addressIssue: 'an issue fix',
  prReview: 'a PR review',
  prFeedback: 'a PR feedback pass',
  gitReport: 'a git report',
  gitCleanup: 'a git cleanup',
};
