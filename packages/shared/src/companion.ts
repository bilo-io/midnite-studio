import { z } from 'zod';

import { cleanPtyText } from './ansi';
import {
  SETTINGS_PAGE_IDS,
  VIEW_IDS,
  RepoDescriptorSchema,
  type Ref,
  type SettingsPageId,
  type ViewId,
} from './domain';
import { isCommandId } from './keybindings';
import { parseConventionalCommit } from './version';
import { resolveAgentAndModel } from './ai-models';

/**
 * The companion (Phase 79) — its state machine, the words it says, and the
 * two grounding payloads it asks main for.
 *
 * Everything here is **data and pure functions**, for the reason
 * `agent-invocation.ts` gives for itself: both processes need it. The state
 * machine and the phrase banks are the renderer's (Themes A, C, D); the
 * snapshot and digest schemas are main's wire contract (Theme B); and
 * `summariseDigest` is called by whichever side is about to speak. A copy in
 * each package would drift the first time a phrase or a transition changed.
 *
 * `shared` imports zod and nothing else in the workspace, so nothing in this
 * module may reach for `electron`, `node:*` or React — the phase's own scope
 * guardrail, enforced by `eslint.config.mjs`'s per-package
 * `no-restricted-imports` group.
 */

// --- A · the state machine --------------------------------------------------

/**
 * What the companion is doing, as one value.
 *
 * `handoff` is the state while a pty *the companion started* is still
 * `thinking`/`waiting` — distinct from `thinking`, which is the companion's
 * own deterministic work (grounding, intent parsing, a headless summary). The
 * distinction is load-bearing for Theme H: a hand-off is an agent the user can
 * go and look at, and the FAB says so.
 */
export const COMPANION_STATES = [
  'off',
  'idle',
  'greeting',
  'listening',
  'thinking',
  'speaking',
  'handoff',
] as const;
export type CompanionState = (typeof COMPANION_STATES)[number];

/**
 * Every input the machine accepts.
 *
 * `settle` is "the thing you were doing finished normally"; `interrupt` is the
 * user cutting it off (Escape, a click, a new utterance). Both land on `idle`,
 * and they are separate events because Theme G's audio has to fade on one and
 * stop dead on the other.
 *
 * `activity-idle` is the `mstudio:pty:activity` event arriving as `idle` for
 * the session the companion handed off to — the phase's "'the response is
 * ready' is already a signal". `exit` is that same pty ending.
 */
export const COMPANION_EVENTS = [
  'enable',
  'disable',
  'greet',
  'listen',
  'submit',
  'handoff',
  'speak',
  'settle',
  'interrupt',
  'exit',
  'activity-idle',
] as const;
export type CompanionEvent = (typeof COMPANION_EVENTS)[number];

/**
 * The transition table, as a pure total function.
 *
 * **Total on purpose.** Every state × every event yields a state, and an
 * illegal pairing yields the state it was already in rather than throwing —
 * so the store never needs a try/catch and a stray event from a late timer or
 * a torn-down pty is a no-op instead of a crash. `companion.test.ts` asserts
 * totality by enumerating the full product.
 *
 * Two rules are worth stating in prose because they are decisions, not
 * mechanics:
 *
 * - **`disable` wins from anywhere.** The companion is a default-off feature
 *   with a switch in Settings; flipping it off mid-sentence has to work.
 * - **`handoff` refuses `submit`** (Decision 10). While one hand-off is live a
 *   second command is declined by the script — "the last one is still running"
 *   — rather than silently queued or run in parallel. The `anyway` override is
 *   Theme E's grammar token, which reaches the machine as `exit` + `submit`,
 *   not as a second `submit` the table has to special-case.
 */
export function transition(state: CompanionState, event: CompanionEvent): CompanionState {
  // `off` is inert except for the switch that leaves it.
  if (state === 'off') return event === 'enable' ? 'idle' : 'off';
  if (event === 'disable') return 'off';

  switch (event) {
    case 'enable':
      // Already on — idempotent, not a reset: a second `enable` must not
      // interrupt a sentence in progress.
      return state;
    case 'greet':
      return state === 'idle' ? 'greeting' : state;
    case 'listen':
      // Listening interrupts a spoken line — that is the point of a mic that
      // is always reachable — but never a live hand-off or the companion's own
      // in-flight work, which have nothing to say back yet.
      return state === 'thinking' || state === 'handoff' ? state : 'listening';
    case 'submit':
      return state === 'handoff' ? state : 'thinking';
    case 'handoff':
      return state === 'thinking' ? 'handoff' : state;
    case 'speak':
      return 'speaking';
    case 'settle':
    case 'interrupt':
      return 'idle';
    case 'exit':
    case 'activity-idle':
      return state === 'handoff' ? 'idle' : state;
    default: {
      // Unreachable while `CompanionEvent` is exhaustive; the assignment is
      // what makes adding an event a typecheck failure here.
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

// --- A · the phrase banks ---------------------------------------------------

/**
 * The words, as data.
 *
 * Curated JSON rather than generated text (Decision 6) — there is no model in
 * this loop, and a deterministic script is the whole reason the companion can
 * be trusted to speak before any grounding has arrived.
 *
 * `{name}` is the honorific from `companionHonorific`, empty by default.
 * `interpolatePhrase` collapses it *and* the punctuation that only existed to
 * set it off, so every template here has to read correctly both ways — which
 * is why none of them put `{name}` between two commas mid-clause.
 *
 * Quotes are unattributed and either public-domain or written for this file,
 * per the phase's own guardrail.
 */
export const COMPANION_PHRASES = {
  greetings: [
    'Good to see you{name}.',
    'Welcome back{name}.',
    'Evening{name}. The studio is yours.',
    'Right{name}, let us see where things stand.',
    'Back at it{name}.',
  ],
  signoffs: [
    'Okay{name}, as per your request.',
    'Here we are{name}.',
    'That is done{name}.',
    'All yours{name}.',
    'There we go{name}.',
  ],
  fillers: [
    'A fun fact while we wait: the first version-control system predates the mouse.',
    'Still going. Git stores every file as a blob named after its own contents.',
    'One moment. A merge conflict is git admitting it has no opinion.',
    'Working on it. The word "patch" comes from actual paper tape, with actual holes.',
    'Nearly there. A shallow clone is the only kind that forgets on purpose.',
  ],
  quotes: [
    'Make it work, make it right, make it fast — in that order.',
    'Weeks of coding can save you hours of planning.',
    'The best time to write a test was yesterday.',
    'A branch nobody merges is a diary, not a plan.',
    'Simplicity is a decision, not an accident.',
  ],
  musicOffers: [
    'This one is taking a while{name} — shall I put some music on?',
    'Long one{name}. Music while we wait?',
    'Still thinking. Would you like something to listen to{name}?',
  ],
  prompts: [
    'What would you like to do{name}?',
    'Where shall we start{name}?',
    'Say the word{name}.',
    'What next{name}?',
  ],
} as const;

export type CompanionPhraseKind = keyof typeof COMPANION_PHRASES;
export const COMPANION_PHRASE_KINDS = Object.keys(COMPANION_PHRASES) as CompanionPhraseKind[];

/**
 * How many recent picks `pickPhrase` refuses to repeat.
 *
 * `min(3, bank.length - 1)` rather than a flat 3: a three-entry bank with a
 * three-deep exclusion window has nothing left to pick, so the window always
 * leaves at least one candidate standing. A one-entry bank excludes nothing
 * and repeats forever, which is the only honest answer.
 */
export function noRepeatWindow(bankLength: number): number {
  return Math.max(0, Math.min(3, bankLength - 1));
}

/**
 * Pick a phrase at random, but never one of the last few.
 *
 * `rng` is injected (defaulting to `Math.random`) so the picker is
 * deterministic under test — the alternative is a test that stubs a global,
 * which this package has no business doing.
 *
 * `recent` is newest-first, exactly as `companion-store.ts` keeps it: the
 * store unshifts every pick, so the window is a prefix rather than a suffix.
 */
export function pickPhrase(
  bank: readonly string[],
  recent: readonly string[] = [],
  rng: () => number = Math.random,
): string {
  if (bank.length === 0) return '';
  const excluded = new Set(recent.slice(0, noRepeatWindow(bank.length)));
  const candidates = bank.filter((phrase) => !excluded.has(phrase));
  // Every entry excluded means `recent` holds phrases from a bank that has
  // since changed (a build with different words, a rehydrated store). Falling
  // back to the whole bank beats returning nothing.
  const pool = candidates.length > 0 ? candidates : bank;
  return pool[pickIndex(rng, pool.length)] as string;
}

/**
 * Resolve `{name}` against the honorific, collapsing cleanly when it is empty.
 *
 * An empty honorific is the default, so "collapses cleanly" is the *common*
 * path, not the edge case: `"Okay{name}, here we are"` has to become
 * `"Okay, here we are"` and never `"Okay , here we are"` or `"Okay, , here"`.
 * The four replacements below are ordered leading → both-sides → preceding →
 * trailing, because a leading `{name},` and a mid-clause `, {name},` would
 * otherwise both match the same pattern and the leading one would keep a
 * comma it never earned.
 */
export function interpolatePhrase(template: string, honorific: string): string {
  const name = honorific.trim();
  // `{name}` stands for "the honorific, set off from whatever precedes it" —
  // so the templates write `Okay{name},` with no space of their own, and the
  // space is inserted here only when there is a name to set off. Writing the
  // space into the template instead would make the *empty* case (the default)
  // the one that needs cleaning up, and it is the common path.
  if (name.length > 0) {
    return template.replace(/(\S?)\{name\}/g, (_match, before: string) =>
      before.length > 0 ? `${before} ${name}` : name,
    );
  }

  return template
    .replace(/^\s*\{name\}\s*[,:]?\s*/, '')
    .replace(/\s*,\s*\{name\}\s*,\s*/g, ', ')
    .replace(/\s+\{name\}\s*,\s*/g, ', ')
    .replace(/\s*,?\s*\{name\}/g, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** One line in the thread. `spoken` records whether TTS actually read it (Theme F). */
export const CompanionTurnSchema = z.object({
  id: z.string(),
  role: z.enum(['companion', 'user', 'agent']),
  text: z.string(),
  /** Epoch milliseconds. */
  at: z.number(),
  spoken: z.boolean().default(false),
});
export type CompanionTurn = z.infer<typeof CompanionTurnSchema>;

/**
 * How many turns the thread persists. A transcript is the one thing worth
 * keeping across a reload — it is the record of what was asked — and 200 turns
 * of short strings is a few tens of kilobytes, well inside what `localStorage`
 * tolerates beside the other persisted stores.
 */
export const COMPANION_TRANSCRIPT_CAP = 200;

// --- B · the snapshot -------------------------------------------------------

/** Staged / unstaged / untracked path counts, from `status.get`. */
export const CompanionDirtySchema = z.object({
  staged: z.number().int().nonnegative(),
  unstaged: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
});

/** Live pty counts, from the pty registry's own activity guesses. */
export const CompanionSessionsSchema = z.object({
  live: z.number().int().nonnegative(),
  thinking: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
});

/**
 * What the companion knows before it says anything.
 *
 * **Every forge-derived field is nullable, and that is the contract, not a
 * convenience.** `openPulls: null` means "I could not reach GitHub", which the
 * script says out loud and then carries on — a greeting that stalls on a
 * network timeout is worse than a greeting that admits one field is missing.
 * The 3 s cap lives in `main/companion/snapshot.ts`; the nullability lives
 * here so the renderer cannot forget the case exists.
 */
export const CompanionSnapshotSchema = z.object({
  /** The repo the snapshot is about, or null when none is open (or the path did not resolve). */
  repo: RepoDescriptorSchema.nullable(),
  /** How many repositories the app has open — the "shall I switch?" offer needs > 1. */
  repos: z.number().int().nonnegative(),
  /** Short branch name at the requested path, or null on a detached HEAD / no repo. */
  branch: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  dirty: CompanionDirtySchema,
  sessions: CompanionSessionsSchema,
  /** null when the forge could not be reached (or `gh` is not installed). */
  openPulls: z.number().int().nonnegative().nullable(),
  /** null for the same reason. Zero means "checks ran and none failed". */
  failingChecks: z.number().int().nonnegative().nullable(),
  /**
   * The same contract as `failingChecks`, for the conclusion that means "CI
   * passed" (`success`) — added so `describeSnapshot` can say a pass
   * percentage instead of only naming the failures. Null exactly when
   * `failingChecks` is null (the same forge call fills both); zero means
   * "checks ran and none passed".
   */
  passingChecks: z.number().int().nonnegative().nullable(),
});
export type CompanionSnapshot = z.infer<typeof CompanionSnapshotSchema>;

/** The snapshot for "no repo open" — what the handler answers rather than failing. */
export function emptyCompanionSnapshot(repos = 0): CompanionSnapshot {
  return {
    repo: null,
    repos,
    branch: null,
    ahead: 0,
    behind: 0,
    dirty: { staged: 0, unstaged: 0, untracked: 0 },
    sessions: { live: 0, thinking: 0, waiting: 0 },
    openPulls: null,
    failingChecks: null,
    passingChecks: null,
  };
}

// --- B · the digest ---------------------------------------------------------

/**
 * One thing that happened, or is happening.
 *
 * `ref` is whatever identifies it to a human who wants to go and look — a
 * short sha, a `#123`, a phase number. It is never a URL, and it stays that
 * way: `kind` + `ref` is what a local commit, a pull request and a tracker row
 * can all be identified by, and baking `github.com` into that shape would make
 * two of the three lie.
 *
 * **`url` is the separate, optional answer to "and where is its page?"** Added
 * in the Phase 79 follow-up, when the consolidated overview turn
 * ({@link composeOverviewMarkdown}) started rendering titles as hyperlinks.
 * Only the forge knows a canonical page for an item — `main/companion/digest.ts`
 * fills it from the `ForgePull.url` it already had in hand — so a commit and a
 * tracker row simply have none and render as plain text. Optional rather than
 * `nullable()` because "the forge was unreachable" and "this kind has no page"
 * are the same thing to the reader: no link.
 */
export const CompanionDigestItemSchema = z.object({
  kind: z.enum(['commit', 'pr', 'phase']),
  title: z.string(),
  ref: z.string(),
  /** Epoch milliseconds. */
  at: z.number(),
  /** The item's canonical page, when one exists. See the docblock above. */
  url: z.string().optional(),
});
export type CompanionDigestItem = z.infer<typeof CompanionDigestItemSchema>;

export const CompanionDigestSchema = z.object({
  landed: z.array(CompanionDigestItemSchema),
  inProgress: z.array(CompanionDigestItemSchema),
  /** Epoch milliseconds — the start of the window this digest covers. */
  since: z.number(),
});
export type CompanionDigest = z.infer<typeof CompanionDigestSchema>;

/** The window a repo the companion has never greeted gets: seven days. */
export const COMPANION_DEFAULT_DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How many items `summariseDigest` will name before it collapses to a count.
 *
 * Five, because this is read aloud: past five titles a spoken list stops being
 * information and becomes a wait.
 */
export const COMPANION_DIGEST_NAME_CAP = 5;

/** Weekday-and-date phrasing for "since <when>", in the app's own locale. */
function sinceLabel(since: number, now: number): string {
  const elapsed = now - since;
  if (!Number.isFinite(since) || since <= 0 || elapsed < 0) return 'recently';
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) {
    // Inside a week, the weekday is what a person actually remembers.
    return `since ${new Date(since).toLocaleDateString(undefined, { weekday: 'long' })}`;
  }
  if (days < 14) return 'in the last week';
  return `in the last ${Math.floor(days / 7)} weeks`;
}

/**
 * `count` + the right plural of `word`, exported because Theme B's grammar
 * check (`describe('plural')` below) asserts it directly rather than only
 * through a rendered sentence.
 *
 * A naive "always append s" is the "1 fixes" failure mode's other half: it
 * gets count === 1 right but misspells the plural of anything ending in a
 * sibilant (`fix` → `fixs`) or a consonant-`y` (`entry` → `entrys`), both of
 * which Theme B's own category words (`fix`) and `countByKind`'s existing
 * words (`tracker entry`) hit. Two irregular-plural rules cover every word
 * this module passes through it today.
 */
export const plural = (count: number, word: string): string => {
  if (count === 1) return `1 ${word}`;
  if (/[^aeiou]y$/i.test(word)) return `${count} ${word.slice(0, -1)}ies`;
  if (/(?:[sxz]|[cs]h)$/i.test(word)) return `${count} ${word}es`;
  return `${count} ${word}s`;
};

/** Oxford-free "a, b and c" — spoken, not printed, so no serial comma before "and". */
function oxfordJoin(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] as string}`;
}

/**
 * Join titles the way a sentence does — "a, b and c" — with an Oxford-free
 * "and" because this is spoken, not printed.
 */
function joinTitles(items: readonly CompanionDigestItem[]): string {
  const titles = items.map((item) => item.title.trim()).filter((title) => title.length > 0);
  return oxfordJoin(titles);
}

/** "1 commit, 2 pull requests" — counted by source kind, in a fixed order, unjoined. */
function kindParts(items: readonly CompanionDigestItem[]): string[] {
  const order: CompanionDigestItem['kind'][] = ['commit', 'pr', 'phase'];
  const words: Record<CompanionDigestItem['kind'], string> = {
    commit: 'commit',
    pr: 'pull request',
    phase: 'tracker entry',
  };
  return order
    .map((kind) => ({ kind, count: items.filter((item) => item.kind === kind).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => plural(entry.count, words[entry.kind]));
}

/** "three commits, two PRs and one phase" — counted by kind, in a fixed order. */
function countByKind(items: readonly CompanionDigestItem[]): string {
  return oxfordJoin(kindParts(items));
}

// --- B.1 · Theme B's category layer, sitting above countByKind -------------
//
// Decision 3 (phase-80): this layer is *additive* — `countByKind`'s
// commit/pr/phase source-kind grouping is unchanged and still drives the
// "in progress" section — so the "landed" section can say "4 dependency
// updates, 3 fixes" instead of "7 commits" without touching anything that
// isn't a landed, conventional-commit-shaped title.

/** One of the buckets Theme B singles out; everything else falls back to `kindParts`. */
type DigestCategoryLabel = 'dependency update' | 'fix' | 'feature';

/** Reading order: dependency bumps first (the noisiest), then fixes, then features. */
const DIGEST_CATEGORIES: readonly DigestCategoryLabel[] = ['dependency update', 'fix', 'feature'];

/**
 * Bucket a landed item by conventional-commit type, reusing
 * {@link parseConventionalCommit} rather than a second commit-message parser
 * (Finding 2 / Decision 3). `null` for anything that doesn't parse as a
 * conventional-commit subject, or parses as a type this phase doesn't single
 * out — those fall back to `countByKind`'s source-kind grouping instead of
 * silently disappearing.
 */
function digestCategoryFor(item: CompanionDigestItem): DigestCategoryLabel | null {
  const parsed = parseConventionalCommit(item.title);
  if (parsed === null) return null;
  if (parsed.type === 'chore' && parsed.scope === 'deps') return 'dependency update';
  if (parsed.type === 'fix') return 'fix';
  if (parsed.type === 'feat') return 'feature';
  return null;
}

function groupByCategory(
  items: readonly CompanionDigestItem[],
): Array<{ category: DigestCategoryLabel; items: CompanionDigestItem[] }> {
  return DIGEST_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => digestCategoryFor(item) === category),
  })).filter((group) => group.items.length > 0);
}

/**
 * "4 dependency updates, 3 fixes and 2 commits" — category words for whatever
 * categorises, `kindParts` for whatever doesn't, one Oxford-free join.
 * Identical to `countByKind(items)` when nothing categorises, which is what
 * keeps every pre-Theme-B digest fixture unchanged.
 */
function countByCategory(items: readonly CompanionDigestItem[]): string {
  const groups = groupByCategory(items);
  if (groups.length === 0) return countByKind(items);
  const categorised = new Set(groups.flatMap((group) => group.items));
  const leftover = items.filter((item) => !categorised.has(item));
  return oxfordJoin([
    ...groups.map((group) => plural(group.items.length, group.category)),
    ...kindParts(leftover),
  ]);
}

/**
 * "updating `x`" or "updating `x` in `y`" — one bucket's representative
 * specific. `y` is the commit's own `scope`, except for the `dependency
 * update` bucket, whose scope (`deps`) is already spent naming the bucket
 * (Decision, phase-80 Theme B acceptance).
 */
function representDigestItem(item: CompanionDigestItem, category: DigestCategoryLabel): string {
  const parsed = parseConventionalCommit(item.title);
  const detail = (parsed?.description || item.title).trim();
  const scope = parsed?.scope ?? null;
  if (category !== 'dependency update' && scope) return `updating ${detail} in ${scope}`;
  return `updating ${detail}`;
}

/**
 * Up to two representative specifics, one per leading category bucket —
 * "name one or two representative specifics, drop the rest" is this phase's
 * own brief. Empty when nothing categorised, which is what keeps an
 * uncategorised over-cap digest from naming anything (unchanged behaviour).
 */
function representativeDetail(items: readonly CompanionDigestItem[]): string {
  const picks = groupByCategory(items)
    .slice(0, 2)
    .map((group) => representDigestItem(group.items[0] as CompanionDigestItem, group.category));
  return oxfordJoin(picks);
}

// --- B.2 · template variety ---------------------------------------------

/** `pickPhrase`-style connectives a representative clause can be introduced with. */
const DIGEST_CONNECTIVES = ['including', 'among them', 'notably'] as const;

function withConnective(connective: string, detail: string): string {
  return connective === 'including' ? `including ${detail}` : `${connective}, ${detail}`;
}

type DigestSentenceParts = { when: string; count: string; detail: string };

/**
 * 4 interchangeable shapes for the "landed" line. Every one leads with `when`
 * verbatim — `summariseDigest`'s own weekday-phrasing test relies on the
 * first word being "Since" regardless of which template the rng picks — and
 * every one drops its connective clause outright rather than leaving one
 * dangling when `detail` is empty (the over-cap, nothing-categorised case).
 */
const LANDED_TEMPLATES: ReadonlyArray<(p: DigestSentenceParts, connective: string) => string> = [
  ({ when, count, detail }, connective) =>
    `${when}, ${count} landed${detail ? ` — ${withConnective(connective, detail)}` : ''}.`,
  ({ when, count, detail }, connective) =>
    `${when}, there have been ${count}${detail ? `, ${withConnective(connective, detail)}` : ''}.`,
  ({ when, count, detail }, connective) =>
    `${when}, ${count} came in${detail ? `, ${withConnective(connective, detail)}` : ''}.`,
  ({ when, count, detail }, connective) =>
    `${when}, that is ${count}${detail ? ` — ${withConnective(connective, detail)}` : ''}.`,
];

/** Same shape for the "in progress" line. No category layer here (Decision 3) — still varied. */
const IN_PROGRESS_TEMPLATES: ReadonlyArray<(p: DigestSentenceParts, connective: string) => string> = [
  ({ count, detail }, connective) =>
    `Still in flight: ${count}${detail ? `, ${withConnective(connective, detail)}` : ''}.`,
  ({ count, detail }, connective) =>
    `${count} still in flight${detail ? ` — ${withConnective(connective, detail)}` : ''}.`,
  ({ count, detail }, connective) =>
    `There are ${count} in flight right now${detail ? `, ${withConnective(connective, detail)}` : ''}.`,
  ({ count, detail }, connective) =>
    `${count} remain in flight${detail ? `, ${withConnective(connective, detail)}` : ''}.`,
];

/** `Math.floor(rng() * n)`, clamped — shared by `pickPhrase` and Theme B's own template/connective picks. */
function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
}

/**
 * Turn a digest into 2–5 spoken sentences.
 *
 * Pure, and separate from the handler that builds the digest, for the reason
 * the whole module exists: this is the text a human hears, so it is the thing
 * most worth having fixture tests over — and neither process should own a
 * private copy of the wording.
 *
 * Shape: one sentence for what landed, one for what is still open, and a
 * closing sentence only when there is genuinely nothing to report. Titles are
 * named up to {@link COMPANION_DIGEST_NAME_CAP} and collapse to counts past
 * it, because past five a spoken list is a wait rather than a summary — and,
 * past that cap, the landed line still names one or two representative
 * specifics from whatever categorised (Theme B), rather than naming nothing.
 *
 * `rng` is injected (defaulting to `Math.random`), following the exact
 * pattern `pickPhrase` and `ConciergeDeps.rng` already use, so which of the
 * 4-6 interchangeable templates and connectives gets picked is deterministic
 * under test.
 */
export function summariseDigest(
  digest: CompanionDigest,
  now = Date.now(),
  rng: () => number = Math.random,
): string[] {
  const when = sinceLabel(digest.since, now);
  const lines: string[] = [];

  if (digest.landed.length === 0) {
    lines.push(`Nothing has landed ${when}.`);
  } else {
    const count = countByCategory(digest.landed);
    const detail =
      digest.landed.length <= COMPANION_DIGEST_NAME_CAP
        ? joinTitles(digest.landed)
        : representativeDetail(digest.landed);
    const template = LANDED_TEMPLATES[pickIndex(rng, LANDED_TEMPLATES.length)] as (
      p: DigestSentenceParts,
      connective: string,
    ) => string;
    const connective = DIGEST_CONNECTIVES[pickIndex(rng, DIGEST_CONNECTIVES.length)] as string;
    lines.push(template({ when: capitalise(when), count, detail }, connective));
  }

  if (digest.inProgress.length === 0) {
    lines.push('Nothing is open right now.');
  } else {
    const count = countByKind(digest.inProgress);
    const detail =
      digest.inProgress.length <= COMPANION_DIGEST_NAME_CAP ? joinTitles(digest.inProgress) : '';
    const template = IN_PROGRESS_TEMPLATES[pickIndex(rng, IN_PROGRESS_TEMPLATES.length)] as (
      p: DigestSentenceParts,
      connective: string,
    ) => string;
    const connective = DIGEST_CONNECTIVES[pickIndex(rng, DIGEST_CONNECTIVES.length)] as string;
    lines.push(template({ when: capitalise(when), count, detail }, connective));
  }

  if (digest.landed.length === 0 && digest.inProgress.length === 0) {
    lines.push('A clean slate, then.');
  }

  return lines;
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}

// --- Ad Hoc · grouped spoken digest (companion speech overhaul) ------------
//
// The spoken digest used to read each bullet's raw title one at a time,
// filling every commit SHA with "(a commit)" — accurate, but also every
// commit's own subject line read verbatim, which is a wall of prose no voice
// should attempt. This groups by conventional-commit `type(scope)` instead —
// "Feature - (agent): support X and extend Y" rather than two whole subjects
// — reusing `parseConventionalCommit` exactly as `digestCategoryFor` already
// does, so a title that doesn't parse (or parses to a type this repo's
// commits don't standardise on) falls back to being read individually,
// exactly as before.

/** Spoken label for a conventional-commit `type` — the vocabulary this repo's own commits use. */
const DIGEST_TYPE_WORDS: Record<string, string> = {
  feat: 'Feature',
  fix: 'Fix',
  docs: 'Docs',
  chore: 'Chore',
  refactor: 'Refactor',
  test: 'Test',
  perf: 'Perf',
  build: 'Build',
  ci: 'CI',
  style: 'Style',
  revert: 'Revert',
};

/** `deps` reads as "Dependencies"; every other scope is spoken exactly as written. */
function digestScopeWord(scope: string): string {
  return scope === 'deps' ? 'Dependencies' : scope;
}

/**
 * "Feature - (agent):" / "Chore - Dependencies:" / "Fix:" — the header a
 * group of same-`type`-same-`scope` items is announced under, once.
 *
 * `deps` is the one scope spoken without parentheses — its word already
 * stands in for the scope the way "Dependencies" doesn't need "(deps)" beside
 * it, while every other scope keeps the parenthesised form so "Feature -
 * (agent):" still reads as "the agent feature", not two disconnected nouns.
 */
function digestGroupHeader(type: string, scope: string | null): string {
  const label = DIGEST_TYPE_WORDS[type] ?? capitalise(type);
  if (scope === null) return `${label}:`;
  return scope === 'deps' ? `${label} - ${digestScopeWord(scope)}:` : `${label} - (${scope}):`;
}

/** Strip the inline markup a raw title/description might carry, with no terminator added — this is a fragment, not a whole sentence. */
function stripInlineMarkupFragment(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_[\]<>])/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/`+/g, '')
    .trim();
}

/** `#372` → `372`, or `null` when `ref` isn't that shape. */
function prNumber(ref: string): string | null {
  const match = /^#(\d+)$/.exec(ref.trim());
  return match ? (match[1] as string) : null;
}

/**
 * "in PR 372" for a `kind: 'pr'` item, empty for everything else.
 *
 * A commit's own short SHA is never spoken here (Ad Hoc: "don't say 'a
 * commit' once the group already said so") — the group header already named
 * what kind of change it is, so a hex string adds nothing a listener can act
 * on. A phase/tracker ref has no natural spoken form of its own either, so it
 * is left unspoken rather than mangled.
 */
function digestItemRefPhrase(item: CompanionDigestItem): string {
  if (item.kind !== 'pr') return '';
  const number = prNumber(item.ref);
  return number === null ? '' : ` in PR ${number}`;
}

/**
 * One digest section (`digest.landed` or `digest.inProgress`), as the spoken
 * sentences {@link composeOverviewSpeech} reads for it.
 *
 * Every item that parses as a *recognised* conventional-commit type
 * (`parseConventionalCommit` + {@link DIGEST_TYPE_WORDS}) joins a group keyed
 * by its `type`+`scope`, announced once as a header with every member's
 * description oxford-joined after it. Everything else — an unparseable
 * title, or a type this repo doesn't standardise on — is read individually,
 * exactly as the old pipeline read every item: its own raw title, one
 * sentence, still with a PR ref spoken naturally rather than dropped.
 *
 * Order is first-appearance: a group's header sits where its first member
 * would have sat, and every later member of the same group joins that
 * sentence rather than opening a new slot.
 */
export function groupedDigestSpeech(items: readonly CompanionDigestItem[]): string[] {
  type Slot =
    | { kind: 'group'; type: string; scope: string | null; parts: string[] }
    | { kind: 'raw'; text: string };
  const slots: Slot[] = [];

  for (const item of items) {
    const parsed = parseConventionalCommit(item.title);
    if (parsed === null || !parsed.known) {
      const title = stripInlineMarkupFragment(item.title);
      if (title === '') continue;
      slots.push({ kind: 'raw', text: `${title}${digestItemRefPhrase(item)}.` });
      continue;
    }

    const description = stripInlineMarkupFragment(parsed.description) || item.title.trim();
    const part = `${description}${digestItemRefPhrase(item)}`;
    const group = slots.find(
      (slot): slot is Extract<Slot, { kind: 'group' }> =>
        slot.kind === 'group' && slot.type === parsed.type && slot.scope === parsed.scope,
    );
    if (group) group.parts.push(part);
    else slots.push({ kind: 'group', type: parsed.type, scope: parsed.scope, parts: [part] });
  }

  return slots.map((slot) =>
    slot.kind === 'raw'
      ? slot.text
      : `${digestGroupHeader(slot.type, slot.scope)} ${oxfordJoin(slot.parts)}.`,
  );
}

// --- Ad Hoc · the intro digest's own spoken rendering -----------------------
//
// `composeOverviewSpeech` used to read the digest through `groupedDigestSpeech`
// — a group per conventional-commit `type(scope)`, every member's own
// description read out and a bare PR number spoken aloud ("in PR 372"). That
// is closer to "a list read aloud" than "a colleague's quick catch-up", and
// this repo's own commit/tracker titles carry exactly the noise a voice
// should never repeat: `(WIP)`, `[M · half a day]`-style effort tags and
// `(#123)` PR refs are literal substrings of a real title here (see
// `git log`'s own recent subjects). `toSpokenDigest` replaces that half of
// the pipeline for the greeting/intro path: it names a `Phase N` once per
// phase with its theme letters oxford-joined ("Phase 96, themes A, B and C
// landed") rather than one sentence per item, and it never interpolates a
// raw title into its output at all — the phase/theme pair is *extracted*
// from the title, everything else about the title is simply not spoken. That
// is what makes the WIP/tag/PR-number/markdown/URL stripping unconditional
// rather than a second regex pass to keep in sync with the first.
//
// `composeOverviewMarkdown` (the thread's own turn) is untouched by any of
// this — it still renders every item via `digestItemMarkdown`, byte for byte
// as before. Two independent projections of the same `CompanionDigest`, same
// as `composeOverviewMarkdown`/`composeOverviewSpeech` already are.

/** `Phase 96 Themes B, A` / `Phase 82 Theme C` / `Phase 96 C, H —` → the phase number and its theme letters, deduped and sorted A→Z. `themes` is empty when a phase is named with no theme letters attached, `null` when no phase is named at all. */
function parsePhaseThemes(title: string): { phase: string; themes: string[] } | null {
  const withWord = /Phase\s+(\d+)(?:[,:]?\s+Themes?\s+([A-Za-z](?:\s*,\s*[A-Za-z])*))/.exec(title);
  if (withWord) {
    return { phase: withWord[1] as string, themes: dedupedThemeLetters(withWord[2] as string) };
  }
  // `_INDEX.md`'s own WIP rows carry the theme letters with no "Theme(s)" word
  // at all ("Phase 96 C, H — <title>") — the dash anchors the match so a
  // title's own capitalised first word can never be mistaken for one.
  const noWord = /Phase\s+(\d+)\s+([A-Za-z](?:\s*,\s*[A-Za-z])*)\s*[—–-]/.exec(title);
  if (noWord) {
    return { phase: noWord[1] as string, themes: dedupedThemeLetters(noWord[2] as string) };
  }
  const bare = /Phase\s+(\d+)\b/.exec(title);
  return bare ? { phase: bare[1] as string, themes: [] } : null;
}

function dedupedThemeLetters(raw: string): string[] {
  const letters = raw
    .split(',')
    .map((letter) => letter.trim().toUpperCase())
    .filter((letter) => /^[A-Z]$/.test(letter));
  return Array.from(new Set(letters)).sort();
}

/** "Phase 96, themes A, B and C" / "Phase 82, theme C" / "Phase 86" — no trailing punctuation, one caller joins several of these into a sentence. */
function phaseGroupPhrase(group: { phase: string; themes: ReadonlySet<string> }): string {
  const themes = Array.from(group.themes).sort();
  if (themes.length === 0) return `Phase ${group.phase}`;
  const word = themes.length === 1 ? 'theme' : 'themes';
  return `Phase ${group.phase}, ${word} ${oxfordJoin(themes)}`;
}

/**
 * Every item that names a phase, folded into one group per phase number
 * (themes unioned across every item that named that phase) — a commit, its
 * merged PR and a `done.md` entry for the same phase collapse to one group.
 * Items that name no phase at all are counted, never named.
 */
function groupByPhase(items: readonly CompanionDigestItem[]): {
  groups: Array<{ phase: string; themes: ReadonlySet<string> }>;
  otherCount: number;
} {
  const order: string[] = [];
  const byPhase = new Map<string, Set<string>>();
  let otherCount = 0;
  for (const item of items) {
    const parsed = parsePhaseThemes(item.title);
    if (parsed === null) {
      otherCount += 1;
      continue;
    }
    let themes = byPhase.get(parsed.phase);
    if (!themes) {
      themes = new Set();
      byPhase.set(parsed.phase, themes);
      order.push(parsed.phase);
    }
    for (const letter of parsed.themes) themes.add(letter);
  }
  return { groups: order.map((phase) => ({ phase, themes: byPhase.get(phase) as Set<string> })), otherCount };
}

/**
 * The landed half of {@link toSpokenDigest} — one sentence naming every
 * phase group, oxford-joined, plus a trailing count for whatever named no
 * phase. Never names an item individually: a title is either phase-shaped
 * (and only its phase/theme is spoken) or it is one of the count.
 */
function landedSpoken(items: readonly CompanionDigestItem[]): string {
  if (items.length === 0) return 'Nothing landed.';
  const { groups, otherCount } = groupByPhase(items);
  if (groups.length === 0) return `${plural(otherCount, 'change')} landed.`;
  const main = `${oxfordJoin(groups.map(phaseGroupPhrase))} landed.`;
  return otherCount === 0 ? main : `${main} Plus ${plural(otherCount, 'other change')}.`;
}

/**
 * The in-progress half — counts only, per the greeting/intro brief: a list of
 * what is still open is a wait, not a summary. Distinct phases are counted
 * (an open PR, its branch and its `_INDEX.md` WIP row for the same phase are
 * one phase in flight, not three), and named "phases" only when every item in
 * flight names one; a mixed or phase-less set is counted as generic "things"
 * rather than mislabelling something that is not a phase as one.
 */
function inProgressSpoken(items: readonly CompanionDigestItem[]): string {
  if (items.length === 0) return 'Nothing is in progress right now.';
  const phases = new Set<string>();
  let unparsed = 0;
  for (const item of items) {
    const parsed = parsePhaseThemes(item.title);
    if (parsed === null) unparsed += 1;
    else phases.add(parsed.phase);
  }
  // Every item parsed a phase — even two items sharing one (an open PR and
  // its own `_INDEX.md` row) still count as one phase in flight, not two.
  const allPhases = unparsed === 0;
  const count = allPhases ? phases.size : items.length;
  const verb = count === 1 ? 'is' : 'are';
  return `${plural(count, allPhases ? 'phase' : 'thing')} ${verb} in progress.`;
}

/**
 * A small, fixed set of openers for the spoken digest — Ad Hoc: "a tiny bit
 * of personality... nothing cheesy, no more than one quip per summary". One
 * is picked per call (`rng`, injected exactly as {@link summariseDigest}'s
 * is, for a deterministic test) and it is the summary's *only* aside — the
 * rest of the output is facts. `{name}` resolves through
 * {@link interpolatePhrase} exactly as every other phrase-bank line does, so
 * a configured honorific (Phase 80) is respected here too.
 */
const DIGEST_OPENERS = [
  'Quick catch-up{name}.',
  'Here is where things stand{name}.',
  'Fast rundown{name}.',
  'Catching you up{name}.',
] as const;

export type SpokenDigestOptions = {
  now?: number;
  rng?: () => number;
  /** A resolved honorific (e.g. from {@link pickHonorific}) — `''`, the default, says nothing extra. */
  honorific?: string;
};

/**
 * The intro/greeting digest, rendered for a voice rather than a screen —
 * succinct, consolidated by phase and theme, counts only for what is still
 * open, and never a title's raw text. Pure and deterministic given `rng`.
 *
 * `composeOverviewMarkdown`'s own rendering of the same {@link CompanionDigest}
 * is untouched by this — see the section docblock above.
 */
export function toSpokenDigest(digest: CompanionDigest, options: SpokenDigestOptions = {}): string {
  const { rng = Math.random, honorific = '' } = options;
  const opener = interpolatePhrase(
    DIGEST_OPENERS[pickIndex(rng, DIGEST_OPENERS.length)] as string,
    honorific,
  );

  if (digest.landed.length === 0 && digest.inProgress.length === 0) {
    return `${opener} Nothing has landed, and nothing is in progress right now.`;
  }

  return `${opener} ${landedSpoken(digest.landed)} ${inProgressSpoken(digest.inProgress)}`;
}

// --- B · pure grounding helpers --------------------------------------------

/**
 * Which branch counts as "the default one" for a digest.
 *
 * There is no `defaultBranch` anywhere in this repo — no git-engine helper, no
 * registry field — and asking the remote for `origin/HEAD` is a subprocess
 * this phase's "compose the MCP tools, do not parse git yourself" guardrail
 * rules out. So it is inferred from the refs `branch.list` already returned,
 * remote-first (a remote `main` outranks a stale local one) and by the
 * conventional-name preference below. `null` when nothing recognisable exists,
 * which the digest treats as "no default branch to compare against" rather
 * than guessing at the first branch it saw.
 */
export const DEFAULT_BRANCH_PREFERENCE = ['main', 'master', 'trunk', 'develop'] as const;

export function resolveDefaultBranch(refs: readonly Ref[]): string | null {
  const remotes = refs.filter((ref) => ref.kind === 'remoteBranch');
  const locals = refs.filter((ref) => ref.kind === 'localBranch');

  for (const name of DEFAULT_BRANCH_PREFERENCE) {
    if (remotes.some((ref) => ref.name.endsWith(`/${name}`))) return name;
  }
  for (const name of DEFAULT_BRANCH_PREFERENCE) {
    if (locals.some((ref) => ref.name === name)) return name;
  }
  return null;
}

/** One `## YYYY-MM-DD — title` heading from `.midnite/tasks/done.md`. */
export type DoneEntry = { date: string; title: string; at: number };

/**
 * Parse `done.md`'s entry headings.
 *
 * The tracker's own format, stated once: newest first, one `## <ISO date> —
 * <title>` per landed slice. Nothing else in the file is structured, so
 * nothing else is read — the body is prose, and a digest that tried to
 * summarise prose would be the inference path this phase does not have.
 *
 * Both an em dash and a plain hyphen are accepted as the separator: the file
 * is hand-written, and one entry with the wrong dash should not silently
 * vanish from a digest.
 */
export function parseDoneEntries(markdown: string): DoneEntry[] {
  const entries: DoneEntry[] = [];
  const pattern = /^##\s+(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.+?)\s*$/gm;
  for (const match of markdown.matchAll(pattern)) {
    const date = match[1] as string;
    const title = match[2] as string;
    const at = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(at)) continue;
    entries.push({ date, title, at });
  }
  return entries;
}

