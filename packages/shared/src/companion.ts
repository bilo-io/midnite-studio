import { z } from 'zod';

import { RepoDescriptorSchema, type Ref } from './domain';

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
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[index] as string;
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
 * short sha, a `#123`, a phase number — never a URL: the thread linkifies from
 * `kind` + `ref`, and a URL here would bake `github.com` into a shape that
 * also describes a local commit and a tracker row.
 */
export const CompanionDigestItemSchema = z.object({
  kind: z.enum(['commit', 'pr', 'phase']),
  title: z.string(),
  ref: z.string(),
  /** Epoch milliseconds. */
  at: z.number(),
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

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Join titles the way a sentence does — "a, b and c" — with an Oxford-free
 * "and" because this is spoken, not printed.
 */
function joinTitles(items: readonly CompanionDigestItem[]): string {
  const titles = items.map((item) => item.title.trim()).filter((title) => title.length > 0);
  if (titles.length === 0) return '';
  if (titles.length === 1) return titles[0] as string;
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1] as string}`;
}

/** "three commits, two PRs and one phase" — counted by kind, in a fixed order. */
function countByKind(items: readonly CompanionDigestItem[]): string {
  const order: CompanionDigestItem['kind'][] = ['commit', 'pr', 'phase'];
  const words: Record<CompanionDigestItem['kind'], string> = {
    commit: 'commit',
    pr: 'pull request',
    phase: 'tracker entry',
  };
  const parts = order
    .map((kind) => ({ kind, count: items.filter((item) => item.kind === kind).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => plural(entry.count, words[entry.kind]));
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] as string}`;
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
 * it, because past five a spoken list is a wait rather than a summary.
 */
export function summariseDigest(digest: CompanionDigest, now = Date.now()): string[] {
  const when = sinceLabel(digest.since, now);
  const lines: string[] = [];

  if (digest.landed.length === 0) {
    lines.push(`Nothing has landed ${when}.`);
  } else if (digest.landed.length <= COMPANION_DIGEST_NAME_CAP) {
    lines.push(
      `${capitalise(when)}, ${countByKind(digest.landed)} landed — ${joinTitles(digest.landed)}.`,
    );
  } else {
    lines.push(`${capitalise(when)}, ${countByKind(digest.landed)} landed.`);
  }

  if (digest.inProgress.length === 0) {
    lines.push('Nothing is open right now.');
  } else if (digest.inProgress.length <= COMPANION_DIGEST_NAME_CAP) {
    lines.push(`Still in flight: ${joinTitles(digest.inProgress)}.`);
  } else {
    lines.push(`${capitalise(countByKind(digest.inProgress))} are still in flight.`);
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

// --- F · the speech-to-text provider seam ----------------------------------

/**
 * Which cloud recogniser transcribes an utterance.
 *
 * Two ids, one implementation (Decision 8). **OpenAI Whisper ships first**
 * because `/v1/audio/transcriptions` accepts the `audio/webm;codecs=opus`
 * blob `MediaRecorder` already produces, as one multipart request per
 * utterance, with no streaming protocol to implement — the recorder is
 * push-to-talk, so there is nothing for a streaming API to buy.
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
 * ship and fails with a network error. Local recognition (whisper.cpp) is the
 * phase's named sequel, not a third id.
 */
export const STT_PROVIDER_IDS = ['openai-whisper', 'deepgram'] as const;
export const SttProviderIdSchema = z.enum(STT_PROVIDER_IDS);
export type SttProviderId = (typeof STT_PROVIDER_IDS)[number];

/** The one with an implementation behind it. */
export const DEFAULT_STT_PROVIDER_ID: SttProviderId = 'openai-whisper';

/** Human labels for the Settings provider picker, so the copy lives with the ids. */
export const STT_PROVIDER_LABELS: Record<SttProviderId, string> = {
  'openai-whisper': 'OpenAI Whisper',
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
