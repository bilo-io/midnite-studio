import type { MediaKind, ResourceKind } from './resource-ref';

/**
 * Phase 112 Theme G — reading a free-text description of "a thing in the app".
 *
 * `parseResourceQuery("my last chat about auth")` pulls out the parts a
 * resolver needs: which kinds the head noun names (`chat`), a recency word
 * (`latest`), any exact id (`#812`, `PR 812`, a sha prefix) and the content
 * words left to match (`auth`). Pure and zod-free, so the app's resolver
 * (`features/companion/reveal/resolve.ts`) and Theme H's `parseIntent` read a
 * phrase the same way — `shared` still never chooses among candidates.
 */

/** "latest/last/most recent" → the newest; "previous/the one before" → the one after it. */
export type ResourceRecency = 'latest' | 'previous';

export type ResourceExactId =
  | { type: 'sha'; value: string }
  /** A forge number. `kinds` is `['pull']` for "PR 812", `['issue']` for "issue 812", both for a bare `#812`. */
  | { type: 'number'; value: number; kinds: readonly ('pull' | 'issue')[] };

export type ParsedResourceQuery = {
  /** The query as given, trimmed. */
  text: string;
  /** The kind word read as the head noun ("chat", "pull request"), or `null`. */
  headWord: string | null;
  /** Kinds the head noun names; empty when the query names none. */
  kinds: ResourceKind[];
  /** Set only when the head noun is a media word ("the dragon model") — narrows `media` refs to these tabs. */
  media: MediaKind[];
  recency: ResourceRecency | null;
  exact: ResourceExactId[];
  /** Content words every match must contain, lower-cased. */
  terms: string[];
  /** Kind words that were not the head noun ("terminal" in "terminal settings") — a bonus when matched, never required. */
  softTerms: string[];
  /** `terms` joined — what a whole-phrase match is scored against. */
  description: string;
};

/** The longest `title` a resolver match carries — Theme I's `ui.find` asserts nothing longer leaves. */
export const RESOURCE_MATCH_TITLE_MAX = 120;
/** The longest `detail` a resolver match carries. */
export const RESOURCE_MATCH_DETAIL_MAX = 80;

export type KindWord = { kinds: readonly ResourceKind[]; media?: readonly MediaKind[] };

const k = (...kinds: ResourceKind[]): KindWord => ({ kinds });
const m = (...media: MediaKind[]): KindWord => ({ kinds: ['media'], media });

/**
 * Every word (or fixed phrase) that names a kind of resource. "run" is three
 * kinds at once — a CI run, a workflow run, a council run — and the resolver
 * ranks among them. A word that would mostly be read as a description ("project",
 * "page") is deliberately absent.
 */
