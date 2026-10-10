import { z } from 'zod';

import { MediaTabSchema, type MediaTab } from '../media';
import { SETTINGS_PAGE_IDS } from './view';

/**
 * Phase 112 Theme A — `ResourceRef`, one shape for "a thing in the app".
 *
 * A ref carries the minimum needed to find a thing again — never its body, its
 * title or any other state that can go stale — and a repo-scoped ref carries
 * its `repoId`, so the reveal engine (Theme B) can switch repos before it
 * selects anything. Everything here is data plus pure functions: the app owns
 * every opener, `desktop` only carries refs across MCP and the deep link.
 *
 * The variants are declared as four family tuples (git + forge, agent work,
 * notes + media, tools + settings) so the family split Themes C–F work in is
 * visible in the contract itself; `ResourceRefSchema` is their one union.
 */

/** `MediaKind` is the Media page's own tab id — one name per tab, no second list to drift. */
export const MediaKindSchema = MediaTabSchema;
export type MediaKind = MediaTab;

const id = z.string().min(1);
const repoId = z.string().min(1);
/** A full or abbreviated object name — Theme C expands an abbreviation with `resolveRevision`. */
const sha = z.string().regex(/^[0-9a-f]{4,64}$/i, 'not a commit sha');
const positiveInt = z.number().int().positive();

const GIT_REFS = [
  z.object({ kind: z.literal('commit'), repoId, sha }),
  /** A branch, tag or remote-tracking ref by its full name (`refs/heads/main`). */
  z.object({ kind: z.literal('ref'), repoId, fullName: z.string().min(1) }),
  z.object({ kind: z.literal('stash'), repoId, index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('file'), repoId, path: z.string().min(1), line: positiveInt.optional() }),
  z.object({ kind: z.literal('commitFile'), repoId, sha, path: z.string().min(1) }),
  z.object({ kind: z.literal('pull'), repoId, number: positiveInt }),
  z.object({ kind: z.literal('issue'), repoId, number: positiveInt }),
  z.object({ kind: z.literal('ciRun'), repoId, runId: id, jobId: id.optional() }),
] as const;

const AGENT_REFS = [
  z.object({ kind: z.literal('chat'), id }),
  z.object({ kind: z.literal('session'), id, closed: z.boolean().optional() }),
  z.object({ kind: z.literal('council'), id, runId: id.optional() }),
  z.object({ kind: z.literal('workflow'), id, runId: id.optional() }),
  z.object({ kind: z.literal('board'), repoId, projectId: id }),
  z.object({ kind: z.literal('card'), repoId, projectId: id, cardId: id }),
] as const;

const NOTES_MEDIA_REFS = [
  z.object({ kind: z.literal('note'), id }),
  z.object({
    kind: z.literal('media'),
    repoId,
    media: MediaKindSchema,
    project: z.string().min(1),
    path: z.string().min(1).optional(),
  }),
] as const;

const TOOLS_REFS = [
  z.object({ kind: z.literal('dbTable'), connectionId: id, table: z.string().min(1).optional() }),
  z.object({ kind: z.literal('apiRequest'), repoId, collectionId: id, itemPath: z.string().min(1) }),
  z.object({ kind: z.literal('browserTab'), url: z.string().url() }),
  z.object({
    kind: z.literal('setting'),
    page: z.enum(SETTINGS_PAGE_IDS),
    section: z.string().min(1).optional(),
  }),
] as const;

export const ResourceRefSchema = z.discriminatedUnion('kind', [
  ...GIT_REFS,
  ...AGENT_REFS,
  ...NOTES_MEDIA_REFS,
  ...TOOLS_REFS,
]);
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
export type ResourceKind = ResourceRef['kind'];
/** One variant of the union, by its kind — `ResourceRefOf<'commit'>`. */
export type ResourceRefOf<K extends ResourceKind> = Extract<ResourceRef, { kind: K }>;

export const RESOURCE_KINDS = [
  'commit',
  'ref',
  'stash',
  'file',
  'commitFile',
  'pull',
  'issue',
  'ciRun',
  'chat',
  'session',
  'council',
  'workflow',
  'board',
  'card',
  'note',
  'media',
  'dbTable',
  'apiRequest',
  'browserTab',
  'setting',
] as const satisfies readonly ResourceKind[];
export const ResourceKindSchema = z.enum(RESOURCE_KINDS);

