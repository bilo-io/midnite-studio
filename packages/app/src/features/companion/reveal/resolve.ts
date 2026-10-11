import {
  parseResourceQuery,
  RESOURCE_KINDS,
  RESOURCE_MATCH_DETAIL_MAX,
  RESOURCE_MATCH_TITLE_MAX,
  resourceRefKey,
  resourceRefLabel,
  type MediaKind,
  type ParsedResourceQuery,
  type ResourceKind,
  type ResourceRef,
} from '@midnite/studio-shared';

import { frecencyMultiplier, useFrecencyStore } from '../../../services/palette/frecency-store';
import { fuzzyMatch } from '../../../services/palette/fuzzy-match';
import { useUiStore } from '../../../store/ui-store';
import { REVEAL_HISTORY_LIMIT, useRevealHistory } from './reveal-history';
import { DEFAULT_SOURCES } from './sources';

/**
 * Phase 112 Theme G — the resolver: free text ("the commit about the lock
 * screen", "my last chat", "PR 812") in, ranked {@link ResourceRef}s out.
 *
 * No index. `findResources` reads the query once (`parseResourceQuery`, in
 * `shared` so Theme H's grammar reads phrases the same way), asks every
 * {@link ResourceSource} whose kinds the query allows for its candidates —
 * lists the app already has: cached forge listings, the stores, the `*.list`
 * bridge calls — and ranks them all with one scorer, so a chat and a commit
 * compete on the same scale. A source that is slow is dropped from that
 * answer ({@link SOURCE_TIMEOUT_MS}); one that throws is dropped too. Neither
 * ever blocks or fails the whole find.
 */

/** A source is dropped from an answer once it has taken this long. */
export const SOURCE_TIMEOUT_MS = 300;
/** The most matches one source contributes to an answer, so a long list cannot crowd the rest out. */
export const SOURCE_RESULT_CAP = 20;
export const DEFAULT_FIND_LIMIT = 10;
/** Matches the `find` action's own `limit` ceiling in `CompanionUiActionSchema`. */
export const MAX_FIND_LIMIT = 20;
/** The score an exact id carries — far above anything fuzzy text can reach. */
export const EXACT_SCORE = 1_000_000;

/** A thing a source can offer. The resolver, not the source, decides whether it matches and how well. */
export type ResourceCandidate = {
  ref: ResourceRef;
  /** What a person calls it — a chat's title, a commit's subject. Fuzzy-matched. */
  title: string;
  /** A short second line ("PR 812 · open"). Matched as text, and returned. */
  detail?: string;
  /** More text to match on but never return — a chat's preview, a note's body. */
  keywords?: string;
  /** Grows with recency — epoch ms where the list has a time, otherwise any number comparable within this source. */
  at?: number;
  /** The query named this thing by id (`#812`, a sha). An exact candidate wins outright. */
  exact?: boolean;
  /** The source already checked every term matches somewhere it can see (a commit body `git log --grep` searched). */
  matched?: boolean;
};

export type ResourceMatch = { ref: ResourceRef; title: string; detail?: string; score: number };

/** What a source is asked: the parsed query, with the kinds this answer allows, and a signal that fires on timeout. */
export type SourceQuery = Omit<ParsedResourceQuery, 'kinds'> & {
  /** The effective kinds — never empty: a query that names none allows them all. */
  kinds: readonly ResourceKind[];
  repoId: string | null;
  signal: AbortSignal;
};

export type ResourceSource = {
  /** For diagnostics and tests — `commits`, `chats`, `media:model`. */
  id: string;
  /** The kinds this source can produce. A source whose kinds the query rules out is never asked. */
  kinds: readonly ResourceKind[];
  /** Media tabs, for a media source — so "the dragon model" asks only the model source. */
  media?: readonly MediaKind[];
  load: (query: SourceQuery) => Promise<readonly ResourceCandidate[]>;
};