export const RESOURCE_KIND_WORDS: Readonly<Record<string, KindWord>> = {
  commit: k('commit'),
  commits: k('commit'),
  sha: k('commit'),
  branch: k('ref'),
  branches: k('ref'),
  tag: k('ref'),
  tags: k('ref'),
  ref: k('ref'),
  refs: k('ref'),
  stash: k('stash'),
  stashes: k('stash'),
  file: k('file'),
  files: k('file'),
  pr: k('pull'),
  prs: k('pull'),
  'pull request': k('pull'),
  'pull requests': k('pull'),
  'merge request': k('pull'),
  issue: k('issue'),
  issues: k('issue'),
  ticket: k('issue'),
  tickets: k('issue'),
  'ci run': k('ciRun'),
  'ci job': k('ciRun'),
  ci: k('ciRun'),
  build: k('ciRun'),
  builds: k('ciRun'),
  job: k('ciRun'),
  jobs: k('ciRun'),
  check: k('ciRun'),
  checks: k('ciRun'),
  pipeline: k('ciRun'),
  pipelines: k('ciRun'),
  run: k('ciRun', 'workflow', 'council'),
  runs: k('ciRun', 'workflow', 'council'),
  chat: k('chat'),
  chats: k('chat'),
  conversation: k('chat'),
  conversations: k('chat'),
  session: k('session'),
  sessions: k('session'),
  terminal: k('session'),
  terminals: k('session'),
  council: k('council'),
  councils: k('council'),
  workflow: k('workflow'),
  workflows: k('workflow'),
  board: k('board'),
  boards: k('board'),
  kanban: k('board'),
  card: k('card'),
  cards: k('card'),
  task: k('card'),
  tasks: k('card'),
  note: k('note'),
  notes: k('note'),
  doc: m('doc'),
  docs: m('doc'),
  document: m('doc'),
  documents: m('doc'),
  image: m('image'),
  images: m('image'),
  picture: m('image'),
  pictures: m('image'),
  photo: m('image'),
  photos: m('image'),
  video: m('video'),
  videos: m('video'),
  clip: m('video'),
  clips: m('video'),
  audio: m('audio'),
  song: m('audio'),
  songs: m('audio'),
  track: m('audio'),
  tracks: m('audio'),
  music: m('audio'),
  model: m('model'),
  models: m('model'),
  terrain: m('terrain'),
  terrains: m('terrain'),
  landscape: m('terrain'),
  sprite: m('sprite'),
  sprites: m('sprite'),
  map: m('map'),
  maps: m('map'),
  game: m('game'),
  games: m('game'),
  media: k('media'),
  table: k('dbTable'),
  tables: k('dbTable'),
  database: k('dbTable'),
  databases: k('dbTable'),
  db: k('dbTable'),
  connection: k('dbTable'),
  connections: k('dbTable'),
  request: k('apiRequest'),
  requests: k('apiRequest'),
  endpoint: k('apiRequest'),
  endpoints: k('apiRequest'),
  api: k('apiRequest'),
  tab: k('browserTab'),
  tabs: k('browserTab'),
  website: k('browserTab'),
  site: k('browserTab'),
  setting: k('setting'),
  settings: k('setting'),
  preference: k('setting'),
  preferences: k('setting'),
  section: k('setting'),
};

/** Words that never carry meaning in a description — articles, pronouns, the verbs a sentence wraps them in. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'my', 'our', 'your', 'me', 'i', 'we', 'it', 'its', 'one', 'ones', 'some', 'any',
  'open', 'show', 'find', 'go', 'take', 'bring', 'see', 'view', 'reveal', 'pull up', 'up', 'please',
  'about', 'for', 'called', 'named', 'titled', 'with', 'on', 'of', 'in', 'from', 'that', 'which',
  'where', 'is', 'was', 'to', 'and', 'or', 'at', 'by', 'had', 'did', 'made', 'i made', 'mentions',
  'mentioning',
]);

/** A preposition ends the head-noun phrase: in "the run for the auth PR", "run" is the head, not "PR". */
const HEAD_ENDERS: ReadonlySet<string> = new Set([
  'about', 'for', 'called', 'named', 'titled', 'with', 'on', 'of', 'in', 'from', 'that', 'which', 'where', 'mentioning',
]);

const RECENCY_PHRASES: readonly [RegExp, ResourceRecency][] = [
  // "previous" first — "the one before last" must not read "last" as latest.
  [/\b(?:previous|the one before(?: last| that)?|one before(?: last| that)?|before last|second to last|second last|penultimate|prior)\b/g, 'previous'],
  [/\b(?:latest|last|most recent|newest|recent)\b/g, 'latest'],
];

/** Multi-word stop and kind phrases, matched before the string is split into words. */
const PHRASES = [
  ...Object.keys(RESOURCE_KIND_WORDS).filter((word) => word.includes(' ')),
  ...[...STOPWORDS].filter((word) => word.includes(' ')),
].sort((a, b) => b.length - a.length);

/** The kind word `token` is, if any — own keys only, so "constructor" is just a word. */
export function resourceKindWord(token: string): KindWord | undefined {
  return Object.hasOwn(RESOURCE_KIND_WORDS, token) ? RESOURCE_KIND_WORDS[token] : undefined;
}