// Compile-time proof RESOURCE_KINDS names every kind in the union — a kind
// added to a family tuple above without an entry here fails typecheck.
type MissingKind = Exclude<ResourceKind, (typeof RESOURCE_KINDS)[number]>;
const _everyKindListed: MissingKind extends never ? true : never = true;
void _everyKindListed;

/** The `repoId` a ref is scoped to, or `null` for an app-wide ref (chat, note, setting…). */
export function resourceRefRepoId(ref: ResourceRef): string | null {
  return 'repoId' in ref ? ref.repoId : null;
}

/**
 * A stable string identity for a ref — `kind` plus its fields in key order —
 * so two refs to the same thing compare equal, and a `names` map or history
 * list can be keyed by it.
 */
export function resourceRefKey(ref: ResourceRef): string {
  const { kind, ...rest } = ref;
  const fields = Object.entries(rest as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${kind}:${JSON.stringify(fields)}`;
}

export function resourceRefsEqual(a: ResourceRef, b: ResourceRef): boolean {
  return resourceRefKey(a) === resourceRefKey(b);
}

/** Titles for refs, keyed by {@link resourceRefKey} — supplied by whoever knows them, so `shared` stays data-only. */
export type ResourceNames = Readonly<Record<string, string>>;

const SHORT_SHA = 7;

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

function refName(fullName: string): string {
  if (fullName.startsWith('refs/heads/')) return `branch ${fullName.slice('refs/heads/'.length)}`;
  if (fullName.startsWith('refs/tags/')) return `tag ${fullName.slice('refs/tags/'.length)}`;
  if (fullName.startsWith('refs/remotes/')) return `remote branch ${fullName.slice('refs/remotes/'.length)}`;
  return fullName;
}

function host(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** "PageId" → "page id" — the fallback when no `names` entry supplies a settings page's label. */
function humanise(identifier: string): string {
  return identifier.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * The short, spoken/visible label for a ref — "commit a1b2c3d", "PR 812",
 * "the Auth chat", "the dragon model". Follows Phase 80 Theme A's spoken-form
 * rules: a sha is 7 characters, a URL is its host and never the whole thing.
 * A title comes from `names` (keyed by {@link resourceRefKey}); without one,
 * the label falls back to something derivable from the ref alone.
 */
export function resourceRefLabel(ref: ResourceRef, names?: ResourceNames): string {
  const title = names?.[resourceRefKey(ref)];
  switch (ref.kind) {
    case 'commit':
      return `commit ${ref.sha.slice(0, SHORT_SHA)}`;
    case 'ref':
      return refName(ref.fullName);
    case 'stash':
      return `stash ${ref.index}`;
    case 'file':
      return ref.line === undefined ? basename(ref.path) : `${basename(ref.path)} line ${ref.line}`;
    case 'commitFile':
      return `${basename(ref.path)} in commit ${ref.sha.slice(0, SHORT_SHA)}`;
    case 'pull':
      return `PR ${ref.number}`;
    case 'issue':
      return `issue ${ref.number}`;
    case 'ciRun':
      return ref.jobId === undefined ? `CI run ${ref.runId}` : `job ${ref.jobId} of CI run ${ref.runId}`;
    case 'chat':
      return title ? `the ${title} chat` : 'that chat';
    case 'session':
      return title ? `the ${title} session` : 'that session';
    case 'council':
      return title ? `the ${title} council` : 'that council';
    case 'workflow':
      if (ref.runId !== undefined) return title ? `a run of the ${title} workflow` : 'that workflow run';
      return title ? `the ${title} workflow` : 'that workflow';
    case 'board':
      return title ? `the ${title} board` : 'that board';
    case 'card':
      return title ? `card ${title}` : 'that card';
    case 'note':
      return title ? `the ${title} note` : 'that note';
    case 'media': {
      const name = title ?? (ref.path === undefined ? ref.project : basename(ref.path).replace(/\.[^.]+$/, ''));
      return `the ${name} ${ref.media}`;
    }
    case 'dbTable':
      if (ref.table !== undefined) return `table ${ref.table}`;
      return title ? `the ${title} connection` : 'that connection';
    case 'apiRequest':
      return `the ${title ?? basename(ref.itemPath)} request`;
    case 'browserTab':
      return host(ref.url);
    case 'setting': {
      const page = title ?? humanise(ref.page);
      return ref.section === undefined ? `${page} settings` : `${page} settings, ${humanise(ref.section)}`;
    }
  }
}