/** One `🔄 WIP` row of `.midnite/tasks/_INDEX.md`'s phases table. */
export type IndexWipRow = { phase: string; title: string; themes: string[] };

/**
 * Parse the WIP rows out of `_INDEX.md`'s phases table.
 *
 * The table's shape is fixed by `CLAUDE.md` and by the tracker's own header
 * comment: `| [<n> · <title>](<path>) | <status> | <refined> | <done> |
 * <bar> | <pct> | <wip themes> | <todo themes> |`. Only the status column and
 * the WIP-themes column are read, and a row whose status is not `🔄 WIP` is
 * skipped — "in progress" in this app's own tracker means exactly that mark.
 *
 * A malformed or reordered row yields nothing rather than a wrong answer: the
 * digest is spoken aloud, and a mis-parsed theme letter is a sentence that is
 * confidently false.
 */
export function parseIndexWipRows(markdown: string): IndexWipRow[] {
  const rows: IndexWipRow[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 7) continue;

    const label = /^\[\s*(\d+)\s*·\s*(.+?)\s*\]\(/.exec(cells[0] as string);
    if (!label) continue;
    if (!(cells[1] as string).includes('WIP')) continue;

    const themeCell = cells[6] as string;
    const themes =
      themeCell === '—' || themeCell === '' ? [] : themeCell.split(/\s+/).filter(Boolean);
    rows.push({ phase: label[1] as string, title: label[2] as string, themes });
  }
  return rows;
}

// --- F · text-to-speech chunking -------------------------------------------

/**
 * The longest utterance `speaker.ts` hands `speechSynthesis` in one go.
 *
 * Not a style preference — a workaround for a Chromium bug the phase doc names
 * explicitly: a single long utterance goes silent after roughly fifteen
 * seconds, `onend` never fires, and the queue behind it stalls forever. Two
 * hundred characters is comfortably under that at every speaking rate the
 * voice picker can produce, and it also gives the word-boundary pulse
 * (`--companion-level`) a natural reset between chunks.
 *
 * The number lives here rather than in the renderer because
 * {@link chunkForSpeech} is the pure half of that workaround and is what the
 * tests assert against.
 *
 * **Not a duplicate of {@link splitForSpeech}, and they compose.** That one is
 * Theme E's *content* cap: about sixty seconds of speech, after which the tail
 * is dropped for "and more in the thread", applied by the flow before anything
 * is spoken. This one is Theme F's *mechanical* cap, applied inside the speaker
 * to each utterance the flow already handed it. One decides how much to say;
 * the other decides how to get it past Chromium.
 */
export const COMPANION_TTS_CHUNK_CHARS = 200;

/**
 * Split one sentence-ending run off the front, terminator included.
 *
 * Deliberately naive about abbreviations ("e.g.", "Mr."): over-splitting costs
 * one extra `speak()` call and an inaudible seam, while under-splitting costs
 * the fifteen-second silence this whole function exists to avoid. The phrase
 * banks and the digest summariser are the only writers, and neither emits an
 * abbreviation today.
 */
function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
}

/**
 * Break a fragment that is still over the limit, clauses first, then words.
 *
 * Three tiers because each one degrades the listen less than the next: a
 * clause boundary is a place a human pauses anyway; a word boundary is
 * audible but harmless; and slicing mid-word is only ever reached by a single
 * token longer than the whole limit (a pasted URL, a 200-character path),
 * where any answer is bad and a dropped chunk would be worse.
 */