export type FindOptions = {
  /** A hard filter — the caller's. A kind word in the query narrows within it. */
  kinds?: readonly ResourceKind[];
  limit?: number;
  /** The sources to ask — `DEFAULT_SOURCES` (`reveal/sources`) when omitted. */
  sources?: readonly ResourceSource[];
  timeoutMs?: number;
  /** The repo repo-scoped sources read; the selected repo when omitted. */
  repoId?: string | null;
  /** A bounded score multiplier per ref (≥ 1) — palette frecency and reveal history when omitted. */
  boost?: (ref: ResourceRef) => number;
};

// --- scoring ----------------------------------------------------------------

/** A scattered subsequence match below this many points per needle character is noise, not a match. */
const FUZZY_FLOOR_PER_CHAR = 18;
/** …and one whose matched letters spread wider than this many times the needle is too. */
const FUZZY_MAX_SPAN = 2;

function titleScore(term: string, title: string): number | null {
  const lower = title.toLowerCase();
  const hit = fuzzyMatch(term, title);
  if (!hit) return null;
  if (lower.includes(term)) return hit.score;
  if (term.length < 3 || hit.score < FUZZY_FLOOR_PER_CHAR * term.length) return null;
  // A typo or a dropped letter ("lcok", "scren") stays tight; letters picked from across a sentence do not.
  const span = (hit.indices.at(-1) ?? 0) - (hit.indices[0] ?? 0) + 1;
  if (span > FUZZY_MAX_SPAN * term.length) return null;
  return hit.score;
}

/** Plain-text match for the fields that are not titles — a word start beats a mid-word hit. */
function textScore(term: string, text: string): number | null {
  if (text === '') return null;
  const at = text.indexOf(term);
  if (at === -1) return null;
  const wordStart = new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);
  return (wordStart ? 12 : 6) * term.length;
}

/** The candidate's text score against `terms`, or `null` when a required term is nowhere in it. */
export function scoreCandidate(candidate: ResourceCandidate, query: Pick<ParsedResourceQuery, 'terms' | 'softTerms' | 'description'>): number | null {
  const extra = `${candidate.detail ?? ''} ${candidate.keywords ?? ''}`.toLowerCase();
  let total = 0;
  for (const term of query.terms) {
    const score = titleScore(term, candidate.title) ?? textScore(term, extra);
    if (score === null) {
      if (!candidate.matched) return null;
      total += 5 * term.length;
    } else total += score;
  }
  for (const term of query.softTerms) {
    const score = titleScore(term, candidate.title) ?? textScore(term, extra);
    if (score !== null) total += score / 2;
  }
  // The whole description, in order, in the title — "lock screen" over a title with "screen … lock".
  if (query.terms.length > 1 && candidate.title.toLowerCase().includes(query.description)) {
    total += 10 * query.description.length;
  }
  return total;
}

// --- boost ------------------------------------------------------------------

/** The palette item id a ref shares with the command palette, where one exists — so frecency carries over. */
export function paletteItemIds(ref: ResourceRef): string[] {
  switch (ref.kind) {
    case 'setting':
      return [`settings:${ref.page}`];
    case 'board':
      return [`project-board:${ref.projectId}`];
    case 'issue':
      return [`repo-issue:${ref.number}`];
    case 'session':
      return [`session:${ref.id}`];
    case 'ref':
      return [`ref:reveal:${ref.fullName}`, `ref:checkout:${ref.fullName}`];
    case 'file':
      return [`file:${ref.path}`];
    default:
      return [];
  }
}

const MAX_BOOST = 1.25;

/**
 * The default nudge: the larger of the palette's frecency multiplier (for refs
 * the palette also lists) and a reveal-history one — something revealed this
 * session is likelier to be meant again. Bounded at ×1.25 like the palette's,
 * so it breaks near-ties and never outranks a clearly better text match.
 */
