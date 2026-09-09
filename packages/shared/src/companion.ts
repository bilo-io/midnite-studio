import { z } from 'zod';

import { cleanPtyText } from './ansi';
import { RepoDescriptorSchema, type Ref } from './domain';
import { parseConventionalCommit } from './version';

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
};

export const COMPANION_LOCAL_VOICES: readonly CompanionLocalVoiceInfo[] = [
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
];

/** `af_heart` — see its own module doc in `tts.ts` for why it is the default. */
export const COMPANION_LOCAL_VOICE_DEFAULT: CompanionLocalVoiceId = 'af_heart';

/** A requested id, narrowed to a known one — `deps.getLocalVoice()`'s stored value can predate a catalog change. */
export function isCompanionLocalVoiceId(value: string | null): value is CompanionLocalVoiceId {
  return value !== null && (COMPANION_LOCAL_VOICE_IDS as readonly string[]).includes(value);
}

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

  if (snapshot.openPulls === null || snapshot.failingChecks === null) {
    lines.push('I could not reach GitHub, so I have nothing on pull requests or checks.');
  } else {
    const forge = [
      snapshot.openPulls > 0 ? plural(snapshot.openPulls, 'open pull request') : '',
      snapshot.failingChecks > 0 ? `${plural(snapshot.failingChecks, 'check')} failing` : '',
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
 */
export function markdownToSpeech(markdown: string): string {
  return markdown
    .split('\n')
    .map((raw) =>
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
    )
    .filter((line) => line !== '')
    .map((line) => (/[.!?:;]$/.test(line) ? line : `${line}.`))
    .join('\n');
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
 */
export function sanitizeForSpeech(text: string): string {
  let result = text.replace(SANITIZE_URL_RE, 'a link');

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

// --- E · the intent grammar -------------------------------------------------

/**
 * The `AgentCommandId`s the companion is allowed to start.
 *
 * **A subset, deliberately — ten of the roster's twenty-one.** Left out: every
 * `loop*` id (a `/loop` runs unattended on a timer, which is not a thing to
 * start from a misheard sentence) and both release ops (`releasePrep` writes a
 * branch, `releaseComplete` is irreversible by design). The phase's own
 * guardrail is that every write goes through an agent session the user can
 * see; this list is where that stops being a sentence and starts being a type.
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
] as const;
export type CompanionCommandId = (typeof COMPANION_COMMAND_IDS)[number];

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
  brainstorm: ['brainstorm', 'brain storm', 'new phase'],
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
  z.object({ kind: z.literal('freeform'), text: z.string() }),
]);
export type CompanionIntent = z.infer<typeof CompanionIntentSchema>;

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
 * music" would otherwise read as a dismissal. Commands next, in table order.
 * Repo switching last, since "switch to X" is the only shape it takes.
 */
export function parseIntent(text: string): CompanionIntent {
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