function hardSplit(fragment: string, limit: number): string[] {
  const text = fragment.trim();
  if (text.length === 0) return [];
  if (text.length <= limit) return [text];

  const clauses = text.match(/[^,;:]+[,;:]+|[^,;:]+$/g) ?? [text];
  const out: string[] = [];
  let current = '';

  const push = (piece: string): void => {
    if (current.length === 0) current = piece;
    else if (current.length + 1 + piece.length <= limit) current = `${current} ${piece}`;
    else {
      out.push(current);
      current = piece;
    }
  };

  for (const rawClause of clauses) {
    const clause = rawClause.trim();
    if (clause.length === 0) continue;
    if (clause.length <= limit) {
      push(clause);
      continue;
    }
    for (const word of clause.split(' ')) {
      if (word.length <= limit) {
        push(word);
        continue;
      }
      // One token longer than the limit. Flush whatever is buffered and slice
      // it, so the utterance is merely ugly rather than missing.
      if (current.length > 0) {
        out.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += limit) {
        out.push(word.slice(index, index + limit));
      }
    }
  }

  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Break text into utterances small enough for `speechSynthesis` to finish.
 *
 * Whitespace is normalised first: the thread's text arrives with newlines from
 * `summariseDigest`'s line array and from a read-back, and a newline inside an
 * utterance is a pause of unpredictable length in some voices.
 *
 * Chunks are *packed*, not one-per-sentence — two short sentences that fit
 * together are spoken together, because a seam between utterances is audible
 * and there is no reason to add one the limit does not demand.
 */
export function chunkForSpeech(text: string, limit = COMPANION_TTS_CHUNK_CHARS): string[] {
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (normalised.length === 0) return [];
  const cap = Math.max(1, Math.floor(limit));
  if (normalised.length <= cap) return [normalised];

  const chunks: string[] = [];
  let current = '';
  for (const sentence of splitSentences(normalised)) {
    for (const piece of hardSplit(sentence, cap)) {
      if (current.length === 0) current = piece;
      else if (current.length + 1 + piece.length <= cap) current = `${current} ${piece}`;
      else {
        chunks.push(current);
        current = piece;
      }
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// --- Ad Hoc · the local voice engine's voice catalog ------------------------

/**
 * Every voice Kokoro-82M ships, mirrored here as data.
 *
 * `kokoro-js` (`desktop/src/main/companion/tts.ts`) exports the model's
 * `VOICES` map only off an *instantiated* `KokoroTTS`, reached through
 * `from_pretrained()` — which downloads the model. A Settings picker cannot
 * be made to trigger an ~88 MB download just to list its own options, so the
 * catalog is copied here instead, verbatim from `kokoro-js@1.2.1`'s bundled
 * `dist/kokoro.cjs` (id → `{name, language, gender, grade}`), and used by
 * both processes: main validates a requested id against it before passing
 * the id to `generate()`, and the renderer renders it with no round trip.
 * All English (`en-us`/`en-gb`) — Kokoro-82M ships no other language — so,
 * unlike the `speechSynthesis` picker below, there is no locale filter to
 * offer.
 *
 * `grade` is Kokoro's own `overallGrade` (`af_heart`'s own module doc in
 * `tts.ts` explains why that voice is the default): a training-quality
 * letter grade, not a subjective rating this repo assigns.
 */
export const COMPANION_LOCAL_VOICE_IDS = [
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_emma',
  'bf_isabella',
  'bm_george',
  'bm_lewis',
  'bf_alice',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
] as const;
export type CompanionLocalVoiceId = (typeof COMPANION_LOCAL_VOICE_IDS)[number];

/** Validated at the IPC boundary (`schemas.ts`'s `CompanionTtsSynthesizeRequest`). */
export const CompanionLocalVoiceIdSchema = z.enum(COMPANION_LOCAL_VOICE_IDS);

export type CompanionLocalVoiceInfo = {
  id: CompanionLocalVoiceId;
  name: string;
  language: 'en-us' | 'en-gb';
  gender: 'Female' | 'Male';
  grade: string;
  /**
   * What a person says to pick this voice (Phase 109 Theme A): its name, and
   * its name with the accent in front ("British Emma"), the two ways anyone
   * reading the Settings list out loud would name it. {@link matchVoice}
   * matches a transcript against these, fuzzily, so whisper-tiny's "bela"
   * still lands on Bella.
   */
  spoken: readonly string[];
};

/** The accent word a person says for a Kokoro language tag. */
const LOCAL_VOICE_ACCENT: Record<CompanionLocalVoiceInfo['language'], string> = {
  'en-us': 'American',
  'en-gb': 'British',
};

/** Fills in `spoken` from the name and accent each row already carries, so the two can't drift. */
function withSpokenAliases(
  voices: readonly Omit<CompanionLocalVoiceInfo, 'spoken'>[],
): readonly CompanionLocalVoiceInfo[] {
  return voices.map((voice) => ({
    ...voice,
    spoken: [voice.name, `${LOCAL_VOICE_ACCENT[voice.language]} ${voice.name}`],
  }));
}

export const COMPANION_LOCAL_VOICES: readonly CompanionLocalVoiceInfo[] = withSpokenAliases([
  { id: 'af_heart', name: 'Heart', language: 'en-us', gender: 'Female', grade: 'A' },
  { id: 'af_alloy', name: 'Alloy', language: 'en-us', gender: 'Female', grade: 'C' },
  { id: 'af_aoede', name: 'Aoede', language: 'en-us', gender: 'Female', grade: 'C+' },
  { id: 'af_bella', name: 'Bella', language: 'en-us', gender: 'Female', grade: 'A-' },
  { id: 'af_jessica', name: 'Jessica', language: 'en-us', gender: 'Female', grade: 'D' },
  { id: 'af_kore', name: 'Kore', language: 'en-us', gender: 'Female', grade: 'C+' },
  { id: 'af_nicole', name: 'Nicole', language: 'en-us', gender: 'Female', grade: 'B-' },
  { id: 'af_nova', name: 'Nova', language: 'en-us', gender: 'Female', grade: 'C' },
  { id: 'af_river', name: 'River', language: 'en-us', gender: 'Female', grade: 'D' },
  { id: 'af_sarah', name: 'Sarah', language: 'en-us', gender: 'Female', grade: 'C+' },
  { id: 'af_sky', name: 'Sky', language: 'en-us', gender: 'Female', grade: 'C-' },
  { id: 'am_adam', name: 'Adam', language: 'en-us', gender: 'Male', grade: 'F+' },
  { id: 'am_echo', name: 'Echo', language: 'en-us', gender: 'Male', grade: 'D' },
  { id: 'am_eric', name: 'Eric', language: 'en-us', gender: 'Male', grade: 'D' },
  { id: 'am_fenrir', name: 'Fenrir', language: 'en-us', gender: 'Male', grade: 'C+' },
  { id: 'am_liam', name: 'Liam', language: 'en-us', gender: 'Male', grade: 'D' },
  { id: 'am_michael', name: 'Michael', language: 'en-us', gender: 'Male', grade: 'C+' },
  { id: 'am_onyx', name: 'Onyx', language: 'en-us', gender: 'Male', grade: 'D' },
  { id: 'am_puck', name: 'Puck', language: 'en-us', gender: 'Male', grade: 'C+' },
  { id: 'am_santa', name: 'Santa', language: 'en-us', gender: 'Male', grade: 'D-' },
  { id: 'bf_emma', name: 'Emma', language: 'en-gb', gender: 'Female', grade: 'B-' },
  { id: 'bf_isabella', name: 'Isabella', language: 'en-gb', gender: 'Female', grade: 'C' },
  { id: 'bm_george', name: 'George', language: 'en-gb', gender: 'Male', grade: 'C' },
  { id: 'bm_lewis', name: 'Lewis', language: 'en-gb', gender: 'Male', grade: 'D+' },
  { id: 'bf_alice', name: 'Alice', language: 'en-gb', gender: 'Female', grade: 'D' },
  { id: 'bf_lily', name: 'Lily', language: 'en-gb', gender: 'Female', grade: 'D' },
  { id: 'bm_daniel', name: 'Daniel', language: 'en-gb', gender: 'Male', grade: 'D' },
  { id: 'bm_fable', name: 'Fable', language: 'en-gb', gender: 'Male', grade: 'C' },
]);

/** `af_heart` — see its own module doc in `tts.ts` for why it is the default. */
export const COMPANION_LOCAL_VOICE_DEFAULT: CompanionLocalVoiceId = 'af_heart';

/** A requested id, narrowed to a known one — `deps.getLocalVoice()`'s stored value can predate a catalog change. */
export function isCompanionLocalVoiceId(value: string | null): value is CompanionLocalVoiceId {
  return value !== null && (COMPANION_LOCAL_VOICE_IDS as readonly string[]).includes(value);
}

/**
 * Which voice engine a per-engine selection applies to — `speaker.ts`'s own
 * `'local' | 'system'` split (`CompanionTtsSpeaker['activeEngine']`,
 * `tts.ts`'s `CompanionTtsStatusValue['engine']`), named here once so
 * `companionVoices` (`ui-store.ts`) has one canonical shape to persist.
 */
export const COMPANION_VOICE_ENGINES = ['system', 'local'] as const;
export type CompanionVoiceEngine = (typeof COMPANION_VOICE_ENGINES)[number];

/**
 * A voice choice per engine, replacing the single `companionVoice` string
 * (Ad Hoc: every voice mode gets its own memory, so switching engines never
 * silently drops back to a default). `null` for either engine means "let
 * that engine pick its own default" — the platform default `speechSynthesis`
 * voice, or `COMPANION_LOCAL_VOICE_DEFAULT` for the local engine.
 */
export type CompanionVoiceSelection = Record<CompanionVoiceEngine, string | null>;

// --- F · the speech-to-text provider seam ----------------------------------

/**
 * Which recogniser transcribes an utterance.
 *
 * **`whisper-local` is the default and needs no key at all** (Ad Hoc: "the
 * microphone must work with no API key"). It runs `sherpa-onnx-node`'s
 * offline `OfflineRecognizer` against a quantized `whisper-tiny.en`, entirely
 * on this machine — the same native module and the same "lazy require,
 * download once into `userData`, degrade rather than crash" shape
 * `companion/tts.ts` already proved out for speech *out*
 * (`main/companion/stt/sherpa-local.ts`). It is still Whisper — the model
 * architecture the OpenAI provider also wraps — so the two ids differ only in
 * *where* the model runs, not in what kind of model it is.
 *
 * `openai-whisper` ships second, as the opt-in cloud alternative for whoever
 * wants OpenAI's larger hosted model and already has a key: `/v1/audio/transcriptions`
 * accepts the `audio/webm;codecs=opus` blob `MediaRecorder` produces, as one
 * multipart request per utterance, with no streaming protocol to implement —
 * the recorder is push-to-talk, so there is nothing for a streaming API to buy.
 *
 * `deepgram` is in the union with no implementation behind it *on purpose*:
 * the seam is only worth having if a second id exists to prove the interface
 * is not shaped around one vendor's request. `main/companion/stt/index.ts`
 * answers a request for it with a plain "not configured" error rather than a
 * type error, which is what makes adding it later a file rather than a
 * refactor.
 *
 * Chromium's own `SpeechRecognition` is not an option here at all — in
 * Electron it routes to a Google endpoint with an API key Electron does not
 * ship and fails with a network error (verified against a packaged build
 * rather than assumed).
 */
export const STT_PROVIDER_IDS = ['whisper-local', 'openai-whisper', 'deepgram'] as const;
export const SttProviderIdSchema = z.enum(STT_PROVIDER_IDS);
export type SttProviderId = (typeof STT_PROVIDER_IDS)[number];

/** The key-free local engine — the mic has to work before anyone visits Settings. */
export const DEFAULT_STT_PROVIDER_ID: SttProviderId = 'whisper-local';

/**
 * Which provider a transcription uses: the one chosen, or — when none is
 * (`null`/absent, the "automatic" a migrated install starts on) — the single
 * provider with a stored key if there is exactly one, else the key-free
 * default. Shared so main's `resolveProviderId` and the Settings select that
 * shows the effective choice cannot disagree.
 */
export function pickSttProvider(
  requested: SttProviderId | null | undefined,
  configured: readonly SttProviderId[],
): SttProviderId {
  if (requested !== null && requested !== undefined) return requested;
  return configured.length === 1 ? (configured[0] as SttProviderId) : DEFAULT_STT_PROVIDER_ID;
}

/**
 * Providers `transcribeUtterance` will construct with **no stored credential
 * at all**. Every id absent from this list needs a key in `safeStorage`
 * before its factory is even called — `whisper-local`'s factory ignores the
 * key argument it is handed, so `stt/index.ts` must not refuse it for lacking
 * one the way it rightly refuses every cloud provider.
 */
export const STT_PROVIDERS_WITHOUT_KEY: readonly SttProviderId[] = ['whisper-local'];

/** Human labels for the Settings provider picker, so the copy lives with the ids. */
export const STT_PROVIDER_LABELS: Record<SttProviderId, string> = {
  'whisper-local': 'Whisper (offline, built-in — no key needed)',
  'openai-whisper': 'OpenAI Whisper (cloud, needs an API key)',
  deepgram: 'Deepgram (not yet implemented)',
};

/**
 * How long a transcription gets before it is abandoned.
 *
 * Fifteen seconds, from the phase doc. It is generous for a push-to-talk
 * utterance of a few seconds and short enough that a hung provider does not
 * leave the companion in `listening` while the user waits — the abort is what
 * returns the machine to `idle` with a spoken error.
 */
export const COMPANION_STT_TIMEOUT_MS = 15_000;

/** What `MediaRecorder` is asked for, and what the provider is told it got. */
export const COMPANION_RECORDER_MIME = 'audio/webm;codecs=opus';

/**
 * `MediaRecorder` timeslice. 250 ms from the phase doc — small enough that a
 * released button loses nothing, large enough not to churn `dataavailable`.
 */
export const COMPANION_RECORDER_TIMESLICE_MS = 250;

/**
 * Cap on one utterance's bytes before main refuses it.
 *
 * Opus at the recorder's default bitrate is roughly 4–8 KB/s, so 8 MB is
 * minutes of speech — far past anything push-to-talk produces. It exists
 * because the payload crosses IPC and is then uploaded: an unbounded
 * `Uint8Array` from a renderer bug would be a main-process allocation and a
 * paid API request, and both should fail fast and locally.
 */
export const COMPANION_STT_MAX_BYTES = 8 * 1024 * 1024;

// --- G · the loading personality's timings ---------------------------------

/**
 * How long a wait has to last before the companion says anything about it.
 *
 * Six seconds, from the phase doc. Below that a filler is noise over work that
 * was about to finish; above it silence starts reading as "did it hear me".
 */
export const COMPANION_FILLER_THRESHOLD_MS = 6_000;

/**
 * The gap between fillers, randomised inside this window.
 *
 * Randomised rather than fixed because a metronomic voice is the thing that
 * makes a companion feel like a progress bar. Twenty-five to forty seconds is
 * the phase doc's range.
 */
export const COMPANION_FILLER_SPACING_MS = { min: 25_000, max: 40_000 } as const;

/** When the music offer is made, once per hand-off. */
export const COMPANION_MUSIC_OFFER_MS = 20_000;

/**
 * How long the `AudioContext` stays running with nothing to play.
 *
 * Suspended, never closed: a closed context cannot be reused and the next
 * whistle would pay for a new audio thread and a new graph. Sixty seconds from
 * the phase doc, and the reason the idle-CPU claim in the PR body is
 * measurable at all.
 */
export const COMPANION_AUDIO_IDLE_SUSPEND_MS = 60_000;

/** How long the speaking pulse takes to fall back to zero after a word boundary. */
export const COMPANION_LEVEL_DECAY_MS = 180;

/**
 * The CSS custom property the speaking pulse writes.
 *
 * Named here rather than in the renderer because it is a **contract between
 * two themes** — Theme F's speaker writes it, Theme H's `[data-companion-state="speaking"]`
 * rule reads it as a box-shadow radius. A literal in each file would drift the
 * first time either side was renamed.
 */
export const COMPANION_LEVEL_VAR = '--companion-level';

/**
 * "Companion volume" — how loudly Theme G's synthesis plays, 0–1.
 *
 * 0.7 rather than 1 because the whistle and the elevator loop are
 * *background*: a default that competes with the speaking voice is a default
 * nobody keeps. Speech is not scaled by it — `speechSynthesis` volume is the
 * OS voice's own, and a slider that quietly moved both would make "turn the
 * music down" mean "stop being able to hear it".
 */
export const DEFAULT_COMPANION_VOLUME = 0.7;

/**
 * How the mic button behaves (Theme F).
 *
 * `push` is the default because it cannot leave a microphone open — releasing
 * is the same gesture as stopping, so there is no state to forget. `toggle`
 * exists for a long dictation and for anyone who cannot hold a button down,
 * which is an accessibility case rather than a preference.
 */
export const COMPANION_MIC_MODES = ['push', 'toggle'] as const;
export const CompanionMicModeSchema = z.enum(COMPANION_MIC_MODES);
export type CompanionMicMode = (typeof COMPANION_MIC_MODES)[number];

/**
 * Which engine turns a held mic press into text (Ad Hoc: companion input +
 * voice improvements).
 *
 * `server` is Phase 79 Theme F's original path unchanged — `MediaRecorder`
 * captures a blob and main recognises it (`whisper-local`/`openai-whisper`).
 * `webSpeech` is new: the browser's own `SpeechRecognition` /
 * `webkitSpeechRecognition`, running entirely in the renderer with no IPC
 * round trip. It stays opt-in rather than the default — in Electron,
 * Chromium's `webkitSpeechRecognition` depends on a Google-hosted
 * recognition service and an API key Electron does not ship, so it typically
 * fails with a `network` error the instant it starts (`recorder.ts`'s own
 * docblock called this out when Theme F chose the server path instead, and
 * manual verification against a packaged-equivalent build reproduces the
 * same failure). A user who wants to try it anyway can flip it on in
 * Settings ▸ Companion ▸ Microphone; the offline/cloud server engine stays
 * the default every fresh install and every migrated one lands on.
 */
export const COMPANION_STT_ENGINES = ['server', 'webSpeech'] as const;
export const CompanionSttEngineSchema = z.enum(COMPANION_STT_ENGINES);
export type CompanionSttEngine = (typeof COMPANION_STT_ENGINES)[number];

/** Pick the next filler gap. `rng` injected so the scheduler's tests are exact. */
export function nextFillerDelayMs(rng: () => number = Math.random): number {
  const { min, max } = COMPANION_FILLER_SPACING_MS;
  const roll = Math.min(1, Math.max(0, rng()));
  return Math.round(min + roll * (max - min));
}

// --- G · the whistle melodies ----------------------------------------------

/**
 * One note: a MIDI number and a length in beats.
 *
 * MIDI rather than hertz because the melodies were written by ear on a
 * keyboard and a transposition is then an addition; beats rather than seconds
 * because the tempo is a property of the melody, not of every note in it.
 * A `midi` of `-1` is a rest — encoded in the same array so a melody stays one
 * literal rather than a note list plus a rhythm list that can disagree.
 */
export type MelodyNote = readonly [midi: number, beats: number];

export type CompanionMelody = {
  readonly name: string;
  readonly bpm: number;
  readonly notes: readonly MelodyNote[];
};

/** A rest, in the `midi` slot. */
export const MELODY_REST = -1;

/**
 * Five original whistling melodies, eight to twelve notes each.
 *
 * Original by construction — written for this file, in a range a whistle
 * actually sits in (MIDI 72–88, C5 to E6) and short enough to finish inside
 * one filler gap. The phase's guardrail is "no audio assets": these are the
 * assets, as numbers, and `whistle.ts` renders them with two oscillators.
 *
 * They are deliberately unremarkable. A memorable tune played every
 * twenty-five seconds becomes an irritant faster than a forgettable one.
 */
export const COMPANION_WHISTLE_MELODIES: readonly CompanionMelody[] = [
  {
    name: 'ascent',
    bpm: 96,
    notes: [
      [72, 1],
      [74, 1],
      [76, 1],
      [79, 1.5],
      [MELODY_REST, 0.5],
      [76, 1],
      [79, 1],
      [81, 2],
    ],
  },
  {
    name: 'stroll',
    bpm: 84,
    notes: [
      [76, 0.75],
      [76, 0.25],
      [79, 1],
      [77, 1],
      [76, 1],
      [74, 0.75],
      [74, 0.25],
      [72, 1],
      [74, 1],
      [76, 2],
    ],
  },
  {
    name: 'shrug',
    bpm: 108,
    notes: [
      [81, 0.5],
      [79, 0.5],
      [76, 1],
      [MELODY_REST, 0.5],
      [77, 0.5],
      [76, 0.5],
      [74, 1],
      [MELODY_REST, 0.5],
      [72, 1.5],
    ],
  },
  {
    name: 'question',
    bpm: 92,
    notes: [
      [74, 1],
      [76, 0.5],
      [77, 0.5],
      [79, 1],
      [81, 1],
      [79, 0.5],
      [77, 0.5],
      [79, 1],
      [83, 1.5],
      [MELODY_REST, 0.5],
      [81, 1],
      [79, 2],
    ],
  },
  {
    name: 'settle',
    bpm: 76,
    notes: [
      [84, 1],
      [81, 1],
      [79, 1.5],
      [MELODY_REST, 0.5],
      [77, 1],
      [76, 1],
      [74, 1.5],
      [MELODY_REST, 0.5],
      [72, 2],
    ],
  },
];

/**
 * MIDI note number → hertz, equal temperament, A4 = 440 Hz = MIDI 69.
 *
 * A rest ({@link MELODY_REST}, or any negative number) is 0 Hz, which
 * `whistle.ts` reads as "schedule the gain envelope, skip the frequency" —
 * cheaper than a branch in every caller and it keeps the golden-frequency test
 * total over the encoding.
 */
export function midiToFrequency(midi: number): number {
  if (!Number.isFinite(midi) || midi < 0) return 0;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Every note's pitch in order — what the melody test asserts against a golden set. */
export function melodyFrequencies(melody: CompanionMelody): number[] {
  return melody.notes.map(([midi]) => midiToFrequency(midi));
}

/** How long the melody takes at its own tempo, in seconds — rests included. */
export function melodyDurationSeconds(melody: CompanionMelody): number {
  const beats = melody.notes.reduce((total, [, note]) => total + Math.max(0, note), 0);
  const bpm = melody.bpm > 0 ? melody.bpm : 90;
  return (beats * 60) / bpm;
}

// --- D · the static overview ------------------------------------------------

/**
 * Turn a snapshot into the sentences the companion says after the greeting.
 *
 * **One sentence per fact, and a zero is not a fact.** "You have no
 * uncommitted changes, no open pull requests and no failing checks" is three
 * sentences of nothing; a greeting that recites them every time is the reason
 * people turn a companion off. So every clause below is guarded on there being
 * something to report, and the whole thing collapses to one line on a clean
 * repo — which is itself worth saying exactly once.
 *
 * Pure, and in `shared` rather than in the flow, for the same reason
 * {@link summariseDigest} is: this is text a human hears, so it is the thing
 * most worth having fixture tests over.
 *
 * `null` fields are the forge's "I could not reach GitHub" (see
 * {@link CompanionSnapshotSchema}) and earn a sentence of their own, once,
 * rather than being silently dropped — the phase's own wording.
 */
export function describeSnapshot(snapshot: CompanionSnapshot): string[] {
  const lines: string[] = [];

  if (snapshot.repo === null) {
    lines.push(
      snapshot.repos > 0
        ? `No repository is open — you have ${plural(snapshot.repos, 'one')} to choose from.`
        : 'No repository is open yet.',
    );
    return lines;
  }

  const name = snapshot.repo.name;
  lines.push(
    snapshot.branch === null
      ? `You are in ${name}, on a detached head.`
      : `You are in ${name}, on ${snapshot.branch}.`,
  );

  if (snapshot.ahead > 0 && snapshot.behind > 0) {
    lines.push(
      `That branch is ${plural(snapshot.ahead, 'commit')} ahead and ${plural(snapshot.behind, 'commit')} behind.`,
    );
  } else if (snapshot.ahead > 0) {
    lines.push(`It is ${plural(snapshot.ahead, 'commit')} ahead of the remote.`);
  } else if (snapshot.behind > 0) {
    lines.push(`It is ${plural(snapshot.behind, 'commit')} behind the remote.`);
  }

  const dirty = describeDirty(snapshot.dirty);
  if (dirty !== '') lines.push(dirty);

  if (snapshot.sessions.live > 0) {
    const detail = [
      snapshot.sessions.thinking > 0 ? `${snapshot.sessions.thinking} thinking` : '',
      snapshot.sessions.waiting > 0 ? `${snapshot.sessions.waiting} waiting on you` : '',
    ].filter((part) => part !== '');
    lines.push(
      detail.length > 0
        ? `${capitalise(plural(snapshot.sessions.live, 'session'))} running — ${detail.join(', ')}.`
        : `${capitalise(plural(snapshot.sessions.live, 'session'))} running.`,
    );
  }

  if (
    snapshot.openPulls === null ||
    snapshot.failingChecks === null ||
    snapshot.passingChecks === null
  ) {
    lines.push('I could not reach GitHub, so I have nothing on pull requests or checks.');
  } else {
    const totalChecks = snapshot.passingChecks + snapshot.failingChecks;
    const forge = [
      snapshot.openPulls > 0 ? plural(snapshot.openPulls, 'open pull request') : '',
      // Passing AND failing, plus the pass percentage, rather than only the
      // failure count — "5 open pull requests and 1 check failing" used to
      // say nothing about the 12 that passed. Guarded on `totalChecks > 0`
      // for the same reason every other clause here is guarded: no checks at
      // all is not a fact worth a sentence, and a 0/0 percentage is not a
      // percentage.
      totalChecks > 0
        ? `${plural(snapshot.passingChecks, 'check')} passing, ${snapshot.failingChecks} failing — ${Math.round((snapshot.passingChecks / totalChecks) * 100)} percent`
        : '',
    ].filter((part) => part !== '');
    if (forge.length > 0) lines.push(`${capitalise(forge.join(' and '))}.`);
  }

  // Only when literally nothing above had anything to add — the branch line is
  // always there, so "just the branch line" is the clean-repo case.
  if (lines.length === 1) lines.push('Everything is clean and nothing is running.');

  return lines;
}

function describeDirty(dirty: CompanionSnapshot['dirty']): string {
  const parts = [
    dirty.staged > 0 ? `${dirty.staged} staged` : '',
    dirty.unstaged > 0 ? `${dirty.unstaged} unstaged` : '',
    dirty.untracked > 0 ? `${dirty.untracked} untracked` : '',
  ].filter((part) => part !== '');
  if (parts.length === 0) return '';
  const total = dirty.staged + dirty.unstaged + dirty.untracked;
  return `${capitalise(plural(total, 'change'))}: ${parts.join(', ')}.`;
}

// --- follow-up · one formatted turn instead of a dozen ----------------------

/**
 * Neutralise the characters a markdown parser would act on.
 *
 * Applied to every *interpolated* fragment — a repo name, a branch, a commit
 * subject, a PR title — and to none of the scaffolding this module writes
 * itself. Titles in this repo really do contain `[M · 4-6h]`, `**`, backticks
 * and underscores, and a title is data: it must arrive in the bubble looking
 * the way it looks in `git log`, not half-italicised because somebody used a
 * snake_case identifier in a commit subject.
 *
 * Escaping rather than stripping, because the renderer is a real markdown
 * parser (`react-markdown`) and a backslash escape is exactly what it is
 * specified to turn back into the literal character. {@link markdownToSpeech}
 * undoes them for the spoken rendition.
 */
export function escapeMarkdownInline(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, '\\$1');
}

/** `` `ref` `` unless the title already says it — `branchesAhead` names the branch twice otherwise. */
function refSuffix(item: CompanionDigestItem): string {
  const ref = item.ref.trim();
  if (ref === '' || item.title.includes(ref)) return '';
  return ` (\`${escapeMarkdownInline(ref)}\`)`;
}

/** One digest item as a list row: hyperlinked when the forge gave us a page, plain when it did not. */
function digestItemMarkdown(item: CompanionDigestItem): string {
  const title = escapeMarkdownInline(item.title.trim());
  const label = item.url === undefined || item.url === '' ? title : `[${title}](${item.url})`;
  return `- ${label}${refSuffix(item)}`;
}

/**
 * A section's rows, capped the way the spoken summary is.
 *
 * {@link COMPANION_DIGEST_NAME_CAP} exists because past five titles a *spoken*
 * list becomes a wait — and the cap is kept here even though this rendition is
 * read rather than heard, because this is the text the speech is derived from.
 * A bubble naming five and a voice naming five is one message; a bubble naming
 * forty and a voice naming five is two.
 */
function digestSection(items: readonly CompanionDigestItem[]): string[] {
  const named = items.slice(0, COMPANION_DIGEST_NAME_CAP).map(digestItemMarkdown);
  const rest = items.length - named.length;
  if (rest > 0) named.push(`- and ${rest} more`);
  return named;
}

export type OverviewMarkdownOptions = {
  /** The digest to fold in, or `null`/absent when there is no repo to have one. */
  digest?: CompanionDigest | null;
  /** Whether to append the "shall I switch?" offer. The caller decides, from `snapshot.repos > 1`. */
  offerSwitch?: boolean;
  now?: number;
  /**
   * Forwarded to {@link toSpokenDigest} — `composeOverviewMarkdown` ignores
   * both of these, so passing them alongside `digest`/`offerSwitch`/`now` to
   * either function is always safe (`orient()` in `concierge.ts` does exactly
   * that, from the one options object).
   */
  rng?: () => number;
  /** A resolved honorific — see {@link SpokenDigestOptions}. */
  honorific?: string;
};

/**
 * The whole orientation — repo, branch, state and digest — as **one** markdown turn.
 *
 * The Phase 79 follow-up's first fix. Theme D said one sentence per fact and
 * spoke each one as its own turn, which is right for speech and wrong for a
 * chat log: a greeting arrived as six to twelve separate bubbles, each a
 * fragment, and the thread read like a stack trace. So the facts are unchanged
 * and the *packaging* is: a bold repo name with the branch in inline code, the
 * remaining facts as bullets, and the digest as a **Landed** / **In progress**
 * pair with forge links on the items that have pages.
 *
 * **Built on {@link describeSnapshot} rather than beside it.** Its lines are
 * taken as-is — the first as the heading, the rest as bullets — so there is
 * exactly one place in this codebase that decides what a snapshot is worth
 * saying about, and the markdown cannot drift from the speech. Which matters
 * doubly because the speech now comes *from* this markdown, through
 * {@link markdownToSpeech}.
 */
export function composeOverviewMarkdown(
  snapshot: CompanionSnapshot,
  options: OverviewMarkdownOptions = {},
): string {
  const { digest = null, offerSwitch = false, now = Date.now() } = options;
  const facts = describeSnapshot(snapshot);
  const blocks: string[] = [];

  if (snapshot.repo === null) {
    // No repo, no heading to bold and no branch to quote — the one sentence
    // `describeSnapshot` produces is the whole overview.
    blocks.push(facts.map(escapeMarkdownInline).join(' '));
  } else {
    const name = escapeMarkdownInline(snapshot.repo.name);
    blocks.push(
      snapshot.branch === null
        ? `**${name}** — on a detached head`
        : `**${name}** — on \`${escapeMarkdownInline(snapshot.branch)}\``,
    );
    // `describeSnapshot`'s first line is the branch sentence, which the
    // heading above has just said better. Everything after it is a fact.
    const bullets = facts.slice(1).map((line) => `- ${escapeMarkdownInline(line)}`);
    if (bullets.length > 0) blocks.push(bullets.join('\n'));
  }

  if (digest !== null) {
    const when = sinceLabel(digest.since, now);
    blocks.push(
      digest.landed.length === 0
        ? `**Landed** — nothing ${when}.`
        : [`**Landed** ${when}`, ...digestSection(digest.landed)].join('\n'),
    );
    blocks.push(
      digest.inProgress.length === 0
        ? '**In progress** — nothing open right now.'
        : ['**In progress**', ...digestSection(digest.inProgress)].join('\n'),
    );
    if (digest.landed.length === 0 && digest.inProgress.length === 0) {
      blocks.push('A clean slate, then.');
    }
  }

  if (offerSwitch) blocks.push('Want to switch to another one?');

  return blocks.join('\n\n');
}

/**
 * The same turn, rendered for a voice rather than a screen.
 *
 * The follow-up's constraint was that consolidating the bubbles must not make
 * the companion *read markup out loud* — "asterisk asterisk midnite hyphen
 * studio asterisk asterisk" is not an improvement on twelve bubbles. So the
 * markdown is the single source and this is its spoken projection: emphasis
 * markers, backticks, list bullets and heading hashes go; a link becomes its
 * own text; a backslash escape becomes the character it was protecting.
 *
 * A terminator is added to any line that has none, which is what makes the
 * heading and the two section labels land as sentences instead of running into
 * the bullet that follows them — {@link chunkForSpeech} splits on `.!?`, and a
 * paragraph with no punctuation at all is one 200-character utterance with no
 * breath in it.
 *
 * Pure, in `shared`, and unit-tested for the reason every other function in
 * this file is: it is text a human hears.
 *
 * **A blank line marks a paragraph boundary rather than disappearing.**
 * {@link composeOverviewMarkdown} joins its blocks with `\n\n`, and a blank
 * split line becomes {@link COMPANION_PARAGRAPH_BREAK} here instead of being
 * dropped — Ad Hoc: "a brief pause between paragraphs". The marker is never
 * itself spoken; it exists so a caller further down the pipeline (`say` in
 * `concierge.ts`, via {@link splitSpeechParagraphs}) can still find where a
 * block ended once every *other* newline has been joined into one string. Two
 * or more blank lines collapse to a single marker, and a marker can never
 * open or close the output — there is nothing to pause before the first line
 * or after the last.
 */
export function markdownToSpeech(markdown: string): string {
  const cleaned = markdown.split('\n').map((raw) =>
    raw
      // A link is its text. Done before anything else, so a `[` inside the
      // label cannot be mistaken for the start of another one.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      // A bare autolink still has to say something.
      .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
      // List markers and heading hashes are layout, not words.
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      /*
        Un-escape *before* stripping emphasis, and after the two link passes
        above. The order is the whole subtlety of this function. Un-escaping
        first would turn an escaped `\[title\]` back into a link pattern
        the pass above has already gone by; un-escaping last would leave
        `\*\*` half-eaten by the emphasis pass and the voice saying
        "backslash". So: links, then escapes, then markup.
      */
      .replace(/\\([\\`*_[\]<>])/g, '$1')
      // Emphasis and code spans. A literal asterisk the author escaped is
      // now indistinguishable from an emphasis marker — and dropping it is
      // the right answer either way, because no voice should say "asterisk".
      .replace(/\*\*|__/g, '')
      .replace(/`+/g, '')
      .trim(),
  );

  const lines: string[] = [];
  for (const line of cleaned) {
    if (line === '') {
      if (lines.length > 0 && lines[lines.length - 1] !== COMPANION_PARAGRAPH_BREAK) {
        lines.push(COMPANION_PARAGRAPH_BREAK);
      }
      continue;
    }
    lines.push(line);
  }
  while (lines.length > 0 && lines[lines.length - 1] === COMPANION_PARAGRAPH_BREAK) lines.pop();

  return lines
    .map((line) =>
      line === COMPANION_PARAGRAPH_BREAK || /[.!?:;]$/.test(line) ? line : `${line}.`,
    )
    .join('\n');
}

/**
 * The line {@link markdownToSpeech} emits at a paragraph boundary instead of
 * dropping it — Ad Hoc: "a brief pause between paragraphs".
 *
 * Not whitespace by JS regex `\s` — deliberately, so `chunkForSpeech`'s own
 * `\s+` normalisation cannot silently eat it before a caller has had the
 * chance to split on it with {@link splitSpeechParagraphs}. U+2063 INVISIBLE
 * SEPARATOR: it carries no visible glyph, so it is inert if it were ever
 * spoken by mistake, and it is not a character any real title, path or SHA
 * would ever contain.
 */
export const COMPANION_PARAGRAPH_BREAK = '⁣';

/** How long {@link splitSpeechParagraphs}'s pause is, once split. Roughly a third of a second — long enough to read as a breath, short enough not to read as a stall. */
export const COMPANION_PARAGRAPH_PAUSE_MS = 350;

/**
 * Split a speech string on {@link COMPANION_PARAGRAPH_BREAK} into the
 * paragraphs it separates, each paragraph's own lines rejoined into one
 * flowing run of sentences. A speech string with no marker at all — every
 * phrase-bank line, every call site that predates this — is just its own
 * single paragraph, so this is a no-op change of shape for them.
 */
export function splitSpeechParagraphs(speech: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of speech.split('\n')) {
    if (line === COMPANION_PARAGRAPH_BREAK) {
      if (current.length > 0) paragraphs.push(current.join(' '));
      current = [];
      continue;
    }
    if (line !== '') current.push(line);
  }
  if (current.length > 0) paragraphs.push(current.join(' '));
  return paragraphs;
}

/** Basenames a redacted path shouldn't bother naming — too generic to mean anything spoken aloud. */
const SANITIZE_GENERIC_BASENAMES = new Set([
  'index',
  'main',
  'app',
  'style',
  'styles',
  'types',
  'type',
  'utils',
  'constants',
  'config',
]);

/** Lazy, so a sentence's own trailing period/comma is never swallowed into the match. */
const SANITIZE_URL_RE = /\bhttps?:\/\/\S+?(?=[.,!?;:]*(?:\s|$))/g;
/** `#` directly followed by digits — never a bare `#`, and never `C#`/`#define`-style text with no digits. */
const SANITIZE_PR_REF_RE = /#(\d+)\b/g;
/** One or more path separators, so `main`/`master` alone (no separator) never reach this pass. */
const SANITIZE_SLASHED_TOKEN_RE = /\b[\w.-]+(?:[/\\][\w.-]+)+\b/g;
/** A real extension, not a semver's trailing `.1` — the extension must start with a letter. */
const SANITIZE_EXTENSION_RE = /\.[A-Za-z][A-Za-z0-9]{0,7}$/;
const SANITIZE_PACKAGE_PATH_RE = /(?:^|[/\\])packages[/\\]/;
const SANITIZE_SEMVER_RE = /\bv?\d+\.\d+\.\d+(?:[-+][\w.]+)?\b/g;
const SANITIZE_STRIP_PUNCTUATION_RE = /[\s.!?:;]/g;
const SANITIZE_BLANK_LINE_RE = /^[\s.!?:;]*$/;
/** A hex run with at least one letter *and* one digit — real SHAs mix both; a bare word or count doesn't. */
const SANITIZE_SHA_RE = /\b(?=[0-9a-fA-F]*[a-fA-F])(?=[0-9a-fA-F]*[0-9])[0-9a-fA-F]{7,40}\b/g;
/** The sentence already named it ("commit a1b2c3d") — drop the SHA rather than say "commit a commit". */
const SANITIZE_REDUNDANT_REF_RE = /\b(?:commit|sha|hash|ref|revision)s?\s*$/i;

/**
 * The spoken-form redaction pass — Phase 80 Theme A.
 *
 * `markdownToSpeech` strips markup, not the machine-facing tokens the markup
 * was wrapping — a commit SHA, a file path, a raw URL, a version string, a
 * punctuation-heavy branch ref all survive it verbatim
 * (`companion.test.ts`'s own fixtures prove it: `` `Tuesday` `` becomes
 * `Tuesday`, not something safer to read aloud). This pass sits strictly
 * *after* `markdownToSpeech` and strictly *before* {@link splitForSpeech} —
 * it matches plain text, not markdown, because the backtick/link syntax that
 * would have marked these tokens as "not a word" is already gone by then.
 *
 * On-screen markdown is never touched: this only ever runs on the derived
 * speech string (see `sayMarkdown` in `concierge.ts`), never on the turn
 * that gets posted to the thread.
 *
 * Every substitution is a category noun — "a commit", "a file", "a link", "a
 * branch", "a new version" — never an abbreviation (Decision 2 in the phase
 * doc): a shortened SHA or a truncated path is still an unpronounceable
 * string a synthesiser spells out letter by letter, and only a category noun
 * reads as a sentence.
 *
 * Pure and idempotent: every placeholder word is itself un-redactable (no
 * digits, no separator, no hex-shaped run), so calling this on its own output
 * is always a no-op.
 *
 * **`#123` → `PR 123`** joined the pass list in the Ad Hoc companion speech
 * overhaul, item 3 — a general fallback for any `#`-prefixed number that
 * reaches this function *without* having gone through
 * {@link groupedDigestSpeech}'s own per-item PR-ref phrasing (which already
 * says "in PR 372" and leaves no bare `#372` behind). Guarded to `#` directly
 * followed by digits, so `C#` and a stray `#` are never touched.
 */
export function sanitizeForSpeech(text: string): string {
  let result = text.replace(SANITIZE_URL_RE, 'a link');
  result = result.replace(SANITIZE_PR_REF_RE, (_match, num: string) => `PR ${num}`);

  result = result.replace(SANITIZE_SLASHED_TOKEN_RE, (token) => {
    const hasExtension = SANITIZE_EXTENSION_RE.test(token);
    const isPackagePath = SANITIZE_PACKAGE_PATH_RE.test(token);
    if (!hasExtension && !isPackagePath) return 'a branch';
    const basename = token.split(/[/\\]/).pop() ?? token;
    const stem = basename.replace(/\.[^.]+$/, '').toLowerCase();
    return SANITIZE_GENERIC_BASENAMES.has(stem) ? 'a file' : basename;
  });

  result = result
    .split('\n')
    .map((line) => {
      const withoutVersions = line.replace(SANITIZE_SEMVER_RE, (match, offset: number) => {
        const before = line.slice(0, offset).replace(SANITIZE_STRIP_PUNCTUATION_RE, '');
        const after = line
          .slice(offset + match.length)
          .replace(SANITIZE_STRIP_PUNCTUATION_RE, '');
        return before === '' && after === '' ? '' : 'a new version';
      });
      return withoutVersions.trim();
    })
    .filter((line) => line !== '' && !SANITIZE_BLANK_LINE_RE.test(line))
    .join('\n');

  result = result.replace(SANITIZE_SHA_RE, (match, offset: number, str: string) => {
    const before = str.slice(0, offset);
    return SANITIZE_REDUNDANT_REF_RE.test(before) ? '' : 'a commit';
  });

  return result
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([.!?:;,])/g, '$1')
        .trim(),
    )
    .filter((line) => line !== '')
    .join('\n')
    .trim();
}

/**
 * {@link composeOverviewMarkdown}'s spoken projection — built directly from
 * the same snapshot/digest data rather than derived from the markdown, so the
 * digest itself is {@link toSpokenDigest}'s consolidated, phase-and-theme
 * rendering rather than one sentence per item.
 *
 * **The on-screen markdown is untouched by this.** `describeSnapshot`'s own
 * lines are already the plain sentences a voice should read — that is that
 * function's whole docblock — so this reaches for them directly rather than
 * having `composeOverviewMarkdown` escape them for markdown and then
 * `markdownToSpeech` un-escape them again. `orient()` in `concierge.ts` calls
 * this *alongside* `composeOverviewMarkdown`, not through it: one string for
 * the thread, one for the voice, built from the same two inputs.
 *
 * Blocks are separated by {@link COMPANION_PARAGRAPH_BREAK} so `say`
 * (`concierge.ts`) can pause between them — the heading-and-facts, the
 * digest (one paragraph — {@link toSpokenDigest} already reads as a single
 * catch-up rather than a Landed/In-progress pair) and the switch offer are
 * each their own paragraph.
 *
 * `sanitizeForSpeech` still runs once, over the whole joined result — it is
 * idempotent and `toSpokenDigest`'s own output has nothing left for it to
 * redact, but `describeSnapshot`'s facts (a branch name, a path) still can.
 */
export function composeOverviewSpeech(
  snapshot: CompanionSnapshot,
  options: OverviewMarkdownOptions = {},
): string {
  const { digest = null, offerSwitch = false, now = Date.now(), rng, honorific = '' } = options;
  const blocks: string[] = [describeSnapshot(snapshot).join(' ')];

  if (digest !== null) {
    blocks.push(toSpokenDigest(digest, { now, rng, honorific }));
  }

  if (offerSwitch) blocks.push('Want to switch to another one?');

  return sanitizeForSpeech(blocks.join(`\n${COMPANION_PARAGRAPH_BREAK}\n`));
}

// --- E · the intent grammar -------------------------------------------------

/**
 * How much a spoken/typed word may do that a click can do (Phase 81 Theme A,
 * Decision 4/5).
 *
 * - `direct` — runs immediately and says what it did. Reversible by the next
 *   keystroke, and changes no data.
 * - `confirm` — says what it *would* do and waits for a yes. Changes data or
 *   state the user would want to have meant.
 * - `never` — destructive, or self-referential. Not a word the companion
 *   knows: `CompanionVocabulary.commands` carries only `direct`/`confirm`
 *   rows, so a `never` command never appears in it.
 *
 * Declared here, not in `features/palette/safety.ts`, because
 * `CompanionVocabulary` (just below) needs it and `shared` may not import
 * `app`; `COMMAND_ACCESS: Record<CommandId, CompanionAccess>` — the actual
 * per-command table — lives in `safety.ts` beside `PALETTE_SAFE` (Decision 4),
 * imported from here.
 */
export type CompanionAccess = 'direct' | 'confirm' | 'never';

// --- Phase 109 · the voice-settable companion keys ---------------------------

/**
 * Every companion setting with a spec — the keys `applyCompanionSetting`
 * (`app/features/companion/settings-apply.ts`) can write, whoever asks: the
 * companion's own voice, an agent over MCP, or the Settings page.
 *
 * The voice selection is two keys, `companionVoices.local` and
 * `companionVoices.system`, because the store keeps one choice per engine and
 * "use voice Bella" changes exactly one of them. `companionProfiles` has no
 * key here: a profile is saved, switched and deleted as a whole (Theme G), never
 * set field by field.
 *
 * **Declared here, above {@link CompanionIntentSchema}**, rather than beside
 * the rest of the settings list further down, because Theme C's `setting`
 * intent restricts its `key` to these and a module-level `const` cannot be
 * read before its declaration has run. {@link CompanionSettingsSchema} carries
 * a type assertion that this list and the schema's keys agree.
 */
export const COMPANION_SETTING_KEYS = [
  'companionEnabled',
  'companionSttEngine',
  'companionSttProvider',
  'companionHandsFree',
  'companionSpeakAloud',
  'companionNames',
  'companionMicMode',
  'voiceConversation',
  'voiceConversationTrigger',
  'companionPersonality',
  'companionAboutUser',
  'companionVoices.local',
  'companionVoices.system',
  'companionVolume',
  'companionHonorifics',
  'companionMusicOffer',
  'companionActiveProfile',
] as const;
export type CompanionSettingKey = (typeof COMPANION_SETTING_KEYS)[number];

/**
 * Who may change each setting without the page (Phase 109 Decision 2,
 * "guarded"), in the vocabulary `COMMAND_ACCESS` already uses for commands.
 *
 * - **`never`** — anything that could switch off the companion's own hearing
 *   or choose where audio is sent: enabled, the recognition engine, the STT
 *   provider, hands-free. The page is the only way in.
 * - **`confirm`** — anything that changes what wakes it, whether you hear it,
 *   how the mic behaves, or the free text it is prompted with.
 * - **`direct`** — anything a misheard sentence can only make sound different,
 *   and that "undo that" puts right.
 *
 * `companionSpeakAloud` is `confirm` only in the direction that silences it;
 * its spec's `directValues` drops "speak out loud" to `direct`.
 * {@link companionSettingTier} is the function that resolves the pair.
 */
export const COMPANION_SETTING_TIERS: Readonly<Record<CompanionSettingKey, CompanionAccess>> = {
  companionEnabled: 'never',
  companionSttEngine: 'never',
  companionSttProvider: 'never',
  companionHandsFree: 'never',
  companionSpeakAloud: 'confirm',
  companionNames: 'confirm',
  companionMicMode: 'confirm',
  voiceConversation: 'confirm',
  voiceConversationTrigger: 'confirm',
  companionPersonality: 'confirm',
  companionAboutUser: 'confirm',
  'companionVoices.local': 'direct',
  'companionVoices.system': 'direct',
  companionVolume: 'direct',
  companionHonorifics: 'direct',
  companionMusicOffer: 'direct',
  companionActiveProfile: 'direct',
};

/**
 * The keys a `setting` intent may name (Phase 109 Theme C): every key whose
 * tier is not `never`. Restricting the intent's own enum is what makes a
 * change to the companion's hearing *unrepresentable* — neither the grammar
 * nor the router can express one, so nothing downstream has to remember to
 * refuse it. A test asserts this is exactly the non-`never` rows of
 * {@link COMPANION_SETTING_TIERS}.
 */
export const COMPANION_INTENT_SETTING_KEYS = [
  'companionSpeakAloud',
  'companionNames',
  'companionMicMode',
  'voiceConversation',
  'voiceConversationTrigger',
  'companionPersonality',
  'companionAboutUser',
  'companionVoices.local',
  'companionVoices.system',
  'companionVolume',
  'companionHonorifics',
  'companionMusicOffer',
  'companionActiveProfile',
] as const satisfies readonly CompanionSettingKey[];
export type CompanionIntentSettingKey = (typeof COMPANION_INTENT_SETTING_KEYS)[number];

/**
 * The `never`-tier keys — what a `pageOnlySetting` intent names when someone
 * asks for one out loud ("turn yourself off", "switch to web speech"). The
 * companion refuses and offers to open Settings ▸ Companion instead.
 */
export const COMPANION_PAGE_ONLY_SETTING_KEYS = [
  'companionEnabled',
  'companionSttEngine',
  'companionSttProvider',
  'companionHandsFree',
] as const satisfies readonly CompanionSettingKey[];
export type CompanionPageOnlySettingKey = (typeof COMPANION_PAGE_ONLY_SETTING_KEYS)[number];

/**
 * What a `profile` intent does with a persona profile (Phase 109 Theme G):
 * "save this as Narrator", "switch to Narrator", "delete the Narrator
 * profile", "what profiles do I have?". Declared above
 * {@link CompanionIntentSchema} for the reason the setting keys are.
 */
export const COMPANION_PROFILE_OPS = ['save', 'switch', 'delete', 'list'] as const;
export type CompanionProfileOp = (typeof COMPANION_PROFILE_OPS)[number];

/** The longest profile name — {@link CompanionProfileSchema}'s own cap, declared up here for the intent. */
export const COMPANION_PROFILE_NAME_MAX = 64;

/**
 * How a `setting` intent's `value` applies (Theme C).
 *
 * - `set` (the default) — `value` is the new value.
 * - `add` / `remove` — one word joins or leaves a list (names, what it calls
 *   you). The grammar cannot know the current list, so "call me boss" says
 *   *what* changes and `act()` works out the whole new list.
 * - `step` — a signed nudge to a number ("louder" is `+0.1`).
 * - `match` — `value` is a voice name as heard; `act()` resolves it against
 *   the Kokoro catalog or the system voices, the latter only existing in the
 *   renderer.
 */
export const COMPANION_SETTING_OPS = ['set', 'add', 'remove', 'step', 'match'] as const;
export type CompanionSettingOp = (typeof COMPANION_SETTING_OPS)[number];

/**
 * The `AgentCommandId`s the companion is allowed to start.
 *
 * **A subset, deliberately — twelve of the roster's twenty-two.** Left out:
 * every `loop*` id (a `/loop` runs unattended on a timer, which is not a thing
 * to start from a misheard sentence) and `releaseComplete` (it tags and
 * pushes — irreversible by design). `releasePrep` **joins** this list —
 * Phase 79's original exclusion reason ("writes a branch") applies equally to
 * `execAdhoc`, which was always in; the property that actually separates
 * `releaseComplete` is irreversibility, not branch-writing, and `releasePrep`
 * itself stops "before anything irreversible" by its own SKILL.md. It carries
 * one extra guardrail `COMPANION_NEVER_AUTOSEND` gives it below: hands-free
 * never sends its Return. `triage` also joins — it is read-only (Phase 81
 * Finding 7) and was previously the one `midnite-` skill with no id at all.
 * `midnite-setup` stays out, and for a different reason than either of those:
 * it bootstraps a *different* repository through ~10 interactive questions
 * and has no skill string to type — Phase 49 gave it a dialog, not an
 * `AgentCommandId`, so there is nothing here for the companion to name.
 * The phase's own guardrail is that every write goes through an agent session
 * the user can see; this list is where that stops being a sentence and starts
 * being a type.
 *
 * **Declared here rather than imported.** The canonical `AgentCommandId` union
 * lives in `packages/app/src/store/ui-store.ts`, and `shared` may not import
 * `app` — the dependency runs the other way. `features/companion/handoff.ts`
 * carries a compile-time assignment proving this list is a subset of the real
 * union, and a test asserting every id keys `DEFAULT_AGENT_SKILLS`, so the two
 * cannot drift silently in either direction.
 */
export const COMPANION_COMMAND_IDS = [
  'execAdhoc',
  'execBacklog',
  'execSwarm',
  'brainstorm',
  'refine',
  'addressIssue',
  'prReview',
  'prFeedback',
  'gitReport',
  'gitCleanup',
  'triage',
  'releasePrep',
] as const;
export type CompanionCommandId = (typeof COMPANION_COMMAND_IDS)[number];

/**
 * `CompanionCommandId`s whose typed-not-sent Return is never the companion's
 * to press, even when hands-free and a voice-input provider would otherwise
 * allow it (Phase 81 Theme D).
 *
 * `releasePrep` is the one skill in {@link COMPANION_COMMAND_IDS} that writes
 * a release branch — every other member is either read-only or an ordinary
 * task the user already reviews via the agent's own scrollback. `startCommand`
 * (`features/companion/handoff.ts`) checks this before honouring
 * `autoSendAllowed()`, and says so when it suppressed a send the user's
 * settings would otherwise have allowed.
 */
export const COMPANION_NEVER_AUTOSEND: readonly CompanionCommandId[] = ['releasePrep'];

/**
 * What a person actually says, per command.
 *
 * **Ordered longest-phrase-first within each entry, and matched in table
 * order.** Both matter: "ad hoc task" has to win over "task", and `execAdhoc`
 * has to be tried before `execBacklog` or "next ad hoc task" would route to the
 * backlog.
 */
export const COMPANION_VERBS: Readonly<Record<CompanionCommandId, readonly string[]>> = {
  execAdhoc: ['ad hoc task', 'adhoc task', 'ad-hoc task', 'ad hoc', 'adhoc', 'ad-hoc', 'one off'],
  execSwarm: ['exec swarm', 'swarm'],
  execBacklog: ['next task', 'backlog', 'next phase', 'next theme'],
  brainstorm: ['ideate', 'ideation', 'brainstorm', 'brain storm', 'new phase'],
  refine: ['refine'],
  addressIssue: [
    'address an issue',
    'address issue',
    'fix an issue',
    'triage the issues',
    'issue board',
  ],
  prReview: ['review a pr', 'review the pr', 'pr review', 'review my pr', 'code review'],
  prFeedback: ['pr feedback', 'address feedback', 'review comments', 'pr comments'],
  gitReport: ['git report', 'activity report', 'what have i done', 'what did i do'],
  gitCleanup: ['git cleanup', 'clean up branches', 'tidy the branches', 'prune worktrees'],
  triage: ['triage the board', "what's open", 'triage'],
  releasePrep: ['release prep', 'prepare a release', 'prep a release', 'cut a release'],
};

/** "anyway" and its neighbours — Decision 10's override token. */
export const COMPANION_ANYWAY_TOKENS = ['anyway', 'any way', 'do it anyway', 'go ahead'] as const;
/** Cancels the current utterance (Theme E's skippable speech). */
export const COMPANION_STOP_TOKENS = ['stop', 'be quiet', 'quiet', 'shut up', 'enough'] as const;
/** Declines an offer — the switch-repo offer is the only one today. */
export const COMPANION_DISMISS_TOKENS = [
  'no',
  'no thanks',
  'nope',
  'stay',
  'stay here',
  'this one',
  'never mind',
  'nevermind',
  'cancel',
] as const;
/** Asks for the last line again. */
export const COMPANION_REPEAT_TOKENS = [
  'repeat',
  'say that again',
  'again',
  'what was that',
  'come again',
] as const;

/**
 * Everything the companion (and, read-only, an MCP client) is allowed to
 * name — mirroring the palette's own split (Finding 2, Decision 2): views and
 * settings pages by id, commands by `CommandId`, plus the skills it may
 * start and the repos it may switch to.
 *
 * Built once per flow by `features/companion/vocabulary.ts`'s
 * `buildVocabulary` (pure, memoised on the repo list identity) from
 * `VIEW_IDS` × `app`'s `VIEW_LABELS`/`VIEW_KEYWORDS`, `SETTINGS_PAGES`,
 * `COMMANDS` × `COMMAND_ACCESS` (dropping `never`), `AGENT_COMMANDS` filtered
 * to `COMPANION_COMMAND_IDS`, and the open repos' names — never constructed
 * by hand. `parseIntent` reads it to recognise `navigate`/`run`; Theme E's
 * `ask` passes it to the headless router's prompt.
 */
export const CompanionVocabularySchema = z.object({
  views: z.array(
    z.object({
      id: z.enum(VIEW_IDS),
      label: z.string(),
      keywords: z.string(),
    }),
  ),
  settingsPages: z.array(
    z.object({
      id: z.enum(SETTINGS_PAGE_IDS),
      label: z.string(),
    }),
  ),
  /**
   * `id` is a plain `string`, not `z.enum(COMMAND_IDS)`: `COMMAND_IDS` is a
   * mapped array (`COMMANDS.map((c) => c.id)`), not a `const` tuple, so
   * `z.enum` cannot take it (the same reason the `run` intent below uses
   * `z.string().refine(isCommandId)`). Only `direct`/`confirm` rows appear —
   * a `never` command is not a word the companion knows.
   */
  commands: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      group: z.string(),
      access: z.enum(['direct', 'confirm']),
    }),
  ),
  skills: z.array(
    z.object({
      id: z.enum(COMPANION_COMMAND_IDS),
      label: z.string(),
      hint: z.string(),
    }),
  ),
  repos: z.array(z.string()),
  /**
   * The settings a `setting` intent may change (Phase 109 Theme C), built by
   * {@link companionSettingsVocabulary} from the spec table — never a second
   * hand-written list. `never`-tier keys are absent, and so are the two whose
   * spoken path belongs to a later theme (personality and About me to H's
   * interview, the active profile to G's profile commands).
   *
   * Optional so a vocabulary built before this field existed (a test fixture,
   * an older renderer) still parses, and the router's prompt reads exactly as
   * it did without one.
   */
  settings: z
    .array(
      z.object({
        key: z.enum(COMPANION_INTENT_SETTING_KEYS),
        label: z.string(),
        aliases: z.array(z.string()),
        /** The allowed values, described for a prompt — not a schema. */
        values: z.string(),
        tier: z.enum(['direct', 'confirm']),
        example: z.string(),
      }),
    )
    .optional(),
  /**
   * The saved persona profiles' names (Phase 109 Theme G), so a bare
   * "switch to Narrator" or "be Narrator" is a profile switch only when
   * Narrator is one — and the router can name them. Read live in `runtime.ts`
   * rather than cached with the rest, since saving one changes it.
   */
  profiles: z.array(z.string()).optional(),
  /**
   * Available agents and models for the router prompt (Phase 111 Theme B).
   * Optional so older vocabularies and fixtures without agents still parse cleanly.
   */
  agents: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        models: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
export type CompanionVocabulary = z.infer<typeof CompanionVocabularySchema>;

/**
 * Verbs for the `navigate` intent, longest/most-specific first within reason
 * — `hasPhrase`/`phraseSpan` are whole-word matches, so overlap between
 * entries ("show" is a substring of "show me") only matters for which one
 * strips more of the remainder, not for correctness. `switch to` is also
 * here (it is a navigation verb), but resolved specially in `parseIntent`:
 * repo name wins over a view name (Decision-adjacent, see the "switch to"
 * handling below).
 */
const NAVIGATE_VERBS = [
  'take me to',
  'bring up',
  'jump to',
  'switch to',
  'show me',
  'show',
  'go to',
  'open',
] as const;

/** "yes", spoken or typed, to a pending `confirm`-tier command (Theme C). */
export const COMPANION_CONFIRM_TOKENS = [
  'yes',
  'yeah',
  'go ahead',
  'do it',
  'confirm',
  'run it',
] as const;

/** Asks what the companion can do (Theme C's spoken/posted summary). */
export const COMPANION_HELP_TOKENS = [
  'what can you do',
  'help',
  'what do you know',
] as const;

/**
 * "Undo that" — puts the last settings change back (Phase 109 Theme E).
 * Whole utterances only, so "undo that commit" is not mistaken for one.
 */
export const COMPANION_UNDO_TOKENS = [
  'undo',
  'undo that',
  'undo it',
  'undo that change',
  'undo the last change',
  'put it back',
  'change it back',
  'set it back',
  'switch it back',
  'revert that',
  'revert it',
] as const;

/** Words dropped when reducing a `COMMANDS` label to its significant words. */
const LABEL_STOPWORDS = new Set(['the', 'a', 'an', 'to', 'in', 'on', 'of']);

/**
 * A command's label, reduced to the words that actually distinguish it —
 * parenthetical asides ("(Browser)") and slashes dropped, stopwords dropped.
 * `run`-intent matching tests that every one of these appears in the
 * utterance (in any order, not necessarily contiguous), so "toggle the
 * terminal" matches `terminal.toggle`'s "Toggle Terminal" despite the "the"
 * neither label carries.
 */
function labelWords(label: string): readonly string[] {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '' && !LABEL_STOPWORDS.has(word));
}

/**
 * The longest (most words) matching view or settings-page label/keyword
 * phrase in `remainder` — "longest wins" so a more specific phrase beats a
 * shorter one it contains ("commit graph" beats "graph" if both were ever to
 * collide). Returns `null` when nothing in the vocabulary matches.
 */
function longestViewMatch(
  remainder: string,
  views: CompanionVocabulary['views'],
): { id: ViewId } | null {
  let best: { id: ViewId; words: number } | null = null;
  for (const view of views) {
    // The whole label and each keyword word are candidates outright; the
    // view id itself is also a candidate — the id doubles as the one-word
    // spoken form for views whose label is longer than the word people
    // actually say ("graph" for the "Commit Graph" view, `id: 'graph'`).
    const candidates = [view.label, view.id, ...view.keywords.split(/\s+/)];
    for (const candidate of candidates) {
      if (candidate.trim() === '') continue;
      if (!hasPhrase(remainder, candidate)) continue;
      const words = candidate.trim().split(/\s+/).length;
      if (!best || words > best.words) best = { id: view.id, words };
    }
  }
  return best ? { id: best.id } : null;
}

/**
 * A settings page whose label — or one significant word of it — appears in
 * `remainder`, or `null`. The whole label wins over a single word of it
 * ("Git Safety" beats "Safety" if both matched), which is what the word-count
 * comparison below gives for free.
 */
function matchingSettingsPage(
  remainder: string,
  pages: CompanionVocabulary['settingsPages'],
): SettingsPageId | null {
  let best: { id: SettingsPageId; words: number } | null = null;
  for (const page of pages) {
    const candidates = [page.label, ...page.label.split(/\s+/)];
    for (const candidate of candidates) {
      if (!hasPhrase(remainder, candidate)) continue;
      const words = candidate.trim().split(/\s+/).length;
      if (!best || words > best.words) best = { id: page.id, words };
    }
  }
  return best ? best.id : null;
}

/** A repo whose name matches `name` case-insensitively — exact first, then whole-word containment. */
function matchingRepoName(name: string, repos: readonly string[]): string | null {
  const lower = name.trim().toLowerCase();
  if (lower === '') return null;
  const exact = repos.find((repo) => repo.toLowerCase() === lower);
  if (exact) return exact;
  const contained = repos.find((repo) => hasPhrase(name, repo));
  return contained ?? null;
}

/**
 * The `navigate` intent, tried per {@link NAVIGATE_VERBS} entry in order. Each
 * verb strips itself (plus a leading "me"/"the"/connective) off the front of
 * `bare` and hands the remainder to the target rules: a URL wins outright: an
 * `issue #N`/`number N` pattern sends to Issues with that issue; "settings"
 * plus a page word sends to that Settings page; otherwise the longest
 * matching view label/keyword wins. `switch to` alone also checks
 * `vocabulary.repos` first — a repo name wins over a view name, so "switch to
 * bilo-mono" and "switch to the graph" both work, and a repo actually called
 * `graph` wins the more specific noun.
 *
 * Returns `null` when a verb is found but no target resolves (so the caller
 * can keep trying — the shape "open the pod bay doors" needs to end in
 * `freeform`, not a phantom navigate) or when no verb matches at all.
 */
function tryNavigate(
  bare: string,
  vocabulary: CompanionVocabulary,
): Extract<CompanionIntent, { kind: 'navigate' }> | Extract<CompanionIntent, { kind: 'switchRepo' }> | null {
  for (const verb of NAVIGATE_VERBS) {
    const span = phraseSpan(bare, verb);
    if (span === null) continue;
    const remainder = bare
      .slice(span.end)
      .replace(/^\s*(?:me|over|the|to)\b\s*/i, '')
      .trim();
    if (remainder === '') continue;

    if (verb === 'switch to') {
      const repo = matchingRepoName(remainder, vocabulary.repos);
      if (repo) return { kind: 'switchRepo', name: repo };
    }

    const url = /\bhttps?:\/\/\S+/i.exec(remainder)?.[0]?.replace(/[.,!?;:]+$/g, '');
    if (url) return { kind: 'navigate', url };

    const issueMatch =
      /\bissue\s*#?\s*(\d+)\b/i.exec(remainder) ?? /\bnumber\s+(\d+)\b/i.exec(remainder);
    if (issueMatch?.[1]) return { kind: 'navigate', view: 'tasks', issue: Number(issueMatch[1]) };

    if (hasPhrase(remainder, 'settings')) {
      const page = matchingSettingsPage(remainder, vocabulary.settingsPages);
      return page ? { kind: 'navigate', view: 'settings', page } : { kind: 'navigate', view: 'settings' };
    }

    const view = longestViewMatch(remainder, vocabulary.views);
    if (view) return { kind: 'navigate', view: view.id };

    // A verb matched but nothing recognisable followed it — try the next
    // verb candidate rather than giving up on the whole utterance.
  }
  return null;
}

/**
 * The `run` intent: which `vocabulary.commands` row, if any, `bare` names.
 * Matches on the command's own label — reduced to its significant words via
 * {@link labelWords} — rather than a hand-authored verb table, since there is
 * one row per `CommandId` and authoring a synonym list for all seventy would
 * be the drift `COMMANDS` already exists to avoid. The candidate with the
 * most matched words wins ties (so "Toggle Terminal Half / Full Height" beats
 * "Toggle Terminal" when both match); a tie in word count keeps the first
 * (vocabulary/`COMMANDS`) order.
 */
function tryRun(bare: string, commands: CompanionVocabulary['commands']): string | null {
  let best: { id: string; words: number } | null = null;
  for (const command of commands) {
    const words = labelWords(command.label);
    if (words.length === 0) continue;
    if (!words.every((word) => hasPhrase(bare, word))) continue;
    if (!best || words.length > best.words) best = { id: command.id, words: words.length };
  }
  return best ? best.id : null;
}

/**
 * What the companion decided a line of input means.
 *
 * A zod schema and not just a type, because it crosses a boundary twice: the
 * headless router (`mstudio:companion:ask`) is asked to answer *in this shape*,
 * and a CLI's JSON is exactly the sort of input that has to be re-validated
 * before anything acts on it. `{kind:'freeform'}` is the honest fallback — it
 * is what the grammar returns when it recognised nothing, and it is where the
 * headless router gets its turn.
 */
export const CompanionIntentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('command'),
    id: z.enum(COMPANION_COMMAND_IDS),
    /** The remainder of the line after the verb — becomes the skill's argument. */
    body: z.string().optional(),
    /** "…anyway" — Decision 10's override of the one-live-hand-off rule. */
    override: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('switchRepo'),
    /** Matched case-insensitively against repo names; absent means "offer me the list". */
    name: z.string().optional(),
  }),
  z.object({ kind: z.literal('dismiss') }),
  z.object({ kind: z.literal('music'), on: z.boolean() }),
  z.object({ kind: z.literal('repeat') }),
  z.object({ kind: z.literal('stop') }),
  /** A bare "anyway" — re-run whatever the one-live-hand-off rule just declined. */
  z.object({ kind: z.literal('anyway') }),
  /**
   * "Take me to the graph." "Open settings, the companion page." "Show me
   * issue 212." `view` is optional rather than required, despite the phase
   * doc's own shorthand type writing it bare: the `url` case ("a URL is the
   * one target that is not a view") has no view at all, so the schema has to
   * allow that shape too. Theme B's `resolveNavigation` is what requires
   * "view or url, one of the two" at the type level.
   */
  z.object({
    kind: z.literal('navigate'),
    view: z.enum(VIEW_IDS).optional(),
    page: z.enum(SETTINGS_PAGE_IDS).optional(),
    issue: z.number().int().positive().optional(),
    url: z.string().optional(),
  }),
  /**
   * "Push." "Fetch." "New terminal." `id` is `z.string().refine(isCommandId)`
   * rather than `z.enum(COMMAND_IDS)`: `COMMAND_IDS` is a mapped array
   * (`COMMANDS.map((c) => c.id)`), not a `const` tuple, so `z.enum` cannot
   * take it (`keybindings.ts:499`'s own comment).
   */
  z.object({
    kind: z.literal('run'),
    id: z.string().refine(isCommandId, { message: 'not a known CommandId' }),
  }),
  /** "Yes." "Go ahead." Runs whatever `confirm`-tier command is pending (Theme C). */
  z.object({ kind: z.literal('confirm') }),
  /** "What can you do?" A spoken/posted summary built from the vocabulary (Theme C). */
  z.object({ kind: z.literal('help') }),
  /**
   * "Use voice Bella." "Volume 50." "Call me boss." (Phase 109 Theme C.)
   *
   * `key` is restricted to {@link COMPANION_INTENT_SETTING_KEYS}, so a
   * `never`-tier change cannot be expressed at all. `value` is checked against
   * the key's own value schema by the refinement below, per `op` — a
   * `discriminatedUnion` member has to be a plain object, and the value
   * schemas are declared further down this file than this union.
   */
  z.object({
    kind: z.literal('setting'),
    key: z.enum(COMPANION_INTENT_SETTING_KEYS),
    value: z.unknown(),
    op: z.enum(COMPANION_SETTING_OPS).optional(),
  }),
  /** "Undo that." "Put it back." One step, sixty seconds (Phase 109 Theme E). */
  z.object({ kind: z.literal('undoSetting') }),
  /**
   * "Save this as Narrator." "Switch to Narrator." "Delete the Narrator
   * profile." "What profiles do I have?" (Phase 109 Theme G.) `name` is the
   * profile as said, matched case-insensitively in `act()`; `list` has none.
   * A profile is a bundle of voice, personality and honorifics — never names,
   * so no profile command can change the wake word (Decision 5).
   */
  z.object({
    kind: z.literal('profile'),
    op: z.enum(COMPANION_PROFILE_OPS),
    name: z.string().trim().min(1).max(COMPANION_PROFILE_NAME_MAX).optional(),
  }),
  /**
   * "Turn yourself off." "Switch to web speech." A `never`-tier setting asked
   * for out loud — refused, with an offer to open Settings ▸ Companion.
   */
  z.object({ kind: z.literal('pageOnlySetting'), key: z.enum(COMPANION_PAGE_ONLY_SETTING_KEYS) }),
  /**
   * "Switch to Claude Opus." "Use Codex." "Set model to haiku." (Phase 111 Theme B.)
   * Changes the active primary agent and optional model.
   */
  z.object({
    kind: z.literal('switchAgent'),
    agentId: z.string(),
    modelId: z.string().nullable().optional(),
  }),
  z.object({ kind: z.literal('freeform'), text: z.string() }),
]).superRefine((intent, ctx) => {
  if (intent.kind !== 'setting') return;
  const problem = companionSettingIntentProblem(intent);
  if (problem !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: problem });
});
export type CompanionIntent = z.infer<typeof CompanionIntentSchema>;
export type CompanionSettingIntent = Extract<CompanionIntent, { kind: 'setting' }>;

