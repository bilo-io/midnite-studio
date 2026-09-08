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
  const remotes = refs.filter((ref) => ref.kind === 'remote');
  const locals = refs.filter((ref) => ref.kind === 'local');

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
