import {
  COMPANION_PHRASES,
  composeOverviewMarkdown,
  interpolatePhrase,
  markdownToSpeech,
  pickHonorific,
  pickPhrase,
  sanitizeForSpeech,
  splitForSpeech,
  type CompanionDigest,
  type CompanionPhraseKind,
  type CompanionSnapshot,
  type CompanionState,
  type CompanionTurn,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import type { Speaker } from './ports';
import type { CompanionEvent } from '@midnite/studio-shared';

/**
 * The scripted opening — Phase 79 Theme D.
 *
 * **There is no model call anywhere in this file.** Every sentence is either a
 * phrase-bank entry or a `shared` pure function over the two grounding
 * payloads Theme B built. That is the whole reason the companion can be
 * trusted to speak before anything has been fetched: the script is
 * deterministic, so it cannot say something that is not true, and a test can
 * assert the exact turn order.
 *
 * Written against `ConciergeDeps` rather than reaching for stores and the
 * bridge directly, for two reasons that both matter. The flow has to be
 * testable without jsdom, a rendered panel or a `speechSynthesis` stub — and
 * it has to work *before* Theme C's panel and Theme F's voice exist, which is
 * exactly what `silentSpeaker` and `runtime.ts`'s live wiring provide.
 */

/** The slice of `companion-store` the flow writes to. */
export type ConciergeStore = {
  state: CompanionState;
  transcript: readonly CompanionTurn[];
  recentPhrases: Partial<Record<CompanionPhraseKind, string[]>>;
  send: (event: CompanionEvent) => CompanionState;
  addTurn: (turn: { role: CompanionTurn['role']; text: string; spoken: boolean }) => CompanionTurn;
  markSpoken: (id: string) => void;
  notePhrase: (kind: CompanionPhraseKind, phrase: string) => void;
};

export type ConciergeSettings = {
  /**
   * `companionHonorifics` — empty by default, which every phrase template
   * reads correctly without (`pickHonorific` resolves an empty list to `''`,
   * same as the empty string it replaced).
   */
  honorifics: string[];
  /** `companionHandsFree` — the switch that lets the flow end in `listening` rather than `idle`. */
  handsFree: boolean;
  /**
   * Whether a speech-in provider is actually configured (Theme F).
   *
   * Separate from `handsFree` because the switch can be on with no provider
   * behind it, and ending the greeting in `listening` with nothing listening
   * is a state the FAB would draw and the machine would never leave.
   */
  voiceInReady: boolean;
};

export type ConciergeDeps = {
  store: ConciergeStore;
  speaker: Speaker;
  snapshot: (repoPath: string | null) => Promise<CompanionSnapshot>;
  digest: (req: { repoPath: string; since?: number; mark?: boolean }) => Promise<CompanionDigest>;
  settings: () => ConciergeSettings;
  /** The repository the flow is about. `null` path means none is open. */
  repo: () => { path: string | null; name: string | null } | null;
  /**
   * The interrupt token for THIS run.
   *
   * Re-read between every await rather than captured once, because the whole
   * point is that a keypress halfway through the digest stops the rest of it.
   */
  signal: AbortSignal;
  rng?: () => number;
  now?: () => number;
};

/**
 * Post a turn and, if there is a voice, read it out.
 *
 * The one place `spoken` is decided, and it is decided from what actually
 * happened rather than from configuration: a turn counts as spoken only when
 * the speaker declares itself available *and* the utterance was not aborted
 * mid-sentence. So an interrupted greeting leaves a transcript that says which
 * lines the user heard — which is what `kind: 'repeat'` and the replay-on-next
 * -launch rule both read.
 *
 * Long text is split by `splitForSpeech` before it reaches the synthesiser
 * (Theme E's 60-second cap), but posted to the thread whole: the cap exists
 * because listening to one utterance for a minute is intolerable, not because
 * the text is too long to read.
 */
export async function say(
  deps: ConciergeDeps,
  text: string,
  role: CompanionTurn['role'] = 'companion',
  speech: string = text,
): Promise<CompanionTurn> {
  const turn = deps.store.addTurn({ role, text, spoken: false });
  if (deps.signal.aborted || deps.speaker.available !== true) return turn;

  for (const utterance of splitForSpeech(speech)) {
    if (deps.signal.aborted) return turn;
    await deps.speaker.speak(utterance, { signal: deps.signal });
  }

  if (!deps.signal.aborted) deps.store.markSpoken(turn.id);
  return turn;
}

/**
 * Post markdown, speak prose.
 *
 * The follow-up's second fix in one line: the thread gets a formatted turn and
 * the voice gets {@link markdownToSpeech}'s projection of the very same text,
 * so the two can never say different things. A single `say(deps, markdown)`
 * would have the companion reading asterisks and URLs out loud, which is a
 * worse regression than the twelve bubbles this replaced.
 *
 * {@link sanitizeForSpeech} runs on top of that projection (Phase 80 Theme
 * A) — it never touches the markdown itself, only the derived speech string,
 * so the thread still shows the SHA/path/URL and only the voice redacts it.
 */
export async function sayMarkdown(deps: ConciergeDeps, markdown: string): Promise<CompanionTurn> {
  return say(deps, markdown, 'companion', sanitizeForSpeech(markdownToSpeech(markdown)));
}

/** Pick a phrase, resolve the honorific, and remember the pick so the next one differs. */
export function phrase(deps: ConciergeDeps, kind: CompanionPhraseKind): string {
  const bank = COMPANION_PHRASES[kind];
  const picked = pickPhrase(bank, deps.store.recentPhrases[kind] ?? [], deps.rng);
  deps.store.notePhrase(kind, picked);
  return interpolatePhrase(picked, pickHonorific(deps.settings().honorifics, deps.rng));
}

/**
 * The full opening: greeting, then everything {@link orient} says.
 *
 * Only runs from `idle` — `transition`'s own table refuses `greet` from
 * anywhere else, and this checks the answer rather than assuming it, so
 * opening the panel while the companion is mid-sentence is a no-op instead of
 * two overlapping scripts.
 */
export async function greet(deps: ConciergeDeps): Promise<void> {
  if (deps.store.send('greet') !== 'greeting') return;
  await say(deps, phrase(deps, 'greetings'));
  await orient(deps);
}

/**
 * Where the repo stands, then what has happened since — no greeting.
 *
 * The second entry point, and the reason there are two: a companion that is
 * already open when the active repository changes has to re-orient, and
 * greeting someone again because they clicked a different row in the sidebar
 * would be absurd.
 *
 * **One turn, not eight.** Theme D posted a turn per fact — a sentence each
 * for the branch, the ahead/behind, the dirty counts, the sessions, the forge,
 * then two more for the digest — which is the right shape for speech and the
 * wrong shape for a thread: the user got a stack of fragments and asked for
 * "one well formatted response". `composeOverviewMarkdown` is that response,
 * and `sayMarkdown` speaks its prose rendition, so nothing was lost from the
 * spoken script.
 *
 * The cost is that the digest is now awaited *before* anything is posted,
 * where it used to arrive after the snapshot lines were already on screen.
 * Acceptable because `greet` has already posted the greeting, so the panel is
 * never blank while this waits — and a consolidated turn cannot be posted in
 * pieces by definition.
 */
export async function orient(deps: ConciergeDeps): Promise<void> {
  const repo = deps.repo();
  const snapshot = await deps.snapshot(repo?.path ?? null);
  if (deps.signal.aborted) return finish(deps);

  const repoPath = repo?.path ?? null;
  const digest = repoPath === null ? null : await deps.digest({ repoPath });
  if (deps.signal.aborted) return finish(deps);

  await sayMarkdown(
    deps,
    composeOverviewMarkdown(snapshot, {
      digest,
      offerSwitch: snapshot.repos > 1,
      now: deps.now?.(),
    }),
  );

  /*
    Move the "last greeted" mark only now, in a second call — Theme B made a
    digest read move the mark only under `mark: true` precisely so this order
    was possible. A greeting cut off before the turn was spoken has to be
    replayed next launch, and a single marking read would have consumed the
    window before the user heard a word of it. The answer is discarded: it is
    the same window that was just read.
  */
  if (digest !== null && repoPath !== null && !deps.signal.aborted) {
    await deps.digest({ repoPath, since: digest.since, mark: true });
  }

  return finish(deps);
}

/**
 * The open prompt, and where the machine lands.
 *
 * Always reached, including down the interrupt path: a script that stops
 * halfway and says nothing leaves the user looking at a half-finished thread
 * with no indication that it is their turn. The prompt is posted but **not
 * spoken** after an interrupt — the user is already interacting, and talking
 * over them is what they just asked to stop.
 */
async function finish(deps: ConciergeDeps): Promise<void> {
  const settings = deps.settings();
  const prompt = phrase(deps, 'prompts');

  if (deps.signal.aborted) {
    deps.store.addTurn({ role: 'companion', text: prompt, spoken: false });
  } else {
    await say(deps, prompt);
  }

  // `listening` only when the switch is on AND something is actually listening
  // — otherwise the FAB would show a state the machine could never leave.
  deps.store.send(settings.handsFree && settings.voiceInReady ? 'listen' : 'settle');
}

/**
 * Which repositories the switch offer can name.
 *
 * Exported for Theme C's chooser, which renders the rows: matching a spoken
 * name against them is `handoff.ts`'s job and rendering them is the panel's,
 * so the one thing that belongs in neither is the matching *rule* — case- and
 * whitespace-insensitive, on the name the sidebar shows.
 */
export function matchRepoByName(
  repos: readonly RepoDescriptor[],
  name: string,
): RepoDescriptor | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return null;
  return (
    repos.find((repo) => repo.name.toLowerCase() === wanted) ??
    repos.find((repo) => repo.name.toLowerCase().includes(wanted)) ??
    null
  );
}