/** Escape a spoken phrase into a regex source, treating any run of spaces as flexible. */
function phraseSource(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`).replace(/\s+/g, String.raw`\s+`);
}

/** Whole-word, case-insensitive, punctuation-tolerant containment. */
function hasPhrase(haystack: string, phrase: string): boolean {
  return new RegExp(
    String.raw`(^|[^\p{L}\p{N}])${phraseSource(phrase)}($|[^\p{L}\p{N}])`,
    'iu',
  ).test(haystack);
}

/** Where `phrase` starts and ends in `haystack`, or `null`. */
function phraseSpan(haystack: string, phrase: string): { start: number; end: number } | null {
  const match = new RegExp(
    String.raw`(^|[^\p{L}\p{N}])(${phraseSource(phrase)})($|[^\p{L}\p{N}])`,
    'iu',
  ).exec(haystack);
  if (!match) return null;
  const lead = (match[1] ?? '').length;
  const start = match.index + lead;
  return { start, end: start + (match[2] ?? '').length };
}

/**
 * Words that turn a noun into an instruction.
 *
 * The negative half of the grammar. "a swarm of bees" and "the backlog is a
 * diary" are sentences about swarms and backlogs; "start a swarm" is a
 * command. Rather than trying to blocklist the ways a noun can be used
 * innocently — an endless list — a short single-word verb like `swarm` is only
 * honoured when one of these appears before it, **or** when it is the first
 * word of the utterance, which is the imperative position: "refine phase 79"
 * is an instruction for exactly the reason "a swarm of bees" is not.
 * Multi-word phrases (`ad hoc task`, `pr review`) are specific enough to stand
 * alone and skip the check entirely.
 */
export const COMPANION_IMPERATIVES = [
  'start',
  'run',
  'launch',
  'kick off',
  'kickoff',
  'begin',
  'do',
  'open',
  'fire off',
  'spin up',
  'go',
  'please',
  'can you',
  'could you',
  'i want',
  'i need',
  "let's",
  'lets',
] as const;

/** Phrases short or common enough that they need an imperative to count as a command. */
function needsImperative(phrase: string): boolean {
  return !phrase.includes(' ') && phrase.length <= 10;
}

/**
 * Read a line of typed or spoken input.
 *
 * Pure, table-driven, and **deliberately shallow**: it recognises the verbs it
 * knows and hands everything else to `{kind:'freeform'}`, which is where the
 * headless router (Theme E) takes over. The alternative — a grammar that tried
 * to be clever — would be a second inference path built out of regexes, which
 * is the one thing this phase's guardrails rule out.
 *
 * Order of resolution, and why: the control words (`stop`, `anyway`, `repeat`,
 * a bare "no") are checked first *as whole utterances*, because those are the
 * ones a person says on their own and a command line containing them (`refine
 * anyway`) is handled by the `override` flag instead. Music next, because "no
 * music" would otherwise read as a dismissal. Commands next, in table order —
 * **existing skill verbs keep precedence** over everything Phase 81 adds.
 * `confirm`/`help`/`navigate`/`run` come next, and only when `vocabulary` is
 * supplied — with none, this function behaves exactly as it did before this
 * phase, so every pre-existing test is unaffected. Repo switching last, since
 * "switch to X" (when the grammar above did not already resolve it against a
 * repo or a view) is the fallback shape it always was.
 *
 * `vocabulary` is optional so a caller with no repos open yet (or a bare unit
 * test) gets the unchanged grammar rather than an empty one that recognises
 * nothing new.
 *
 * Phase 109 adds the settings phrases under the same `vocabulary` gate: "undo
 * that" and the anchored `setting`/`pageOnlySetting` phrases after
 * `confirm`/`help` and before `navigate` (so "switch to web speech" is not a
 * trip to the browser view), and a bare "switch to Bella" only after `navigate`
 * and `run` have both passed on it, and only when Bella is a voice. The one
 * exception to "after the skill verbs" is "turn elevator music off", which has
 * to beat the `music` check that would read it as "stop the music now".
 */
export function parseIntent(text: string, vocabulary?: CompanionVocabulary): CompanionIntent {
  const raw = text.trim();
  const bare = raw.replace(/[.!?,;:]+$/g, '').trim();
  const lower = bare.toLowerCase();

  if (bare === '') return { kind: 'freeform', text: raw };

  // Whole-utterance control words: an exact match rather than `hasPhrase`,
  // because these only count when they are the entire line — "stop the swarm"
  // is not a request for silence.
  if (COMPANION_STOP_TOKENS.some((token) => token === lower)) return { kind: 'stop' };
  if (COMPANION_REPEAT_TOKENS.some((token) => token === lower)) return { kind: 'repeat' };
  if (COMPANION_ANYWAY_TOKENS.some((token) => token === lower)) return { kind: 'anyway' };

  // Phase 109 Theme C: "turn elevator music off" changes the *offer*, and the
  // music check below would otherwise read it as "stop the music now".
  if (vocabulary) {
    const offer = tryMusicOfferSetting(settingsCore(bare));
    if (offer) return offer;
  }

  if (/\b(music|some tunes|elevator music)\b/i.test(lower)) {
    const off = /\b(no|off|stop|without|enough|mute)\b/i.test(lower);
    return { kind: 'music', on: !off };
  }

  if (COMPANION_DISMISS_TOKENS.some((token) => token === lower)) return { kind: 'dismiss' };

  const override = COMPANION_ANYWAY_TOKENS.some((token) => hasPhrase(lower, token));

  for (const id of COMPANION_COMMAND_IDS) {
    for (const phrase of COMPANION_VERBS[id]) {
      const span = phraseSpan(bare, phrase);
      if (span === null) continue;
      if (needsImperative(phrase) && span.start > 0) {
        // Imperative position (the very first word) counts as an imperative:
        // "refine phase 79" is an instruction and "a swarm of bees" is not,
        // and the difference is entirely where the word sits.
        const before = lower.slice(0, span.start);
        if (!COMPANION_IMPERATIVES.some((verb) => hasPhrase(before, verb))) continue;
      }
      return { kind: 'command', id, ...commandExtras(bare.slice(span.end), override) };
    }
  }

  if (vocabulary) {
    // `go ahead` is also a `COMPANION_ANYWAY_TOKENS` whole-utterance match
    // (checked above, unconditionally) — it never reaches here. Existing
    // control words keep precedence, so this row is unreachable by design;
    // the remaining confirm tokens ("yes", "yeah", "do it", "confirm",
    // "run it") are not affected.
    if (COMPANION_CONFIRM_TOKENS.some((token) => token === lower)) return { kind: 'confirm' };
    if (COMPANION_HELP_TOKENS.some((token) => token === lower)) return { kind: 'help' };

    // Phase 109 Theme G. Anchored like the settings phrases, and first among
    // them: a bare "switch to Narrator" or "be Narrator" is only a profile
    // switch when Narrator is a saved profile, which is a name the user chose.
    const profile = tryProfilePhrase(settingsCore(bare), vocabulary.profiles ?? []);
    if (profile) return profile;

    // Phase 109 Theme E, then C. Settings phrases are anchored whole-line
    // patterns, so they run before `navigate`: "switch to web speech" would
    // otherwise land on the browser view by its "web" keyword.
    if (COMPANION_UNDO_TOKENS.some((token) => token === settingsCore(lower))) {
      return { kind: 'undoSetting' };
    }
    const setting = trySettingPhrase(settingsCore(bare));
    if (setting) return setting;

    const navigated = tryNavigate(bare, vocabulary);
    if (navigated) return navigated;

    const runId = tryRun(bare, vocabulary.commands);
    // `tryRun` returns a plain `string` (`vocabulary.commands[].id` is not
    // typed as `CommandId` at the schema level — see `CompanionVocabularySchema`'s
    // own comment); `isCommandId` is a type predicate, so this both re-checks
    // the invariant `buildVocabulary` is supposed to hold and narrows the type
    // the `run` intent needs.
    if (runId !== null && isCommandId(runId)) return { kind: 'run', id: runId };

    // "Switch to Bella" — only once neither a repo nor a view took "switch
    // to", and only for a name that is actually a voice, so the repo-switch
    // fallback below keeps every sentence it had.
    const voice = tryBareVoiceSwitch(settingsCore(bare));
    if (voice) return voice;
  }

  // Phase 111 Theme B: Switch agent or model by natural phrasing.
  // Runs before repo switch fallback, and validates against known agents / models via resolveAgentAndModel.
  const agentSwitch = trySwitchAgent(settingsCore(bare));
  if (agentSwitch) return agentSwitch;

  const switchTo =
    /\b(?:switch|change|move|go|hop)\s+(?:over\s+)?to\s+(?:the\s+)?(.+)$/i.exec(bare) ??
    /\b(?:open|switch)\s+(?:the\s+)?(.+?)\s+repo(?:sitory)?\b/i.exec(bare);
  if (switchTo) {
    const name = (switchTo[1] ?? '')
      .replace(/\b(repo|repository|one|project)\b/gi, '')
      .replace(/[.!?,;:]+$/g, '')
      .trim();
    return name === '' ? { kind: 'switchRepo' } : { kind: 'switchRepo', name };
  }
  if (/^(?:switch|switch repos?|another repo|different repo|other repo)$/i.test(lower)) {
    return { kind: 'switchRepo' };
  }

  return { kind: 'freeform', text: raw };
}

/**
 * The optional half of a `command` intent: the argument and the override flag.
 *
 * Everything after the verb is the argument — "start an adhoc task to fix the
 * flaky spec" hands the skill "fix the flaky spec". Leading connectives are
 * dropped because they read as noise once the verb is gone; anything else is
 * passed through verbatim, since it is about to be typed into a prompt.
 */
function commandExtras(remainder: string, override: boolean): { body?: string; override?: true } {
  let body = remainder.replace(/^\s*(?:to|for|about|on|that|which|and)\b\s*/i, '').trim();
  for (const token of COMPANION_ANYWAY_TOKENS) {
    const span = phraseSpan(body, token);
    if (span) body = `${body.slice(0, span.start)}${body.slice(span.end)}`.trim();
  }
  body = body.replace(/^[,;:\s]+|[,;:\s]+$/g, '');
  return { ...(body === '' ? {} : { body }), ...(override ? { override: true } : {}) };
}

// --- Phase 109 Theme C · the settings grammar --------------------------------

/**
 * A line with the politeness taken off both ends — "okay, call me boss
 * please" is "call me boss". Case is kept, because a name or an honorific is
 * stored as it was said. Curly apostrophes become straight ones, which is how
 * whisper and a Mac keyboard disagree about "I'll".
 */
function settingsCore(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/\s*,\s*/g, ' ')
    .replace(/^(?:(?:please|ok|okay|hey|so|and|right|alright|now)\b[,\s]*)+/i, '')
    .replace(/(?:[,\s]+(?:please|thanks|thank you|now|from now on|instead))+$/i, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim();
}

type SettingIntent = Extract<CompanionIntent, { kind: 'setting' }>;

function settingIntent(key: CompanionIntentSettingKey, value: unknown, op: CompanionSettingOp = 'set'): SettingIntent {
  return op === 'set' ? { kind: 'setting', key, value } : { kind: 'setting', key, value, op };
}

/**
 * Words that start a clause, never a name: "call me back", "call me when the
 * build is done", "answer to the question". A payload that opens with one is
 * not a name, and the line goes on to the router instead.
 */
const NOT_A_NAME_START = new Set([
  'a', 'an', 'the', 'this', 'that', 'it', 'me', 'my', 'you', 'your', 'back', 'later', 'when', 'if',
  'after', 'before', 'at', 'about', 'on', 'in', 'once', 'tomorrow', 'today', 'tonight', 'again', 'up',
  'out', 'by', 'with', 'as', 'so', 'to', 'for', 'what', 'how', 'why', 'who', 'all', 'everything',
]);

/** A name or honorific as said — one to three words, quotes off — or `null` when it reads as a clause. */
function spokenName(raw: string): string | null {
  const name = raw.replace(/^["“'`]+|["”'`]+$/g, '').replace(/\s+/g, ' ').trim();
  if (name === '') return null;
  const words = name.split(' ');
  if (words.length > 3) return null;
  if (NOT_A_NAME_START.has((words[0] as string).toLowerCase())) return null;
  return name;
}