export function defaultBoost(ref: ResourceRef): number {
  const entries = useFrecencyStore.getState().entries;
  const palette = Math.max(1, ...paletteItemIds(ref).map((id) => frecencyMultiplier(entries, id)));
  const key = resourceRefKey(ref);
  const index = useRevealHistory.getState().entries.findIndex((entry) => resourceRefKey(entry.ref) === key);
  const history = index === -1 ? 1 : 1 + (MAX_BOOST - 1) * (1 - index / REVEAL_HISTORY_LIMIT);
  return Math.min(MAX_BOOST, Math.max(palette, history));
}

// --- running sources ----------------------------------------------------------

/** One source's candidates, or `null` when it threw or ran out of time. */
async function runSource(source: ResourceSource, query: Omit<SourceQuery, 'signal'>, timeoutMs: number): Promise<ResourceCandidate[] | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const load = source
      .load({ ...query, signal: controller.signal })
      .then((candidates) => [...candidates])
      .catch(() => null);
    return await Promise.race([load, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function toMatch(candidate: ResourceCandidate, score: number): ResourceMatch {
  const title = clip(candidate.title || resourceRefLabel(candidate.ref), RESOURCE_MATCH_TITLE_MAX);
  const detail = candidate.detail ? clip(candidate.detail, RESOURCE_MATCH_DETAIL_MAX) : '';
  return { ref: candidate.ref, title, ...(detail ? { detail } : {}), score };
}

/** Bare ids the query named that no source vouched for — "PR 812" still names a PR when the list is not loaded. */
function syntheticExacts(parsed: ParsedResourceQuery, found: readonly ResourceCandidate[], repoId: string | null, kinds: ReadonlySet<ResourceKind>): ResourceCandidate[] {
  if (repoId === null) return [];
  const out: ResourceCandidate[] = [];
  for (const id of parsed.exact) {
    if (id.type !== 'number') continue;
    const covered = found.some((c) => (c.ref.kind === 'pull' || c.ref.kind === 'issue') && c.ref.number === id.value);
    if (covered) continue;
    for (const kind of id.kinds) {
      if (!kinds.has(kind)) continue;
      const ref: ResourceRef = { kind, repoId, number: id.value };
      out.push({ ref, title: resourceRefLabel(ref), exact: true });
    }
  }
  return out;
}

// --- the resolver -------------------------------------------------------------

/**
 * Resolve free text to ranked refs. Never throws and never blocks past
 * {@link SOURCE_TIMEOUT_MS} plus scoring:
 *
 * - **Exact ids win outright** — a sha prefix, `#812`, `PR 812`: when the query
 *   names one, only exact matches come back.
 * - **Recency words skip fuzzy ranking** — "my last chat" is the newest chat,
 *   "the previous workflow" the one after it; with a description too ("the
 *   latest commit about auth") the matches are ordered newest first.
 * - **A kind word narrows** — "chat", "commit", "model" — within the caller's
 *   own `kinds`, which always win if the two disagree.
 * - Otherwise matches rank by text score × a bounded frecency nudge, ties
 *   broken by recency.
 */
export async function findResources(query: string, opts: FindOptions = {}): Promise<ResourceMatch[]> {
  const parsed = parseResourceQuery(query);
  const limit = Math.min(MAX_FIND_LIMIT, Math.max(1, Math.trunc(opts.limit ?? DEFAULT_FIND_LIMIT)));
  const callerKinds = opts.kinds?.length ? opts.kinds : null;

  let kinds: readonly ResourceKind[] = parsed.kinds;
  if (callerKinds) {
    const narrowed = parsed.kinds.filter((kind) => callerKinds.includes(kind));
    kinds = narrowed.length > 0 ? narrowed : callerKinds;
  }
  const mediaFilter = kinds.includes('media') && parsed.media.length > 0 ? parsed.media : null;

  // Nothing to go on: no words, no id, no kind. A bare "latest" names nothing either.
  const hasText = parsed.terms.length > 0 || parsed.softTerms.length > 0;
  if (!hasText && parsed.exact.length === 0 && kinds.length === 0) return [];

  // A bare id asks only the sources that could own it — "a1b2c3d" is a commit, "#812" a PR or issue.
  const exactOnly = parsed.exact.length > 0 && parsed.terms.length === 0;
  const exactKinds = [...new Set(parsed.exact.flatMap((id): ResourceKind[] => (id.type === 'sha' ? ['commit'] : [...id.kinds])))];
  const allowed: readonly ResourceKind[] = kinds.length > 0 ? kinds : exactOnly ? exactKinds : RESOURCE_KINDS;
  const allowedSet = new Set(allowed);
  const repoId = opts.repoId !== undefined ? opts.repoId : useUiStore.getState().selectedRepoId;
  const sources = (opts.sources ?? DEFAULT_SOURCES).filter(
    (source) =>
      source.kinds.some((kind) => allowedSet.has(kind)) &&
      (mediaFilter === null || source.media === undefined || source.media.some((tab) => mediaFilter.includes(tab))),
  );

  const sourceQuery: Omit<SourceQuery, 'signal'> = { ...parsed, kinds: allowed, repoId };
  const timeoutMs = opts.timeoutMs ?? SOURCE_TIMEOUT_MS;
  const answers = await Promise.all(sources.map((source) => runSource(source, sourceQuery, timeoutMs)));

  const admissible = (candidate: ResourceCandidate): boolean =>
    allowedSet.has(candidate.ref.kind) &&
    (mediaFilter === null || candidate.ref.kind !== 'media' || mediaFilter.includes(candidate.ref.media));

  // Exact ids first: when the query named one, nothing fuzzy competes with it.
  if (parsed.exact.length > 0) {
    const found = answers.flatMap((answer) => answer ?? []).filter((c) => c.exact && admissible(c));
    const exacts = dedupe([...found, ...syntheticExacts(parsed, found, repoId, allowedSet)].map((c) => ({ candidate: c, score: EXACT_SCORE })));
    // An id that names nothing answers nothing, rather than a fuzzy guess at something else.
    if (exacts.length > 0 || exactOnly) return exacts.slice(0, limit).map(({ candidate, score }) => toMatch(candidate, score));
  }

  const boost = opts.boost ?? defaultBoost;
  const scored: { candidate: ResourceCandidate; score: number; order: number }[] = [];
  let order = 0;
  for (const answer of answers) {
    if (!answer) continue;
    const mine: typeof scored = [];
    for (const candidate of answer) {
      order += 1;
      if (!admissible(candidate)) continue;
      const text = scoreCandidate(candidate, parsed);
      if (text === null) continue;
      // A kind-only or recency query has no text to score; every admissible candidate scores alike.
      mine.push({ candidate, score: (text + 1) * boost(candidate.ref), order });
    }
    mine.sort(byScoreThenRecency);
    scored.push(...mine.slice(0, SOURCE_RESULT_CAP));
  }

  // Recency words order by time first; everything else by score, recency breaking ties.
  scored.sort(parsed.recency !== null || !hasText ? byRecencyThenScore : byScoreThenRecency);
  const ranked = dedupe(scored);
  const offset = parsed.recency === 'previous' ? 1 : 0;
  return ranked.slice(offset, offset + limit).map(({ candidate, score }) => toMatch(candidate, score));
}

type Ranked = { candidate: ResourceCandidate; score: number; order?: number };

function recencyOf(entry: Ranked): number {
  return entry.candidate.at ?? Number.NEGATIVE_INFINITY;
}

function byScoreThenRecency(a: Ranked, b: Ranked): number {
  return b.score - a.score || recencyOf(b) - recencyOf(a) || (a.order ?? 0) - (b.order ?? 0);
}

function byRecencyThenScore(a: Ranked, b: Ranked): number {
  const ra = recencyOf(a);
  const rb = recencyOf(b);
  if (ra !== rb) return rb > ra ? 1 : -1;
  return b.score - a.score || (a.order ?? 0) - (b.order ?? 0);
}

/** First occurrence of each ref wins — the list is already in rank order. */
function dedupe<T extends Ranked>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = resourceRefKey(entry.candidate.ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