/** Holds a phrase's words together while the string is split. A no-break space never survives the `\s+` collapse above it. */
const PHRASE_JOIN = '\u00a0';

const SHA = /^[0-9a-f]{7,40}$/;
const SHORT_SHA = /^[0-9a-f]{4,40}$/;

function uniq<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Read a description into kinds, recency, exact ids and content words. Never
 * throws; an empty or all-stopword query comes back with nothing to match.
 */
export function parseResourceQuery(query: string): ParsedResourceQuery {
  const text = query.trim();
  let s = ` ${text.toLowerCase().replace(/[“”"'`’,;:!?()[\]{}]/g, ' ').replace(/\s+/g, ' ')} `;

  const exact: ResourceExactId[] = [];
  const takeNumber = (re: RegExp, kinds: readonly ('pull' | 'issue')[]): void => {
    s = s.replace(re, (_match, digits: string) => {
      const value = Number.parseInt(digits, 10);
      if (Number.isSafeInteger(value) && value > 0) exact.push({ type: 'number', value, kinds });
      return ' ';
    });
  };
  takeNumber(/\b(?:pr|pull request|merge request|pull)\s*(?:number\s*)?#?\s*(\d+)\b/g, ['pull']);
  takeNumber(/\b(?:issue|ticket)\s*(?:number\s*)?#?\s*(\d+)\b/g, ['issue']);
  takeNumber(/(?:^|\s)#(\d+)\b/g, ['pull', 'issue']);

  let recency: ResourceRecency | null = null;
  for (const [re, value] of RECENCY_PHRASES) {
    s = s.replace(re, () => {
      recency ??= value;
      return ' ';
    });
  }

  // Phrases become single tokens so "pull request" is one kind word and "pull up" one stopword.
  for (const phrase of PHRASES) s = s.split(` ${phrase} `).join(` ${phrase.replace(/ /g, PHRASE_JOIN)} `);
  const tokens = s
    .split(' ')
    .filter((token) => token !== '')
    .map((token) => token.split(PHRASE_JOIN).join(' ').replace(/^[#.\-/]+|[.\-/]+$/g, ''))
    .filter((token) => token !== '');

  // The head noun is the last kind word before the first preposition — or the last overall.
  const enderAt = tokens.findIndex((token) => HEAD_ENDERS.has(token));
  const headZone = enderAt === -1 ? tokens : tokens.slice(0, enderAt);
  let headAt = -1;
  for (let i = headZone.length - 1; i >= 0; i -= 1) {
    if (resourceKindWord(headZone[i]!)) {
      headAt = i;
      break;
    }
  }
  // "the latest auth chat" has its head before the ender; a phrase like "about the dragon model"
  // with nothing before "about" still names its kind, so fall back to the last kind word anywhere.
  if (headAt === -1) {
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      if (resourceKindWord(tokens[i]!)) {
        headAt = i;
        break;
      }
    }
  }
  const head = headAt === -1 ? undefined : resourceKindWord(tokens[headAt]!);

  const terms: string[] = [];
  const softTerms: string[] = [];
  const commitish = head?.kinds.includes('commit') ?? false;
  tokens.forEach((token, index) => {
    if (index === headAt || STOPWORDS.has(token)) return;
    if (SHA.test(token) && (/\d/.test(token) || commitish)) {
      exact.push({ type: 'sha', value: token });
      return;
    }
    if (commitish && SHORT_SHA.test(token) && /\d/.test(token)) {
      exact.push({ type: 'sha', value: token });
      return;
    }
    if (resourceKindWord(token)) softTerms.push(token);
    else terms.push(token);
  });

  return {
    text,
    headWord: headAt === -1 ? null : tokens[headAt]!,
    kinds: head ? [...head.kinds] : [],
    media: head?.media ? [...head.media] : [],
    recency,
    exact,
    terms: uniq(terms),
    softTerms: uniq(softTerms),
    description: uniq(terms).join(' '),
  };
}