/** "fifty", "fifty five", "a hundred", "half" — the number words whisper writes out. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fourty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

/** A spoken volume as a percentage, or `null`. Digits, number words, "half", "max". */
function spokenPercent(raw: string): number | null {
  const text = raw.toLowerCase().replace(/\s*(?:%|percent|per cent)$/, '').replace(/-/g, ' ').trim();
  if (/^\d{1,3}$/.test(text)) return Number(text);
  if (text === 'half' || text === 'half way' || text === 'halfway') return 50;
  if (text === 'max' || text === 'maximum' || text === 'full' || text === 'full blast') return 100;
  const words = text.replace(/^(?:a|one)\s+(?=hundred$)/, '').split(/\s+/);
  let total = 0;
  for (const word of words) {
    const value = NUMBER_WORDS[word];
    if (value === undefined) return null;
    total += value;
  }
  return words.length > 0 && words.length <= 2 ? total : null;
}

/** "Bella" heard → which engine to look in. The grammar knows the Kokoro catalog; system voices only exist in the renderer. */
function voiceByName(name: string): SettingIntent | null {
  const heard = name.trim();
  if (heard === '' || /^(?:system|default|fallback|local|new|different|other)$/i.test(heard)) return null;
  if (matchVoice(heard, COMPANION_LOCAL_VOICES).kind !== 'none') {
    return settingIntent('companionVoices.local', heard, 'match');
  }
  // Not a Kokoro voice: maybe a system one, which only the renderer can list —
  // but only when what was heard reads as a name. "Use a British voice" is a
  // description, and the router is better placed to pick one for it.
  const asName = spokenName(heard);
  return asName === null ? null : settingIntent('companionVoices.system', asName, 'match');
}

