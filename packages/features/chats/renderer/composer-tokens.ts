import type { ChatSkill } from '@midnite/studio-shared';

/**
 * The pure half of the Chats composer's `/` (skills) and `@` (files) pickers:
 * where a trigger is, what matches it, and where the pills sit in the text.
 *
 * A pill is not separate state. The composer's text IS the prompt — `/name`
 * and `@path` stay in it verbatim, so "serialise on send" is the identity —
 * and a pill is any whitespace-delimited `/name` naming a discovered skill, or
 * `@path` naming a listed file. The textarea's overlay paints those ranges as
 * pills; Backspace at one deletes the range. Deriving them from the text means
 * a restored draft, a paste or a hand-typed `/skill` all render the same way.
 */

export type PickerKind = 'skill' | 'file';

/** The token being typed at the caret: `[start, end)` is what a pick replaces (`start` is the `/` or `@`). */
export type Trigger = { kind: PickerKind; start: number; end: number; query: string };

/** A half-open `[start, end)` range into some string. */
export type MatchRange = readonly [number, number];

export type PillToken = { kind: PickerKind; start: number; end: number; value: string };

export const PICKER_LIMIT = 10;

const SIGIL: Record<string, PickerKind> = { '/': 'skill', '@': 'file' };

/**
 * The trigger whose token the caret is in, or `null`. A trigger only starts a
 * word (start of text or after whitespace), so `src/app` and `me@x.com` never
 * open a picker; a `/` token containing another `/` is a path, not a skill.
 */
export function findTrigger(text: string, caret: number): Trigger | null {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start -= 1;
  const kind = SIGIL[text[start] ?? ''];
  if (!kind || start >= caret) return null;
  const query = text.slice(start + 1, caret);
  if (kind === 'skill' && query.includes('/')) return null;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end]!)) end += 1;
  return { kind, start, end, query };
}

/** Case-insensitive substring position of `query` in `text`. */
export function substringRange(text: string, query: string): MatchRange | null {
  if (query.length === 0) return null;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  return at === -1 ? null : [at, at + query.length];
}

export type SkillMatch = { skill: ChatSkill; range: MatchRange | null };

/**
 * At most `limit` skills whose name contains `query` anywhere. Ranked: a name
 * that starts with the query, then earlier matches, then shorter names, then
 * alphabetical — so `sit` puts `sitrep` over `midnite-sitrep`. An empty query
 * is the first `limit` skills as given (main sorts them by name).
 */
export function matchSkills(skills: readonly ChatSkill[], query: string, limit = PICKER_LIMIT): SkillMatch[] {
  if (query.length === 0) return skills.slice(0, limit).map((skill) => ({ skill, range: null }));
  const q = query.toLowerCase();
  const hits: { skill: ChatSkill; at: number }[] = [];
  for (const skill of skills) {
    const at = skill.name.toLowerCase().indexOf(q);
    if (at !== -1) hits.push({ skill, at });
  }
  hits.sort(
    (a, b) =>
      Number(b.at === 0) - Number(a.at === 0) ||
      a.at - b.at ||
      a.skill.name.length - b.skill.name.length ||
      a.skill.name.localeCompare(b.skill.name),
  );
  return hits.slice(0, limit).map(({ skill, at }) => ({ skill, range: [at, at + query.length] as const }));
}

export type FileMatch = {
  path: string;
  /** The basename — the row's title. */
  name: string;
  /** The directory, `''` at the root — the row's subtitle. */
  dir: string;
  nameRange: MatchRange | null;
  dirRange: MatchRange | null;
};

function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? { name: path, dir: '' } : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

/**
 * At most `limit` files whose relative path contains `query` anywhere. The hit
 * is mapped onto the basename and/or directory so each half highlights its own
 * part. Ranked: a hit inside the basename (prefix first), then shorter paths,
 * then alphabetical. An empty query is the shallowest files first.
 */
export function matchFiles(files: readonly string[], query: string, limit = PICKER_LIMIT): FileMatch[] {
  const q = query.toLowerCase();
  const hits: { path: string; at: number; nameAt: number }[] = [];
  for (const path of files) {
    const lower = path.toLowerCase();
    const nameAt = path.lastIndexOf('/') + 1;
    // Prefer the occurrence inside the basename: `chat` in `chats/chat-x.ts` is the file's name, not its folder's.
    const inName = lower.indexOf(q, nameAt);
    const at = q.length === 0 ? 0 : inName !== -1 ? inName : lower.indexOf(q);
    if (at === -1) continue;
    hits.push({ path, at, nameAt });
  }
  const rank = (h: { at: number; nameAt: number }) => (q.length === 0 ? 0 : h.at === h.nameAt ? 0 : h.at > h.nameAt ? 1 : 2);
  hits.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.path.split('/').length - b.path.split('/').length ||
      a.path.length - b.path.length ||
      a.path.localeCompare(b.path),
  );
  return hits.slice(0, limit).map(({ path, at, nameAt }) => {
    const { name, dir } = splitPath(path);
    if (q.length === 0) return { path, name, dir, nameRange: null, dirRange: null };
    const end = at + q.length;
    const nameRange: MatchRange | null = end > nameAt ? [Math.max(at, nameAt) - nameAt, end - nameAt] : null;
    // The directory is `path[0, nameAt - 1)` — the separating `/` belongs to neither half.
    const dirEnd = Math.max(nameAt - 1, 0);
    const dirRange: MatchRange | null = at < dirEnd ? [at, Math.min(end, dirEnd)] : null;
    return { path, name, dir, nameRange, dirRange };
  });
}

/** `text` cut around `range`, for rendering the matched part in a `<mark>`. */
export function splitHighlight(text: string, range: MatchRange | null): { before: string; match: string; after: string } {
  if (!range) return { before: text, match: '', after: '' };
  return { before: text.slice(0, range[0]), match: text.slice(range[0], range[1]), after: text.slice(range[1]) };
}

/** Every pill in `text`: a whitespace-delimited `/name` of a known skill, or `@path` of a known file. */
export function findPills(text: string, skills: ReadonlySet<string>, files: ReadonlySet<string>): PillToken[] {
  const pills: PillToken[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const token = m[0];
    const kind = SIGIL[token[0]!];
    const value = token.slice(1);
    if (!kind || value.length === 0) continue;
    if (kind === 'skill' ? skills.has(value) : files.has(value)) {
      pills.push({ kind, start: m.index, end: m.index + token.length, value });
    }
  }
  return pills;
}

/** The pill Backspace at `caret` would delete: the caret is at its end or inside it. */
export function pillAtCaret(pills: readonly PillToken[], caret: number): PillToken | undefined {
  return pills.find((p) => p.start < caret && caret <= p.end);
}

/** Replace the trigger's token with `token` plus one separating space; the caret lands after it. */
export function insertToken(text: string, trigger: Pick<Trigger, 'start' | 'end'>, token: string): { text: string; caret: number } {
  const rest = text.slice(trigger.end);
  const spaced = /^\s/.test(rest) ? token : `${token} `;
  const caret = trigger.start + spaced.length + (/^\s/.test(rest) ? 1 : 0);
  return { text: text.slice(0, trigger.start) + spaced + rest, caret };
}

/** Delete a pill's range; the caret lands where it began. */
export function removePill(text: string, pill: Pick<PillToken, 'start' | 'end'>): { text: string; caret: number } {
  return { text: text.slice(0, pill.start) + text.slice(pill.end), caret: pill.start };
}