const onOrOff = (word: string): boolean => /^on$/i.test(word.trim());

/** "turn elevator music off" — the offer setting, checked before the `music` intent. */
function tryMusicOfferSetting(core: string): SettingIntent | null {
  let match = /^(?:turn|switch)\s+(?:the\s+)?elevator\s+music\s+(on|off)$/i.exec(core);
  if (!match) match = /^(?:turn|switch)\s+(on|off)\s+(?:the\s+)?elevator\s+music$/i.exec(core);
  if (match) return settingIntent('companionMusicOffer', onOrOff(match[1] as string));
  if (/^(?:(?:stop|quit)\s+offering|(?:don't|do\s+not|never)\s+offer)\s+(?:me\s+)?(?:elevator\s+)?music(?:\s+again)?$/i.test(core)) {
    return settingIntent('companionMusicOffer', false);
  }
  if (/^(?:start\s+offering|offer)\s+(?:me\s+)?(?:elevator\s+)?music(?:\s+again)?$/i.test(core)) {
    return settingIntent('companionMusicOffer', true);
  }
  return null;
}

/**
 * A `never`-tier setting asked for by name: the companion's own switch, the
 * recognition engine, the speech provider, hands-free. Recognised only so the
 * refusal can offer the page; the intent cannot carry a value.
 */
function tryPageOnlySetting(core: string): Extract<CompanionIntent, { kind: 'pageOnlySetting' }> | null {
  const page = (key: CompanionPageOnlySettingKey) => ({ kind: 'pageOnlySetting' as const, key });
  if (
    /^(?:(?:turn|switch)\s+(?:yourself\s+off|off\s+yourself)|shut\s+(?:yourself\s+)?down|(?:disable|deactivate)\s+yourself|(?:turn|switch)\s+(?:the\s+)?companion\s+off|(?:turn|switch)\s+off\s+(?:the\s+)?companion|disable\s+(?:the\s+)?companion)$/i.test(
      core,
    )
  ) {
    return page('companionEnabled');
  }
  if (
    /^(?:use|switch\s+to|change\s+to|try)\s+(?:the\s+)?(?:web\s*speech|browser(?:'s)?\s+(?:built[\s-]?in\s+)?(?:speech(?:\s+recognition)?|recogni[sz]er|recognition))\b/i.test(core) ||
    /^(?:change|switch)\s+(?:the\s+|your\s+)?(?:speech\s+)?recognition\s+engine\b/i.test(core)
  ) {
    return page('companionSttEngine');
  }
  if (
    /^(?:use|switch\s+to|change\s+to|try)\s+(?:the\s+)?(?:deepgram|open\s?ai(?:\s+whisper)?|(?:offline|local)\s+whisper|whisper)\b/i.test(core) ||
    /^(?:change|switch)\s+(?:the\s+|your\s+)?(?:speech|transcription|stt)\s+provider\b/i.test(core)
  ) {
    return page('companionSttProvider');
  }
  if (
    /^(?:(?:turn|switch)\s+(?:on|off)\s+hands[\s-]?free(?:\s+run)?|(?:turn|switch)\s+hands[\s-]?free(?:\s+run)?\s+(?:on|off)|(?:enable|disable|allow)\s+hands[\s-]?free(?:\s+run)?|hands[\s-]?free(?:\s+run)?\s+(?:on|off))$/i.test(
      core,
    )
  ) {
    return page('companionHandsFree');
  }
  return null;
}

/**
 * The deterministic settings phrases (Phase 109 Theme C), each anchored to the
 * whole line so a sentence that merely *mentions* a voice or a name is left
 * for the router. Returns `null` when nothing matched, or when a payload reads
 * as a clause rather than a name ("call me back").
 */
function trySettingPhrase(core: string): CompanionIntent | null {
  if (core === '') return null;

  const pageOnly = tryPageOnlySetting(core);
  if (pageOnly) return pageOnly;

  const offer = tryMusicOfferSetting(core);
  if (offer) return offer;

  let match: RegExpExecArray | null;

  // --- voice ---
  if (/^(?:use|go\s+back\s+to|switch\s+(?:back\s+)?to)\s+(?:your\s+|the\s+)?default\s+voice$/i.test(core)) {
    return settingIntent('companionVoices.local', null);
  }
  match = /^(?:use|try|pick|switch\s+to|change\s+to)\s+(?:the\s+|a\s+)?(?:system|fallback|os)\s+voice\s+(?:called\s+|named\s+)?(.+)$/i.exec(core);
  if (match) return settingIntent('companionVoices.system', (match[1] as string).trim(), 'match');
  match =
    /^(?:use|try|pick|switch\s+to|change\s+to)\s+(?:the\s+|a\s+)?(?:local\s+|kokoro\s+)?voice\s+(?:called\s+|named\s+)?(.+)$/i.exec(core) ??
    /^(?:change|switch|set)\s+(?:your\s+|the\s+)?voices?\s+to\s+(.+)$/i.exec(core) ??
    /^(?:use|try|pick|switch\s+to)\s+(?:the\s+)?(.+?)(?:'s)?\s+voice$/i.exec(core);
  if (match) {
    const voice = voiceByName(match[1] as string);
    if (voice) return voice;
  }

  // --- volume ---
  match = /^(?:set\s+|turn\s+)?(?:the\s+|your\s+)?volume\s+(?:to\s+|at\s+)?(.+)$/i.exec(core);
  if (match && !/^(?:up|down)$/i.test((match[1] as string).trim())) {
    const percent = spokenPercent(match[1] as string);
    if (percent !== null && percent >= 0 && percent <= 100) {
      return settingIntent('companionVolume', percent / 100);
    }
  }
  match =
    /^(?:turn\s+)?(?:the\s+|your\s+)?volume\s+(up|down)$/i.exec(core) ??
    /^(?:(?:a\s+)?(?:bit|little|tad)\s+|be\s+|go\s+|get\s+|slightly\s+|turn\s+it\s+)*(louder|quieter|softer|up|down)$/i.exec(core);
  if (match && !(/^(?:up|down)$/i.test(match[1] as string) && !/volume|turn\s+it/i.test(core))) {
    const louder = /^(?:louder|up)$/i.test(match[1] as string);
    return settingIntent('companionVolume', louder ? 0.1 : -0.1, 'step');
  }

  // --- what it calls you ---
  match =
    /^(?:stop|quit)\s+calling\s+me\s+(.+)$/i.exec(core) ??
    /^(?:don't|do\s+not|never)\s+call\s+me\s+(.+)$/i.exec(core);
  if (match) {
    const name = spokenName(match[1] as string);
    return name === null ? null : settingIntent('companionHonorifics', name, 'remove');
  }
  match = /^call\s+me\s+(.+)$/i.exec(core);
  if (match) {
    const name = spokenName(match[1] as string);
    return name === null ? null : settingIntent('companionHonorifics', name, 'add');
  }

  // --- what you call it (the wake words) ---
  match =
    /^(?:stop|quit)\s+(?:answering|responding)\s+to\s+(.+)$/i.exec(core) ??
    /^(?:don't|do\s+not)\s+(?:answer|respond)\s+to\s+(.+)$/i.exec(core);
  if (match) {
    const name = spokenName(match[1] as string);
    return name === null ? null : settingIntent('companionNames', name, 'remove');
  }
  match =
    /^(?:i'?ll|i\s+will|ill)\s+call\s+you\s+(.+)$/i.exec(core) ??
    /^(?:answer|respond)\s+to\s+(.+)$/i.exec(core) ??
    /^your\s+(?:new\s+)?name\s+is\s+(.+)$/i.exec(core);
  if (match) {
    const name = spokenName(match[1] as string);
    return name === null ? null : settingIntent('companionNames', name, 'add');
  }

  // --- speaking aloud ---
  if (
    /^(?:(?:stop|quit)\s+(?:talking|speaking)\s+(?:out\s+loud|aloud|out)|(?:don't|do\s+not)\s+(?:talk|speak)\s+(?:out\s+loud|aloud)(?:\s+anymore)?|(?:mute|silence)\s+yourself|(?:turn|switch)\s+off\s+(?:your\s+)?(?:voice|speech)|disable\s+(?:your\s+)?(?:voice|speech)|text\s+only)$/i.test(
      core,
    )
  ) {
    return settingIntent('companionSpeakAloud', false);
  }
  if (
    /^(?:(?:speak|talk)\s+(?:out\s+loud|aloud)(?:\s+again)?|(?:start|resume)\s+(?:talking|speaking)(?:\s+(?:out\s+loud|aloud))?(?:\s+again)?|unmute(?:\s+yourself)?|(?:turn|switch)\s+on\s+(?:your\s+)?(?:voice|speech)|enable\s+(?:your\s+)?(?:voice|speech))$/i.test(
      core,
    )
  ) {
    return settingIntent('companionSpeakAloud', true);
  }

  // --- the mic button ---
  if (
    /^(?:(?:use|switch\s+to|set\s+the\s+mic\s+to|make\s+(?:it|the\s+mic))\s+)?(?:push|hold)[\s-]+to[\s-]+talk(?:\s+mode)?$/i.test(core)
  ) {
    return settingIntent('companionMicMode', 'push');
  }
  if (
    /^(?:toggle\s+the\s+mic|(?:use\s+|switch\s+to\s+)?tap\s+to\s+toggle|make\s+the\s+mic\s+(?:a\s+)?toggle|toggle\s+mode)$/i.test(core)
  ) {
    return settingIntent('companionMicMode', 'toggle');
  }

  // --- conversation mode ---
  match =
    /^(?:(?:turn|switch)\s+)?conversation\s+mode\s+(on|off)$/i.exec(core) ??
    /^(?:turn|switch)\s+(on|off)\s+conversation\s+mode$/i.exec(core);
  if (match) return settingIntent('voiceConversation', onOrOff(match[1] as string));
  if (/^(?:start|enable|enter)\s+conversation\s+mode$/i.test(core)) return settingIntent('voiceConversation', true);
  if (/^(?:stop|end|exit|leave|disable)\s+conversation\s+mode$/i.test(core)) {
    return settingIntent('voiceConversation', false);
  }
  if (/^(?:only\s+)?listen\s+(?:only\s+)?for\s+(?:your\s+name|the\s+wake\s+word|my\s+wake\s+word)$/i.test(core)) {
    return settingIntent('voiceConversationTrigger', 'wake');
  }
  if (/^(?:listen\s+to\s+everything|(?:take|answer)\s+every\s+phrase)$/i.test(core)) {
    return settingIntent('voiceConversationTrigger', 'always');
  }

  return null;
}

/** "Switch to Bella", "use Bella" — a voice by name alone, only when the name *is* a Kokoro voice. */
function tryBareVoiceSwitch(core: string): SettingIntent | null {
  const match = /^(?:switch|change)\s+(?:over\s+)?to\s+(.+)$/i.exec(core) ?? /^use\s+(.+)$/i.exec(core);
  if (!match) return null;
  const heard = match[1] as string;
  if (matchVoice(heard, COMPANION_LOCAL_VOICES).kind === 'none') return null;
  return settingIntent('companionVoices.local', heard.trim(), 'match');
}

type ProfileIntent = Extract<CompanionIntent, { kind: 'profile' }>;

/**
 * A profile name as said: quotes and a leading article off, a trailing
 * "profile" or "persona" off, one to four words, never a clause.
 */
function spokenProfileName(raw: string): string | null {
  const name = raw
    .replace(/^["“'`]+|["”'`]+$/g, '')
    .replace(/^(?:the|my|a|an|your)\s+/i, '')
    .replace(/\s+(?:profile|persona)$/i, '')
    .replace(/^["“'`]+|["”'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name === '' || name.length > COMPANION_PROFILE_NAME_MAX) return null;
  const words = name.split(' ');
  if (words.length > 4) return null;
  if (NOT_A_NAME_START.has((words[0] as string).toLowerCase())) return null;
  return name;
}

/** `heard` against the saved names, case-insensitively, articles off — the saved spelling, or `null`. */
function knownProfileName(heard: string, profiles: readonly string[]): string | null {
  const name = spokenProfileName(heard);
  if (name === null) return null;
  return profiles.find((saved) => saved.trim().toLowerCase() === name.toLowerCase()) ?? null;
}

/**
 * "Save this as Narrator", "switch to Narrator", "be Narrator", "delete the
 * Narrator profile", "what profiles do I have?" (Phase 109 Theme G).
 *
 * A phrase that says "profile" or "persona" is a profile command whatever the
 * name, so "switch to the Pirate profile" with no Pirate gets "I don't have a
 * profile called Pirate" rather than a trip to some view. A bare "switch to
 * X", "be X" or "become X" is one only when X is in `profiles`, so every
 * sentence those verbs already meant — a voice, a view, a repo, "be quieter" —
 * keeps meaning it.
 */
function tryProfilePhrase(core: string, profiles: readonly string[]): ProfileIntent | null {
  if (core === '') return null;
  const noun = String.raw`(?:profiles|personas)`;

  // --- list ---
  if (
    new RegExp(String.raw`^(?:what|which)\s+${noun}\s+(?:do\s+(?:i|you|we)\s+have|have\s+(?:i|you|we)\s+(?:got|saved)|are\s+there|(?:are\s+)?saved)$`, 'i').test(core) ||
    new RegExp(String.raw`^(?:list|show(?:\s+me)?|tell\s+me|read(?:\s+me)?)\s+(?:all\s+)?(?:my\s+|your\s+|the\s+)?(?:saved\s+)?${noun}$`, 'i').test(core) ||
    new RegExp(String.raw`^(?:my|your)\s+${noun}$`, 'i').test(core)
  ) {
    return { kind: 'profile', op: 'list' };
  }

  let match: RegExpExecArray | null;

  // --- save ---
  match =
    /^(?:save|store|keep|remember)\s+(?:this|that|it|yourself|you|how\s+you\s+(?:are|sound)|(?:this|the\s+current|your\s+current|your)\s+(?:setup|set\s+up|voice|persona|profile|personality|one|settings))(?:\s+now)?\s+as\s+(?:a\s+(?:new\s+)?(?:profile|persona)\s+)?(?:called\s+|named\s+)?(.+)$/i.exec(core) ??
    /^(?:save|create|make)\s+(?:a\s+)?(?:new\s+)?(?:profile|persona)\s+(?:called\s+|named\s+)?(.+)$/i.exec(core);
  if (match) {
    const name = spokenProfileName(match[1] as string);
    return name === null ? null : { kind: 'profile', op: 'save', name };
  }

  // --- delete ---
  match =
    /^(?:delete|remove|forget|drop|get\s+rid\s+of)\s+(?:the\s+|my\s+|your\s+)?(?:profile|persona)\s+(?:called\s+|named\s+)?(.+)$/i.exec(core) ??
    /^(?:delete|remove|forget|drop|get\s+rid\s+of)\s+(.+?)\s+(?:profile|persona)$/i.exec(core);
  if (match) {
    const name = spokenProfileName(match[1] as string);
    return name === null ? null : { kind: 'profile', op: 'delete', name };
  }

  // --- switch, naming "profile" ---
  match =
    /^(?:switch|change|go|go\s+back)\s+(?:over\s+|back\s+)?to\s+(?:the\s+|my\s+)?(?:profile|persona)\s+(?:called\s+|named\s+)?(.+)$/i.exec(core) ??
    /^(?:switch|change|go|go\s+back)\s+(?:over\s+|back\s+)?to\s+(.+?)\s+(?:profile|persona)$/i.exec(core) ??
    /^(?:use|load|activate|apply|pick)\s+(?:the\s+|my\s+)?(?:profile|persona)\s+(?:called\s+|named\s+)?(.+)$/i.exec(core) ??
    /^(?:use|load|activate|apply|pick)\s+(.+?)\s+(?:profile|persona)$/i.exec(core);
  if (match) {
    const name = spokenProfileName(match[1] as string);
    if (name === null) return null;
    return { kind: 'profile', op: 'switch', name: knownProfileName(name, profiles) ?? name };
  }

  // --- switch, by a saved name alone ---
  match =
    /^(?:switch|change|go|go\s+back)\s+(?:over\s+|back\s+)?to\s+(?:being\s+)?(.+)$/i.exec(core) ??
    /^(?:be|become)\s+(.+?)(?:\s+again)?$/i.exec(core) ??
    /^(?:talk|sound|speak)\s+like\s+(.+?)(?:\s+again)?$/i.exec(core);
  if (match) {
    const name = knownProfileName(match[1] as string, profiles);
    if (name !== null) return { kind: 'profile', op: 'switch', name };
  }

  return null;
}

type SwitchAgentIntent = Extract<CompanionIntent, { kind: 'switchAgent' }>;

/**
 * Phase 111 Theme B: Matches natural phrases for switching agents and models.
 * Examples:
 * - "switch to <agent>", "use <agent>", "switch primary agent to <agent>"
 * - "use <agent> with <model>", "switch to <agent> with <model>"
 * - "change model to <model>", "set model to <model>", "use model <model>"
 */
function trySwitchAgent(core: string): SwitchAgentIntent | null {
  if (core === '') return null;

  // 1. Agent + Model: "use <agent> with <model>", "switch to <agent> with <model>", "set agent to <agent> with model <model>"
  const withModelMatch =
    /^(?:switch|change|set)\s+(?:(?:over\s+)?to|primary\s+agent\s+to|agent\s+to)?\s*(.+?)\s+with\s+(?:model\s+)?(.+)$/i.exec(core) ??
    /^(?:use|pick|choose)\s+(.+?)\s+with\s+(?:model\s+)?(.+)$/i.exec(core);

  if (withModelMatch) {
    const rawAgent = (withModelMatch[1] as string).replace(/^(?:the\s+agent\s+|the\s+|agent\s+)/i, '').trim();
    const rawModel = (withModelMatch[2] as string).replace(/^(?:the\s+model\s+|model\s+|the\s+)/i, '').trim();
    const resolved = resolveAgentAndModel(rawAgent, rawModel);
    if (!('error' in resolved)) {
      return {
        kind: 'switchAgent',
        agentId: resolved.agentId,
        modelId: resolved.modelId,
      };
    }
  }

  // 2. Model-only phrasing: "change model to <model>", "set model to <model>", "use model <model>", "switch model to <model>"
  const modelOnlyMatch =
    /^(?:change|set|switch)\s+(?:my\s+|the\s+)?model\s+to\s+(.+)$/i.exec(core) ??
    /^(?:use|try|pick|choose)\s+model\s+(.+)$/i.exec(core);

  if (modelOnlyMatch) {
    const rawModel = (modelOnlyMatch[1] as string).trim();
    // Resolving model-only: search known models across all agents, preferring the model match
    const candidateAgents = ['claude', 'codex', 'agy', 'cursor', 'ollama'];
    for (const agentId of candidateAgents) {
      const resolved = resolveAgentAndModel(agentId, rawModel);
      if (!('error' in resolved) && resolved.modelId !== null) {
        return {
          kind: 'switchAgent',
          agentId: resolved.agentId,
          modelId: resolved.modelId,
        };
      }
    }
  }

  // 3. Agent-only or composite phrasing:
  // "switch to <agent>", "use <agent>", "switch primary agent to <agent>", "set agent to <agent>"
  const agentMatch =
    /^(?:switch|change)\s+(?:primary\s+agent\s+to|agent\s+to|(?:over\s+)?to\s+primary\s+agent|(?:over\s+)?to\s+agent|(?:over\s+)?to)\s+(.+)$/i.exec(core) ??
    /^(?:set)\s+(?:primary\s+agent|agent)\s+to\s+(.+)$/i.exec(core) ??
    /^(?:use|pick|choose)\s+(?:primary\s+agent\s+|agent\s+)?(.+)$/i.exec(core);

  if (agentMatch) {
    const target = (agentMatch[1] as string).replace(/^(?:the\s+agent\s+|the\s+|agent\s+)/i, '').trim();
    // Check if target is composite like "claude opus" or "claude sonnet 5.5"
    const words = target.split(/\s+/);
    if (words.length > 1) {
      const firstWord = words[0] as string;
      const rest = words.slice(1).join(' ');
      const resComposite = resolveAgentAndModel(firstWord, rest);
      if (!('error' in resComposite)) {
        return {
          kind: 'switchAgent',
          agentId: resComposite.agentId,
          modelId: resComposite.modelId,
        };
      }
    }

    // Try target as agent name alone
    const resAgent = resolveAgentAndModel(target);
    if (!('error' in resAgent)) {
      return {
        kind: 'switchAgent',
        agentId: resAgent.agentId,
        modelId: resAgent.modelId,
      };
    }
  }

  return null;
}

/**
 * The names a user may address the companion by. At least one — deleting the
 * last one is blocked at the settings-page call site, not enforced by
 * emptying the array, so this schema's `.min(1)` is the shape invariant that
 * makes "zero names" unrepresentable in the first place.
 */
export const CompanionNamesSchema = z.array(z.string().trim().min(1)).min(1);

/** Escape a literal string for use inside a `RegExp`. */
function escapeNameForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does the companion's name — any of its names — appear as a whole word or
 * whole utterance in `text`?
 *
 * A whole-word test, never a substring one: "Moses" must not match a
 * companion named "Mo". Case-insensitive and trimmed, since a user typing or
 * an STT transcript capitalizing "companion" mid-sentence is not a different
 * name. Validation of the `names` array itself — no empty strings, no
 * case-insensitive duplicates — is the settings page's job on write; this
 * matcher only reads what it's given.
 */
export function matchesCompanionName(text: string, names: readonly string[]): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  return names.some((name) => {
    const needle = name.trim();
    if (needle === '') return false;
    const pattern = new RegExp(`\\b${escapeNameForRegExp(needle)}\\b`, 'i');
    return pattern.test(trimmed);
  });
}

/**
 * What starts a conversation-mode turn (Settings ▸ Companion ▸ Microphone).
 * `always`: every phrase the open mic hears is sent. `wake`: only a phrase
 * that begins with one of `companionNames` — the wake word — is acted on.
 */
export const VOICE_CONVERSATION_TRIGGERS = ['always', 'wake'] as const;
export type VoiceConversationTrigger = (typeof VOICE_CONVERSATION_TRIGGERS)[number];

/** Openers a wake word may follow: "hey Companion", "ok Companion". */
const WAKE_OPENERS = ['hey', 'hi', 'hello', 'ok', 'okay', 'yo'];
/** What may sit between an opener, the name and the command: spaces and the punctuation STT adds, dashes included. */
const WAKE_SEPARATORS = '[\\s,.!?:;\\-\\u2013\\u2014]';

export type WakePhrase =
  | { woke: false }
  /** `command` is what followed the name — `''` when the name was said on its own. */
  | { woke: true; command: string };

/**
 * Was this phrase addressed to the companion, and what was asked?
 *
 * The wake word is any of the user's `companionNames`, at the **start** of
 * the phrase (after an optional "hey"/"ok"), as a whole word — the same
 * whole-word, case-insensitive rule as {@link matchesCompanionName}, which
 * deliberately matches anywhere and so cannot be used here: "I told the
 * companion yesterday" mentions the name without saying it to anybody.
 * Punctuation an STT engine puts around a spoken name ("Hey, Companion.
 * Open the pull request.") is skipped, and the longest matching name wins,
 * so "Mo" never claims "Mo Salah, …" from a user who has both.
 */
export function parseWakePhrase(text: string, names: readonly string[]): WakePhrase {
  const trimmed = text.trim();
  if (trimmed === '') return { woke: false };
  const candidates = names
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .sort((a, b) => b.length - a.length);
  const openers = WAKE_OPENERS.join('|');
  for (const name of candidates) {
    const pattern = new RegExp(
      `^(?:(?:${openers})${WAKE_SEPARATORS}+)?${escapeNameForRegExp(name)}\\b${WAKE_SEPARATORS}*([\\s\\S]*)$`,
      'i',
    );
    const match = pattern.exec(trimmed);
    if (match) return { woke: true, command: (match[1] ?? '').trim() };
  }
  return { woke: false };
}

/**
 * What the companion calls the user — Ad Hoc: "What it calls you" gained the
 * same closable-pill design `companionNames` already has ("What you call
 * it"), one step lighter. **No `.min(1)`** here, unlike
 * `CompanionNamesSchema`: an empty honorific was always the default (nobody
 * to pick collapses to `interpolatePhrase`'s already-correct empty-honorific
 * path), so "zero honorifics" has to stay representable rather than forcing
 * a placeholder nobody chose.
 */
export const CompanionHonorificsSchema = z.array(z.string().trim().min(1));

/**
 * A cap shared by the two free-text companion fields below — a few thousand
 * characters is ample for a paragraph or two of prose describing a
 * personality or a person, and it keeps either field from becoming a way to
 * blow out `ask.ts`'s system prompt (and the model's context behind it) with
 * a pasted document.
 */
const COMPANION_FREE_TEXT_MAX_CHARS = 4000;

/**
 * Free text describing how the companion should behave — its tone, its
 * quirks — layered onto `ask.ts`'s system prompts alongside "What you call
 * it"/"What it calls you" (Settings ▸ Companion ▸ Personality). Optional and
 * `''` by default, same as `CompanionHonorificsSchema`: an unset value must
 * not add a line to the prompt (`buildAskPrompt`'s empty case), not be
 * rendered as an empty header.
 *
 * `.trim()` so a field of only whitespace collapses to the same "not set"
 * the empty string already means, rather than surviving as a blank line in
 * the prompt.
 */
export const CompanionPersonalitySchema = z.string().trim().max(COMPANION_FREE_TEXT_MAX_CHARS);

/**
 * Free text the user writes about themselves, so `ask.ts`'s prompts have
 * context on who they're talking to. Same shape, same cap, same empty-means-
 * unset default as {@link CompanionPersonalitySchema} — the two fields differ
 * in whose voice they describe, not in how they're validated.
 */
export const CompanionAboutUserSchema = z.string().trim().max(COMPANION_FREE_TEXT_MAX_CHARS);

// --- Phase 109 · one settings list -------------------------------------------

/**
 * The companion volume, 0–1, clamped rather than refused — the same clamp
 * `setCompanionVolume` (`ui-store.ts`) has always applied, so "volume 150"
 * lands on full rather than on an error.
 */
export const CompanionVolumeSchema = z
  .number()
  .finite()
  .transform((value) => Math.min(1, Math.max(0, value)));

/**
 * A voice choice per engine — {@link CompanionVoiceSelection} as a schema.
 *
 * `local` falls back to `null` (Heart) on an id the catalog no longer has,
 * rather than failing the whole slice: a stored id can predate a catalog
 * change, the reason {@link isCompanionLocalVoiceId} exists. Setting the key
 * on its own is strict ({@link COMPANION_SETTING_VALUE_SCHEMAS}), so a new
 * unknown id is refused, never stored.
 */
export const CompanionVoiceSelectionSchema = z.object({
  system: z.string().min(1).nullable(),
  local: CompanionLocalVoiceIdSchema.nullable().catch(null),
});

/** How many persona profiles the store keeps (Theme G). */
export const COMPANION_PROFILES_MAX = 20;

/**
 * A named bundle of voice, personality and honorifics (Phase 109 Theme G).
 *
 * **Names are deliberately absent** (Decision 5): names are the wake words, so
 * a profile switch must never change what you say to wake the companion.
 * Declared in Theme A because the v32 migration seeds `companionProfiles`
 * and the slice schema below has to type it. Saving, switching and deleting
 * are Theme G's: `companion-profiles.ts` (shared) and
 * `app/features/companion/profiles.ts`.
 */
export const CompanionProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(COMPANION_PROFILE_NAME_MAX),
  voices: CompanionVoiceSelectionSchema,
  personality: CompanionPersonalitySchema,
  honorifics: CompanionHonorificsSchema,
  /** ISO-8601, from `new Date().toISOString()`. */
  createdAt: z.string().datetime(),
});
export type CompanionProfile = z.infer<typeof CompanionProfileSchema>;

/**
 * One value schema per settable key — what {@link parseCompanionSettingValue}
 * checks a single change against, and what {@link CompanionSettingsSchema}
 * below is built from, so the two cannot disagree about a value.
 *
 * Strict where the slice is tolerant: `companionVoices.local` refuses an id
 * the catalog doesn't have, where the slice quietly maps a stale stored one to
 * the default.
 */
export const COMPANION_SETTING_VALUE_SCHEMAS = {
  companionEnabled: z.boolean(),
  companionSttEngine: CompanionSttEngineSchema,
  companionSttProvider: SttProviderIdSchema.nullable(),
  companionHandsFree: z.boolean(),
  companionSpeakAloud: z.boolean(),
  companionNames: CompanionNamesSchema,
  companionMicMode: CompanionMicModeSchema,
  voiceConversation: z.boolean(),
  voiceConversationTrigger: z.enum(VOICE_CONVERSATION_TRIGGERS),
  companionPersonality: CompanionPersonalitySchema,
  companionAboutUser: CompanionAboutUserSchema,
  'companionVoices.local': CompanionLocalVoiceIdSchema.nullable(),
  'companionVoices.system': CompanionVoiceSelectionSchema.shape.system,
  companionVolume: CompanionVolumeSchema,
  companionHonorifics: CompanionHonorificsSchema,
  companionMusicOffer: z.boolean(),
  companionActiveProfile: z.string().min(1).max(128).nullable(),
} as const satisfies Record<CompanionSettingKey, z.ZodTypeAny>;

/**
 * Every persisted companion key in `midnite-studio.ui`, as one zod object
 * (Phase 109 Theme A) — the companion slice of `PersistedUi` had no schema
 * before this, only enum constants and `CompanionNamesSchema`.
 *
 * Each default is the store's own fresh-install value and each clamp is the
 * one the store applies; `settings-apply.test.ts` (app) asserts the store's
 * default state parses under this and that the two agree on every default.
 * **The store keeps its own `partialize` and `migrate`** — this is the
 * contract the setter and the `companion_settings_*` MCP tools validate
 * against, not a replacement for persistence.
 *
 * `companionSttProvider`, `companionProfiles` and `companionActiveProfile`
 * are the phase's three new keys, all seeded by the one v31 → v32 migration.
 */
export const CompanionSettingsSchema = z.object({
  companionEnabled: COMPANION_SETTING_VALUE_SCHEMAS.companionEnabled.default(false),
  companionHandsFree: COMPANION_SETTING_VALUE_SCHEMAS.companionHandsFree.default(false),
  companionHonorifics: COMPANION_SETTING_VALUE_SCHEMAS.companionHonorifics.default([]),
  companionNames: COMPANION_SETTING_VALUE_SCHEMAS.companionNames.default(['Companion']),
  companionPersonality: COMPANION_SETTING_VALUE_SCHEMAS.companionPersonality.default(''),
  companionAboutUser: COMPANION_SETTING_VALUE_SCHEMAS.companionAboutUser.default(''),
  companionVoices: CompanionVoiceSelectionSchema.default({ system: null, local: null }),
  companionSpeakAloud: COMPANION_SETTING_VALUE_SCHEMAS.companionSpeakAloud.default(true),
  companionMusicOffer: COMPANION_SETTING_VALUE_SCHEMAS.companionMusicOffer.default(true),
  companionVolume: COMPANION_SETTING_VALUE_SCHEMAS.companionVolume.default(DEFAULT_COMPANION_VOLUME),
  companionMicMode: COMPANION_SETTING_VALUE_SCHEMAS.companionMicMode.default('push'),
  companionSttEngine: COMPANION_SETTING_VALUE_SCHEMAS.companionSttEngine.default('server'),
  companionSttProvider: COMPANION_SETTING_VALUE_SCHEMAS.companionSttProvider.default(null),
  voiceConversation: COMPANION_SETTING_VALUE_SCHEMAS.voiceConversation.default(false),
  voiceConversationTrigger: COMPANION_SETTING_VALUE_SCHEMAS.voiceConversationTrigger.default('always'),
  companionProfiles: z.array(CompanionProfileSchema).max(COMPANION_PROFILES_MAX).default([]),
  companionActiveProfile: COMPANION_SETTING_VALUE_SCHEMAS.companionActiveProfile.default(null),
});
export type CompanionSettings = z.infer<typeof CompanionSettingsSchema>;

/** The value each settable key holds, voice selection split per engine. */
export type CompanionSettingValues = {
  [K in CompanionSettingKey]: z.output<(typeof COMPANION_SETTING_VALUE_SCHEMAS)[K]>;
};

/*
  The key list above `CompanionIntentSchema` and this schema must name the same
  settings: every slice key except the two that are not set field by field
  (`companionVoices`, split per engine; `companionProfiles`, Theme G's whole-
  profile commands). A key added to one and not the other fails to typecheck
  here, which is what makes `COMPANION_SETTING_SPECS` below total over the
  store's companion keys and not just over a list someone remembered to edit.
*/
type SliceSettingKey =
  | Exclude<keyof CompanionSettings, 'companionVoices' | 'companionProfiles'>
  | `companionVoices.${CompanionVoiceEngine}`;
type AssertSettingKeysMatchSlice = [SliceSettingKey] extends [CompanionSettingKey]
  ? [CompanionSettingKey] extends [SliceSettingKey]
    ? true
    : never
  : never;
const _assertSettingKeysMatchSlice: AssertSettingKeysMatchSlice = true;

/** Parse one change's value against its key — the setter's `invalid` check. */
export function parseCompanionSettingValue<K extends CompanionSettingKey>(
  key: K,
  value: unknown,
): { ok: true; value: CompanionSettingValues[K] } | { ok: false; message: string } {
  const schema = COMPANION_SETTING_VALUE_SCHEMAS[key] as unknown as z.ZodType<
    CompanionSettingValues[K],
    z.ZodTypeDef,
    unknown
  >;
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid value.' };
}

/** Where a change came from. Tiers bind `voice` and `mcp`; the page's click is its own consent. */
export type CompanionSettingSource = 'voice' | 'mcp' | 'page';

/**
 * What kind of value a setting takes — enough for a router prompt, an MCP
 * listing or a page hint to describe the allowed values without a schema.
 *
 * `nullable` marks the keys where `null` is a real choice rather than an
 * absence: the default local voice (Heart), the system default voice, the
 * automatic STT provider, and no active profile.
 */
export type CompanionSettingValueKind =
  | { kind: 'bool' }
  | {
      kind: 'enum';
      values: readonly string[];
      /** How each value is said aloud — "push to talk", "Bella". */
      spoken: Readonly<Record<string, string>>;
      nullable?: true;
    }
  | { kind: 'number'; min: number; max: number; step: number; spokenUnit: 'percent' }
  | { kind: 'text'; max: number; nullable?: true }
  | { kind: 'list'; min: number };

/**
 * The pure checks a change has to pass beyond its value schema.
 *
 * - `lastName` — refuses to empty the names list (a companion needs a name to
 *   answer to, and the page already blocks removing the last pill).
 * - `wakeWord` — a names change is read back *before* it applies, because the
 *   moment it applies the old name stops waking anything.
 * - `muteLast` — turning speech off is read back first, then written: after
 *   the write, the confirmation would be silent.
 * - `tunedText` — personality and About me never take raw dictation
 *   (Decision 4). Only the page or Theme H's `tune`/`tweak` flow may write them.
 */
export const COMPANION_GUARD_IDS = ['lastName', 'wakeWord', 'muteLast', 'tunedText'] as const;
export type CompanionGuardId = (typeof COMPANION_GUARD_IDS)[number];

/**
 * One row of the settings list.
 *
 * `readBack` is a method, not a property arrow, so a spec for one key is
 * assignable where a spec for any key is expected; callers holding a key
 * union go through {@link companionSettingReadBack}, which does the cast once.
 */
export type CompanionSettingSpec<K extends CompanionSettingKey = CompanionSettingKey> = {
  key: K;
  /** What the page calls it. */
  label: string;
  /** The words people use for it — the router's vocabulary and the grammar's nouns. */
  aliases: readonly string[];
  value: CompanionSettingValueKind;
  /** The strictest tier this key has — see {@link companionSettingTier} for the per-value answer. */
  tier: CompanionAccess;
  /** Values that drop this key to `direct` (speak aloud → on). */
  directValues?: readonly CompanionSettingValues[K][];
  guards?: readonly CompanionGuardId[];
  /** One sentence confirming the new value — Theme E speaks it. */
  readBack(next: CompanionSettingValues[K]): string;
  /** A phrase that changes it, for the page's "Try: …" hint. `null` for `never`-tier keys, which get no hint. */
  example: string | null;
};

const onOff = (on: boolean): string => (on ? 'on' : 'off');

const localVoiceName = (id: CompanionLocalVoiceId | null): string =>
  COMPANION_LOCAL_VOICES.find((voice) => voice.id === (id ?? COMPANION_LOCAL_VOICE_DEFAULT))?.name ??
  'Heart';

const MIC_MODE_SPOKEN: Record<CompanionMicMode, string> = { push: 'push to talk', toggle: 'tap to toggle' };
const STT_ENGINE_SPOKEN: Record<CompanionSttEngine, string> = {
  server: 'offline or OpenAI Whisper',
  webSpeech: 'browser built-in',
};
const TRIGGER_SPOKEN: Record<VoiceConversationTrigger, string> = {
  always: 'every phrase',
  wake: 'wake word',
};
const STT_PROVIDER_SPOKEN: Record<SttProviderId, string> = {
  'whisper-local': 'offline Whisper',
  'openai-whisper': 'OpenAI Whisper',
  deepgram: 'Deepgram',
};

/**
 * The settings list (Phase 109 Theme A): every settable companion key, with
 * the words for it, its value kind, its tier, its guards, its read-back and an
 * example phrase. Total over {@link CompanionSettingKey} by its type, and that
 * key union is tied to the slice schema above, so a companion key added to the
 * store without a spec is a type error rather than a setting nothing can reach.
 */
export const COMPANION_SETTING_SPECS: { readonly [K in CompanionSettingKey]: CompanionSettingSpec<K> } = {
  companionEnabled: {
    key: 'companionEnabled',
    label: 'Enable companion',
    aliases: ['companion', 'yourself', 'turn yourself off'],
    value: { kind: 'bool' },
    tier: COMPANION_SETTING_TIERS.companionEnabled,
    readBack: (next) => (next ? "I'm on." : "I'm switching off."),
    example: null,
  },
  companionSttEngine: {
    key: 'companionSttEngine',
    label: 'Recognition engine',
    aliases: ['recognition engine', 'speech recognition', 'web speech', 'recogniser'],
    value: { kind: 'enum', values: COMPANION_STT_ENGINES, spoken: STT_ENGINE_SPOKEN },
    tier: COMPANION_SETTING_TIERS.companionSttEngine,
    readBack: (next) => `Recognising speech with the ${STT_ENGINE_SPOKEN[next]} engine.`,
    example: null,
  },
  companionSttProvider: {
    key: 'companionSttProvider',
    label: 'Speech provider',
    aliases: ['speech provider', 'transcription provider', 'whisper', 'deepgram'],
    value: { kind: 'enum', values: STT_PROVIDER_IDS, spoken: STT_PROVIDER_SPOKEN, nullable: true },
    tier: COMPANION_SETTING_TIERS.companionSttProvider,
    readBack: (next) =>
      next === null
        ? 'Choosing the speech provider automatically.'
        : `Transcribing with ${STT_PROVIDER_SPOKEN[next]}.`,
    example: null,
  },
  companionHandsFree: {
    key: 'companionHandsFree',
    label: 'Allow hands-free run',
    aliases: ['hands-free', 'hands free', 'hands-free run'],
    value: { kind: 'bool' },
    tier: COMPANION_SETTING_TIERS.companionHandsFree,
    readBack: (next) => `Hands-free run is ${onOff(next)}.`,
    example: null,
  },
  companionSpeakAloud: {
    key: 'companionSpeakAloud',
    label: 'Speak replies aloud',
    aliases: ['speak aloud', 'out loud', 'talking out loud', 'speech', 'mute'],
    value: { kind: 'bool' },
    tier: COMPANION_SETTING_TIERS.companionSpeakAloud,
    directValues: [true],
    guards: ['muteLast'],
    readBack: (next) => (next ? "I'll speak out loud again." : "Going quiet — I'll keep to the thread."),
    example: 'stop talking out loud',
  },
  companionNames: {
    key: 'companionNames',
    label: 'What you call it',
    aliases: ['name', 'names', 'wake word', 'what I call you'],
    value: { kind: 'list', min: 1 },
    tier: COMPANION_SETTING_TIERS.companionNames,
    guards: ['lastName', 'wakeWord'],
    readBack: (next) => `I'll answer to ${oxfordJoin(next)}.`,
    example: "I'll call you Nova",
  },
  companionMicMode: {
    key: 'companionMicMode',
    label: 'Microphone button',
    aliases: ['mic mode', 'microphone button', 'push to talk', 'toggle the mic'],
    value: { kind: 'enum', values: COMPANION_MIC_MODES, spoken: MIC_MODE_SPOKEN },
    tier: COMPANION_SETTING_TIERS.companionMicMode,
    readBack: (next) => `The mic is ${MIC_MODE_SPOKEN[next]} now.`,
    example: 'push to talk',
  },
  voiceConversation: {
    key: 'voiceConversation',
    label: 'Conversation mode',
    aliases: ['conversation mode', 'conversation', 'open mic'],
    value: { kind: 'bool' },
    tier: COMPANION_SETTING_TIERS.voiceConversation,
    readBack: (next) => `Conversation mode is ${onOff(next)}.`,
    example: 'conversation mode on',
  },
  voiceConversationTrigger: {
    key: 'voiceConversationTrigger',
    label: 'Conversation trigger',
    aliases: ['conversation trigger', 'wake word mode', 'always listening'],
    value: { kind: 'enum', values: VOICE_CONVERSATION_TRIGGERS, spoken: TRIGGER_SPOKEN },
    tier: COMPANION_SETTING_TIERS.voiceConversationTrigger,
    readBack: (next) =>
      next === 'wake'
        ? 'In conversation mode I only take phrases that start with my name.'
        : 'In conversation mode I take every phrase.',
    example: 'only listen for your name',
  },
  companionPersonality: {
    key: 'companionPersonality',
    label: 'Personality',
    aliases: ['personality', 'tone', 'how you talk'],
    value: { kind: 'text', max: COMPANION_FREE_TEXT_MAX_CHARS },
    tier: COMPANION_SETTING_TIERS.companionPersonality,
    guards: ['tunedText'],
    readBack: (next) => (next === '' ? "I've cleared my personality notes." : "I've updated my personality."),
    example: 'tune yourself',
  },
  companionAboutUser: {
    key: 'companionAboutUser',
    label: 'About me',
    aliases: ['about me', 'what you know about me'],
    value: { kind: 'text', max: COMPANION_FREE_TEXT_MAX_CHARS },
    tier: COMPANION_SETTING_TIERS.companionAboutUser,
    guards: ['tunedText'],
    readBack: (next) =>
      next === '' ? "I've forgotten what you told me about you." : "Got it — I've updated what I know about you.",
    example: 'let me tell you about me',
  },
  'companionVoices.local': {
    key: 'companionVoices.local',
    label: 'Local voice',
    aliases: ['voice', 'local voice', 'your voice'],
    value: {
      kind: 'enum',
      values: COMPANION_LOCAL_VOICE_IDS,
      spoken: Object.fromEntries(COMPANION_LOCAL_VOICES.map((voice) => [voice.id, voice.name])),
      nullable: true,
    },
    tier: COMPANION_SETTING_TIERS['companionVoices.local'],
    readBack: (next) => `This is ${localVoiceName(next)} now.`,
    example: 'use voice Bella',
  },
  'companionVoices.system': {
    key: 'companionVoices.system',
    label: 'Speaking voice (fallback)',
    aliases: ['system voice', 'fallback voice'],
    value: { kind: 'text', max: 512, nullable: true },
    tier: COMPANION_SETTING_TIERS['companionVoices.system'],
    readBack: (next) => (next === null ? 'Back to the system default voice.' : 'This is the new system voice.'),
    example: 'use the system voice Samantha',
  },
  companionVolume: {
    key: 'companionVolume',
    label: 'Companion volume',
    aliases: ['volume', 'loudness', 'louder', 'quieter'],
    value: { kind: 'number', min: 0, max: 1, step: 0.1, spokenUnit: 'percent' },
    tier: COMPANION_SETTING_TIERS.companionVolume,
    readBack: (next) => `Volume ${Math.round(next * 100)} percent.`,
    example: 'volume 50',
  },
  companionHonorifics: {
    key: 'companionHonorifics',
    label: 'What it calls you',
    aliases: ['call me', 'what you call me', 'honorific'],
    value: { kind: 'list', min: 0 },
    tier: COMPANION_SETTING_TIERS.companionHonorifics,
    readBack: (next) =>
      next.length === 0 ? "I'll stop calling you anything in particular." : `I'll call you ${oxfordJoin(next)}.`,
    example: 'call me boss',
  },
  companionMusicOffer: {
    key: 'companionMusicOffer',
    label: 'Offer elevator music',
    aliases: ['elevator music', 'music offer', 'music'],
    value: { kind: 'bool' },
    tier: COMPANION_SETTING_TIERS.companionMusicOffer,
    readBack: (next) => (next ? "I'll offer elevator music on long waits." : 'No more elevator music offers.'),
    example: 'turn elevator music off',
  },
  companionActiveProfile: {
    key: 'companionActiveProfile',
    label: 'Active profile',
    aliases: ['profile', 'persona'],
    value: { kind: 'text', max: 128, nullable: true },
    tier: COMPANION_SETTING_TIERS.companionActiveProfile,
    readBack: (next) => (next === null ? 'No profile is active now.' : 'Profile switched.'),
    example: 'switch to Narrator',
  },
};

/** The spec for a key, typed for callers that hold the key union rather than one literal. */
export function companionSettingSpec(key: CompanionSettingKey): CompanionSettingSpec {
  return COMPANION_SETTING_SPECS[key] as unknown as CompanionSettingSpec;
}

/**
 * The tier a particular change runs at — the spec's tier, unless `next` is
 * one of its `directValues` (turning speech back *on* needs no "yes").
 */
export function companionSettingTier(key: CompanionSettingKey, next: unknown): CompanionAccess {
  const spec = companionSettingSpec(key);
  return spec.directValues?.some((value) => Object.is(value, next)) ? 'direct' : spec.tier;
}

/** {@link CompanionSettingSpec.readBack} for a key union — the one cast, done here. */
export function companionSettingReadBack(key: CompanionSettingKey, next: unknown): string {
  return companionSettingSpec(key).readBack(next as never);
}

/**
 * Other ways to say each read-back (Phase 109 Theme E), so ten volume changes
 * in a row don't all sound the same — the same idea as Phase 80's phrase
 * banks, one small pool per key. Keys absent here only ever say their spec's
 * own {@link CompanionSettingSpec.readBack}.
 */
const READBACK_VARIANTS: { readonly [K in CompanionSettingKey]?: (next: CompanionSettingValues[K]) => readonly string[] } = {
  'companionVoices.local': (next) => {
    const name = localVoiceName(next);
    return [`${name} here.`, `Hi — ${name} speaking.`, `You've got ${name} now.`];
  },
  'companionVoices.system': (next) =>
    next === null ? ['System default voice it is.'] : ['Speaking with the new system voice.', 'New voice — how do I sound?'],
  companionVolume: (next) => {
    const percent = Math.round(next * 100);
    return [`${percent} percent.`, `Set to ${percent} percent.`, `Okay — ${percent} percent.`];
  },
  companionHonorifics: (next) => {
    const newest = next[next.length - 1];
    return newest === undefined
      ? ['No more nicknames.', "Okay — I won't call you anything in particular."]
      : [`Sure thing, ${newest}.`, `${capitalise(newest)} it is.`];
  },
  companionNames: (next) => [`From now on I answer to ${oxfordJoin(next)}.`, `${oxfordJoin(next)} — got it.`],
  companionSpeakAloud: (next) =>
    next
      ? ['Back to talking out loud.', 'You can hear me again.']
      : ["Okay — I'll stay quiet and write instead.", "Muting myself. It's all in the thread from here."],
  companionMicMode: (next) => [`Mic set to ${MIC_MODE_SPOKEN[next]}.`, `${capitalise(MIC_MODE_SPOKEN[next])} it is.`],
  voiceConversation: (next) =>
    next ? ["Conversation mode's on — just talk.", "I'm listening continuously now."] : ["Conversation mode's off.", 'Back to one phrase at a time.'],
  voiceConversationTrigger: (next) =>
    next === 'wake' ? ['Say my name first and I will hear you.'] : ["I'll take every phrase you say."],
  companionMusicOffer: (next) =>
    next ? ['Elevator music is back on the menu.'] : ["Okay — I'll keep the elevator music to myself."],
};

/**
 * Every way to read back `key` set to `next`: the spec's own sentence first,
 * then its variants. The renderer picks one per change and avoids repeating
 * the last pick for that key.
 */
export function companionSettingReadBacks(key: CompanionSettingKey, next: unknown): readonly string[] {
  const variants = (READBACK_VARIANTS[key] as ((value: unknown) => readonly string[]) | undefined)?.(next) ?? [];
  return [companionSettingReadBack(key, next), ...variants];
}

/**
 * A value as a few words — "Bella", "50%", "push to talk", "on" — for a toast
 * or a question. A system voice comes back as its URI here; the renderer,
 * which has the voice list, swaps in the display name.
 */
export function describeCompanionSettingValue(key: CompanionSettingKey, value: unknown): string {
  const spec = companionSettingSpec(key);
  if (key === 'companionVoices.local') return localVoiceName(value as CompanionLocalVoiceId | null);
  switch (spec.value.kind) {
    case 'bool':
      return value === true ? 'on' : 'off';
    case 'enum':
      return value === null ? 'automatic' : (spec.value.spoken[String(value)] ?? String(value));
    case 'number':
      return typeof value === 'number' ? `${Math.round(value * 100)}%` : String(value);
    case 'list':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : 'nothing';
    case 'text':
      if (value === null) return 'the default';
      return key === 'companionVoices.system' ? String(value) : 'updated';
  }
}

const quoted = (names: readonly string[]): string => oxfordJoin(names.map((name) => `"${name}"`));

/**
 * The yes/no question a `confirm`-tier change asks (Phase 109 Theme C), with
 * no question mark — the pending bar adds its own. "Answer to "Nova" from now
 * on", "Stop talking out loud". Shared so the MCP confirm (Theme D) asks the
 * same question the companion's voice does.
 */
export function companionSettingQuestion(key: CompanionSettingKey, previous: unknown, next: unknown): string {
  switch (key) {
    case 'companionNames': {
      const before = Array.isArray(previous) ? (previous as string[]) : [];
      const after = Array.isArray(next) ? (next as string[]) : [];
      const has = (list: readonly string[], name: string) => list.some((entry) => entry.toLowerCase() === name.toLowerCase());
      const added = after.filter((name) => !has(before, name));
      const removed = before.filter((name) => !has(after, name));
      if (added.length > 0 && removed.length === 0) return `Answer to ${quoted(added)} from now on`;
      if (removed.length > 0 && added.length === 0) return `Stop answering to ${quoted(removed)}`;
      return `Answer to ${quoted(after)} from now on`;
    }
    case 'companionSpeakAloud':
      return next === false ? 'Stop talking out loud' : 'Speak out loud again';
    case 'companionMicMode':
      return `Switch the mic to ${describeCompanionSettingValue(key, next)}`;
    case 'voiceConversation':
      return next === true ? 'Turn conversation mode on' : 'Turn conversation mode off';
    case 'voiceConversationTrigger':
      return next === 'wake'
        ? 'In conversation mode, only take phrases that start with my name'
        : 'In conversation mode, take every phrase';
    case 'companionPersonality':
      return 'Replace my personality notes';
    case 'companionAboutUser':
      return 'Replace what I know about you';
    default:
      return `Set ${companionSettingSpec(key).label.toLowerCase()} to ${describeCompanionSettingValue(key, next)}`;
  }
}

/**
 * Why a `setting` intent's value does not fit its key and `op`, or `null` when
 * it does — the refinement behind {@link CompanionIntentSchema}, so a router
 * reply naming an out-of-range volume is dropped like an unknown key.
 *
 * Stricter than the setter on one point: a number has to be *in* range. The
 * volume schema clamps (a page slider can't overshoot, but a stale stored
 * value might), and a router that answers `7` for "volume seventy" has misread
 * the scale, which a clamp to 100% would hide.
 */
export function companionSettingIntentProblem(intent: {
  key: CompanionIntentSettingKey;
  value?: unknown;
  op?: CompanionSettingOp | undefined;
}): string | null {
  const spec = companionSettingSpec(intent.key);
  const { value } = intent;
  switch (intent.op ?? 'set') {
    case 'set': {
      if (spec.value.kind === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.value.min || value > spec.value.max) {
          return `${spec.label} takes a number from ${spec.value.min} to ${spec.value.max}.`;
        }
      }
      const parsed = parseCompanionSettingValue(intent.key, value);
      return parsed.ok ? null : parsed.message;
    }
    case 'add':
    case 'remove':
      return spec.value.kind === 'list' && typeof value === 'string' && value.trim() !== ''
        ? null
        : `${spec.label} doesn't take "add" or "remove".`;
    case 'step':
      return spec.value.kind === 'number' &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value !== 0 &&
        Math.abs(value) <= spec.value.max - spec.value.min
        ? null
        : `${spec.label} can't be stepped by that.`;
    case 'match':
      return (intent.key === 'companionVoices.local' || intent.key === 'companionVoices.system') &&
        typeof value === 'string' &&
        value.trim() !== ''
        ? null
        : 'Only a voice can be matched by name.';
  }
}

/** How a spec's value kind is described to the router. */
function describeAllowedValues(spec: CompanionSettingSpec): string {
  const { value } = spec;
  if (spec.key === 'companionVoices.system') {
    return 'a system voice name, with "op":"match"';
  }
  switch (value.kind) {
    case 'bool':
      return 'true | false';
    case 'enum': {
      const listed = value.values.map((option) => `${option} (${value.spoken[option] ?? option})`).join(', ');
      const nullable = value.nullable ? ', or null for the default' : '';
      const matchable = spec.key === 'companionVoices.local' ? '; or a spoken name with "op":"match"' : '';
      return `${listed}${nullable}${matchable}`;
    }
    case 'number':
      return `${value.min} to ${value.max}, or "op":"step" with a signed nudge such as 0.1`;
    case 'list':
      return `a list of words, or "op":"add" / "op":"remove" with one word${value.min > 0 ? ` (at least ${value.min} must remain)` : ''}`;
    case 'text':
      return `text up to ${value.max} characters`;
  }
}

/**
 * The `settings` half of {@link CompanionVocabulary}: one row per key a
 * `setting` intent may name *and* the spoken grammar or router can sensibly
 * reach today. Derived from the spec table, so a new key shows up here (or
 * fails to compile) without anyone editing a second list.
 *
 * Left out, beyond the `never` tier the intent already excludes: personality
 * and About me, which only Theme H's interview may write (their `tunedText`
 * guard would refuse a router's text anyway), and the active profile, whose
 * value is an id only Theme G's profile commands know.
 */
export function companionSettingsVocabulary(): NonNullable<CompanionVocabulary['settings']> {
  return COMPANION_INTENT_SETTING_KEYS.map((key) => companionSettingSpec(key))
    .filter((spec) => !spec.guards?.includes('tunedText') && spec.key !== 'companionActiveProfile')
    .map((spec) => ({
      key: spec.key as CompanionIntentSettingKey,
      label: spec.label,
      aliases: [...spec.aliases],
      values: describeAllowedValues(spec),
      tier: spec.tier === 'confirm' ? ('confirm' as const) : ('direct' as const),
      example: spec.example ?? '',
    }));
}

/** What a guard needs to know about a change besides its values. */
export type CompanionGuardContext = {
  source: CompanionSettingSource;
  /**
   * The text came out of Theme H's `tune`/`tweak` flow — an interview or a
   * one-line tweak the user heard summarised and confirmed — rather than
   * from a transcript. Only meaningful to `tunedText`.
   */
  tuned?: boolean;
};

export type CompanionGuardResult =
  | {
      ok: true;
      /** `readBackBeforeApply`: speak the read-back first, then write (names, mute). */
      effect?: 'readBackBeforeApply';
    }
  | { ok: false; guard: CompanionGuardId; reason: string };

const sameList = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((value, index) => value === b[index]);

/**
 * Run a spec's guards over one change (Phase 109 Theme A). Pure: the setter
 * calls it with the store's current value, a test with a literal.
 *
 * Every guard runs; the first refusal wins, and its `reason` is a sentence the
 * companion can say as it stands. An `effect` from any guard is carried on the
 * pass — today the only one is `readBackBeforeApply`.
 *
 * `context` defaults to the page, whose click is the consent: the page is the
 * one source that may still write personality and About me as typed text.
 */
export function checkCompanionGuard(
  spec: Pick<CompanionSettingSpec, 'guards'>,
  current: unknown,
  next: unknown,
  context: CompanionGuardContext = { source: 'page' },
): CompanionGuardResult {
  let effect: 'readBackBeforeApply' | undefined;
  for (const guard of spec.guards ?? []) {
    switch (guard) {
      case 'lastName':
        if (Array.isArray(next) && next.length === 0) {
          return { ok: false, guard, reason: 'I need at least one name to answer to.' };
        }
        break;
      case 'wakeWord':
        if (!sameList(current, next)) effect = 'readBackBeforeApply';
        break;
      case 'muteLast':
        if (next === false && current !== false) effect = 'readBackBeforeApply';
        break;
      case 'tunedText':
        if (context.source !== 'page' && context.tuned !== true) {
          return {
            ok: false,
            guard,
            reason: "I don't take dictation for that. You can change it in Settings, Companion.",
          };
        }
        break;
    }
  }
  return effect === undefined ? { ok: true } : { ok: true, effect };
}

// --- Phase 109 · matching a spoken voice name --------------------------------

/** Anything {@link matchVoice} can pick between — a Kokoro voice, or a system voice the renderer lists with its display name. */
export type SpokenVoice = { spoken: readonly string[] };

export type VoiceMatch<T extends SpokenVoice> =
  | { kind: 'match'; match: T }
  /** The two closest, equally close — the companion asks "Bella or Isabella?" (Decision 10). */
  | { kind: 'ambiguous'; ambiguous: readonly [T, T] }
  | { kind: 'none' };

/**
 * Words that sit around a voice name in a request and are never part of one.
 * Dropped before matching so "change your voice" can't fuzz its way onto Alice.
 */
const VOICE_FILLER_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'use',
  'try',
  'voice',
  'voices',
  'your',
  'my',
  'switch',
  'change',
  'please',
  'one',
  'called',
  'named',
]);

const normaliseVoiceTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token !== '' && !VOICE_FILLER_WORDS.has(token));

/** Plain Levenshtein — the strings are names, so the O(n·m) table is a few dozen cells. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}

/**
 * How far a heard name may be from a real one. Two edits for a name of six
 * letters or more, one for four or five, none for three: "bela" → Bella and
 * "hart" → Heart still resolve, but a short name would otherwise sit an edit
 * or two from half the dictionary ("say" → Sky, "voice" → Alice).
 */
const maxVoiceDistance = (alias: string): number => (alias.length >= 6 ? 2 : alias.length >= 4 ? 1 : 0);

/**
 * Which voice a transcript names (Phase 109 Theme A).
 *
 * Tokens are lowercased, stripped of punctuation and accents, and filler words
 * ("use", "voice", "the") are dropped. Each spoken alias is compared, with its
 * spaces removed, against every run of as many tokens as it has words — and
 * one more, because whisper splits a name it doesn't know ("Isa Bella"). The
 * closest voice within {@link maxVoiceDistance} wins; two different voices
 * equally close come back `ambiguous`, so the companion asks rather than
 * guessing.
 *
 * Generic over the voice shape so the renderer can match system voices by
 * their display name — that list exists only in `speechSynthesis`.
 */
export function matchVoice<T extends SpokenVoice>(text: string, voices: readonly T[]): VoiceMatch<T> {
  const tokens = normaliseVoiceTokens(text);
  if (tokens.length === 0) return { kind: 'none' };

  const scored: { voice: T; distance: number }[] = [];
  for (const voice of voices) {
    let best = Number.POSITIVE_INFINITY;
    for (const alias of voice.spoken) {
      const aliasTokens = normaliseVoiceTokens(alias);
      if (aliasTokens.length === 0) continue;
      const aliasKey = aliasTokens.join('');
      const limit = maxVoiceDistance(aliasKey);
      for (let width = aliasTokens.length; width <= aliasTokens.length + 1; width += 1) {
        for (let start = 0; start + width <= tokens.length; start += 1) {
          const distance = editDistance(tokens.slice(start, start + width).join(''), aliasKey);
          if (distance <= limit && distance < best) best = distance;
        }
      }
    }
    if (Number.isFinite(best)) scored.push({ voice, distance: best });
  }

  if (scored.length === 0) return { kind: 'none' };
  scored.sort((a, b) => a.distance - b.distance);
  const [first, second] = scored as [{ voice: T; distance: number }, { voice: T; distance: number } | undefined];
  if (second !== undefined && second.distance === first.distance) {
    return { kind: 'ambiguous', ambiguous: [first.voice, second.voice] };
  }
  return { kind: 'match', match: first.voice };
}

/**
 * Resolve the honorific list to the one name a phrase actually uses.
 *
 * Every phrase bank template still takes a single `{name}` — turning that
 * into "pick one, at random, every time" is the whole adaptation multiple
 * honorifics needs, since there is nothing to prefer between "sir" and
 * "boss" beyond variety. Empty resolves to `''`, exactly the empty-honorific
 * default `interpolatePhrase` already collapses cleanly. `rng` is injected
 * for the reason `pickPhrase`'s is: a deterministic test, not a stubbed
 * global.
 */
export function pickHonorific(
  honorifics: readonly string[],
  rng: () => number = Math.random,
): string {
  if (honorifics.length === 0) return '';
  return honorifics[pickIndex(rng, honorifics.length)] as string;
}

// --- E · reading a pty back -------------------------------------------------

/** How much of a read-back the thread keeps. A scrollback is hundreds of kilobytes; a turn is not. */
export const COMPANION_READBACK_TAIL_CHARS = 4000;

/**
 * The agent's last answer, cut out of a whole scrollback.
 *
 * The scrollback is every repaint of a TUI since the session opened — most of
 * it the same frame drawn again. What the companion wants is the last *turn*:
 * the text the agent produced after the previous prompt and before the current
 * one.
 *
 * The prompt is found with the roster's own markers rather than a guess of our
 * own — `awaitingInput` is the option-sheet caret and `frameEnd` the mode
 * footer (see `AgentDefinitionSchema.activity`), and both are already
 * user-overridable through `agents.json`. With two or more boundaries the turn
 * is what lies between the last two; with one, everything before it; with none
 * — an agent with no marker set, which is most of the roster — the tail of the
 * cleaned text, because a wrong cut is worse than an uncut one.
 *
 * `markers` are regex *sources*, exactly as they sit in the roster, and are
 * compiled here rather than passed in compiled so this stays a pure function
 * over data that crossed IPC.
 */
export function extractLastAgentTurn(
  scrollback: string,
  markers?: { awaitingInput?: string; frameEnd?: string },
  tailChars = COMPANION_READBACK_TAIL_CHARS,
): string {
  const clean = cleanPtyText(scrollback);
  const boundaries: { start: number; end: number }[] = [];

  for (const source of [markers?.awaitingInput, markers?.frameEnd]) {
    if (source === undefined || source === '') continue;
    let pattern: RegExp;
    try {
      pattern = new RegExp(source, 'gi');
    } catch {
      // A user-authored `agents.json` regex that does not compile costs a
      // clean cut, not the read-back.
      continue;
    }
    for (const match of clean.matchAll(pattern)) {
      if (typeof match.index === 'number') {
        boundaries.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }

  boundaries.sort((a, b) => a.start - b.start);

  let slice: string;
  if (boundaries.length >= 2) {
    // From the END of the previous prompt to the START of the current one, so
    // neither marker's own text is read out as if the agent had said it.
    const previous = boundaries[boundaries.length - 2] as { start: number; end: number };
    const current = boundaries[boundaries.length - 1] as { start: number; end: number };
    slice = clean.slice(previous.end, current.start);
  } else if (boundaries.length === 1) {
    slice = clean.slice(0, (boundaries[0] as { start: number }).start);
  } else {
    slice = clean;
  }

  return collapseBlankLines(slice).slice(-tailChars).trim();
}

/** Three blank lines in a row is a TUI artefact, never content. */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

// --- E · speech shaping -----------------------------------------------------

/**
 * How many characters one utterance may carry.
 *
 * The phase caps a single utterance at 60 seconds. `speechSynthesis` has no
 * duration API before it starts speaking, so the cap is applied in characters
 * at a conservative reading rate — 15 characters a second is roughly 180 words
 * a minute, near the top of what the default macOS voices manage — giving 900.
 */
export const COMPANION_UTTERANCE_CHAR_CAP = 900;
/*
  Distinct from Theme F's {@link COMPANION_TTS_CHUNK_CHARS} (200), which is a
  workaround for Chromium silencing a long utterance. This is a decision about
  how much is worth listening to; that is a decision about how to deliver it.
  The flow applies this one, the speaker applies that one, in that order.
*/
/** What replaces the tail this cap drops. */
export const COMPANION_TRUNCATION_TAIL = 'and more in the thread.';

/**
 * Split text into utterances that fit the cap, on sentence boundaries.
 *
 * Returns at most two entries: what fits, and — when something had to go — the
 * truncation notice as its own utterance. Splitting on sentences rather than
 * characters keeps the cut off the middle of a word; a single sentence longer
 * than the whole cap is hard-cut at its last word boundary, because the
 * alternative is speaking nothing at all.
 */
export function splitForSpeech(text: string, cap = COMPANION_UTTERANCE_CHAR_CAP): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (trimmed.length <= cap) return [trimmed];

  const sentences = trimmed.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [trimmed];
  let kept = '';
  for (const sentence of sentences) {
    if (kept.length + sentence.length > cap) break;
    kept += sentence;
  }
  if (kept.trim() === '') {
    const hard = trimmed.slice(0, cap);
    const lastSpace = hard.lastIndexOf(' ');
    kept = lastSpace > cap / 2 ? hard.slice(0, lastSpace) : hard;
  }

  return [kept.trim(), COMPANION_TRUNCATION_TAIL];
}

// --- E · the headless router's reply ---------------------------------------

/**
 * What `mstudio:companion:ask` is asked to answer with.
 *
 * `say` is the only required field: a router that recognised nothing still owes
 * the user a sentence, and "I didn't follow that" is a better answer than a
 * rejection. `intent` is optional and re-validated through
 * {@link CompanionIntentSchema} — this arrives as JSON printed by a CLI, which
 * is exactly the input that must not be trusted to be the shape it was asked
 * for. `raw` carries what the CLI printed when it could not be parsed at all,
 * because losing that is what makes a miss undebuggable.
 */
export const CompanionAskReplySchema = z.object({
  say: z.string().min(1),
  intent: CompanionIntentSchema.optional(),
  /**
   * What the CLI actually printed, when what it printed was not the shape it
   * was asked for.
   *
   * Present *only* on that path, and never spoken — it is posted in the thread
   * as an `agent` turn so a miss is visible instead of silent. A reply that
   * parsed cleanly omits it: repeating the same content twice, once as speech
   * and once as raw text, is noise.
   */
  raw: z.string().optional(),
});
export type CompanionAskReply = z.infer<typeof CompanionAskReplySchema>;

/** What the companion says when the router answered something unparseable. */
export const COMPANION_ASK_FALLBACK = "I didn't follow that.";

/**
 * Pull the reply object out of whatever a CLI actually printed.
 *
 * A print-mode CLI is asked for JSON and answers with JSON *plus* whatever
 * else it felt like saying — a fenced code block, a "Here you go:", a trailing
 * newline. So the first balanced `{…}` is located and parsed rather than the
 * whole of stdout, and a failure returns `null` for the caller to turn into
 * {@link COMPANION_ASK_FALLBACK}. Pure, so the parsing is unit-testable
 * without spawning anything.
 */
export function parseAskReply(stdout: string): CompanionAskReply | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(stdout);
  const candidates = [fenced?.[1], stdout].filter(
    (value): value is string => typeof value === 'string',
  );

  for (const candidate of candidates) {
    const found = firstBalancedObject(candidate);
    if (found === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(found);
    } catch {
      continue;
    }
    const parsed = CompanionAskReplySchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }

  return null;
}

/**
 * The first balanced `{…}` in a string, string literals and escapes respected.
 *
 * Walking to the matching brace rather than to the last `}` in the buffer:
 * trailing prose containing a brace would otherwise break an object that
 * parsed perfectly well.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
