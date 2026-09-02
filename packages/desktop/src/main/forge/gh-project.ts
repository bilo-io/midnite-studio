import {
  ForgeProjectFieldSchema,
  ForgeProjectFieldValueSchema,
  ForgeProjectItemSchema,
  ForgeProjectSchema,
  type Forge,
  type ForgeProject,
  type ForgeProjectField,
  type ForgeProjectFieldsResult,
  type ForgeProjectFieldValue,
  type ForgeProjectItem,
  type ForgeProjectItemsResult,
  type ForgeProjectReadKind,
  type ForgeProjectsResult,
} from '@midnite/studio-shared';

import { describeGraphqlFailure } from './gh-graphql';
import { parseJsonPayload } from './gh-parse';
import {
  apiHostFlag,
  ghStatus,
  invalidateGhProbe,
  LIST_TIMEOUT_MS,
  runInShell,
  shellQuote,
} from './gh-shell';

/**
 * GitHub ProjectV2 reads (Phase 40 Theme B) — boards, fields and items,
 * through the same `gh api graphql` escape hatch `gh-graphql.ts` uses for
 * inline review threads. Kept in its own file rather than widening
 * `gh-graphql.ts`: that module's own docblock argues for staying "the one
 * GraphQL read in the app", and a whole ProjectV2 surface is a deliberate,
 * bounded widening of that rule rather than an exception to it.
 *
 * No caching here — see the phase doc's own Decision. `gh-cache.ts` does not
 * exist, and the one real TTL cache in this layer (`gh-cli.ts`'s workflow
 * cache) is keyed per repo, which is the wrong shape for a board that belongs
 * to an *owner*. React-query (Theme C) owns staleness instead.
 */

/** How many boards a single listing asks for. Twenty is GitHub's own default page. */
const PROJECTS_PAGE = 20;
/** How many custom field definitions a board is asked for at once. */
const FIELDS_PAGE = 50;
/** GraphQL connection page size for items — see the phase doc's pagination note. */
const ITEMS_PAGE = 100;
/** Assignees per item. A project item with more than this is not realistic. */
const ASSIGNEES_PAGE = 10;

/**
 * The boards visible to `$owner` — a repository's owner may be a `User` or an
 * `Organization`, and ProjectV2's root field differs between the two.
 *
 * `repositoryOwner(login:)` resolves either kind through one field, with an
 * inline fragment on both `... on Organization` and `... on User` — the
 * phase doc's own Decision, taken over the alternative of probing which kind
 * the owner is and caching that answer. That alternative needs a cache to
 * invalidate and a second round trip on a cache miss; this needs neither, at
 * the cost of one field being asked for twice in one query (GraphQL simply
 * skips whichever fragment does not apply).
 *
 * Deliberately NOT the reference's `viewer`-rooted query: `viewer.projectsV2`
 * plus `viewer.organizations.nodes[].projectsV2` answers "boards **I** can
 * see", not "boards **this repo's owner** has", and the two diverge for any
 * repo whose owner org the signed-in user does not belong to.
 */
const LIST_PROJECTS_QUERY = [
  'query($owner:String!){',
  'repositoryOwner(login:$owner){',
  `... on Organization{projectsV2(first:${PROJECTS_PAGE},orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number title url closed}}}`,
  `... on User{projectsV2(first:${PROJECTS_PAGE},orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number title url closed}}}`,
  '}}',
].join('');

/**
 * One board's field definitions, by node id.
 *
 * `fields` is a union of three GraphQL types (`ProjectV2Field`,
 * `ProjectV2IterationField`, `ProjectV2SingleSelectField`), told apart by
 * `__typename` and each carrying its own `dataType`. A built-in field —
 * Title, Assignees, Labels, Milestone, Reviewers, Linked Pull Requests — comes
 * back as a plain `ProjectV2Field` whose `dataType` is one of those names
 * rather than `TEXT`/`NUMBER`/`DATE`, which is exactly the case
 * `parseFields`'s per-element `safeParse` is built to drop without losing the
 * fields around it.
 */
const PROJECT_FIELDS_QUERY = [
  'query($projectId:ID!){',
  'node(id:$projectId){',
  '... on ProjectV2{',
  `fields(first:${FIELDS_PAGE}){nodes{`,
  '__typename ',
  '... on ProjectV2Field{id name dataType}',
  '... on ProjectV2IterationField{id name dataType}',
  '... on ProjectV2SingleSelectField{id name dataType options{id name color}}',
  '}}',
  '}}}',
].join('');

/**
 * One page of a board's items.
 *
 * `content` is a union over `Issue` / `PullRequest` / `DraftIssue` — a draft
 * has neither a number nor a url, which is the whole reason
 * `ForgeProjectItemContent` is a discriminated union rather than one shape
 * with optional fields (see that schema's own note). `fieldValues.nodes` is
 * the heterogeneous list `parseFieldValues` flattens — every node not named
 * by one of the five inline fragments below arrives as a bare `{__typename}`,
 * which is the "unrecognised field type" case that schema's own note and this
 * phase's test both exist to cover.
 */
const PROJECT_ITEMS_QUERY = [
  'query($projectId:ID!,$cursor:String){',
  'node(id:$projectId){',
  '... on ProjectV2{',
  `items(first:${ITEMS_PAGE},after:$cursor){`,
  'pageInfo{hasNextPage endCursor}',
  'nodes{',
  'id ',
  'content{',
  '__typename ',
  `... on Issue{id number title url state assignees(first:${ASSIGNEES_PAGE}){nodes{login}}}`,
  `... on PullRequest{id number title url state assignees(first:${ASSIGNEES_PAGE}){nodes{login}}}`,
  `... on DraftIssue{id title assignees(first:${ASSIGNEES_PAGE}){nodes{login}}}`,
  '}',
  `fieldValues(first:${FIELDS_PAGE}){nodes{`,
  '__typename ',
  '... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{id}}}',
  '... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2FieldCommon{id}}}',
  '... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2FieldCommon{id}}}',
  '... on ProjectV2ItemFieldSingleSelectValue{optionId name field{... on ProjectV2FieldCommon{id}}}',
  '... on ProjectV2ItemFieldIterationValue{iterationId title field{... on ProjectV2FieldCommon{id}}}',
  '}}',
  '}}}}}',
].join('');

/**
 * The boards visible to the open repository's owner.
 */
export async function listProjects(forge: Forge): Promise<ForgeProjectsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, projects: [], error: null, kind: 'ok' };

  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(LIST_PROJECTS_QUERY)}` +
    // `-f`, not `-F`: a String! variable sent through `-F` would have its type
    // guessed from the text, and an owner login that happens to look numeric
    // (rare, but legal) would be posted as an Int and refused outright.
    ` -f owner=${shellQuote(forge.owner)}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    const kind = scopeErrorKind(result.output);
    return { cli, projects: [], error: describeGraphqlFailure(result.output), kind };
  }

  return { cli, projects: parseProjectList(result.output), error: null, kind: 'ok' };
}

/** One board's field definitions, for the table's columns. */
export async function projectFields(
  forge: Forge,
  projectId: string,
): Promise<ForgeProjectFieldsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, fields: [], error: null, kind: 'ok' };

  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(PROJECT_FIELDS_QUERY)}` +
    // `-f` for an ID! variable — the same reasoning `setThreadResolved` gives
    // for `threadId`: `-F` would type-guess the value out of being a string.
    ` -f projectId=${shellQuote(projectId)}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    const kind = scopeErrorKind(result.output);
    return { cli, fields: [], error: describeGraphqlFailure(result.output), kind };
  }

  return { cli, fields: parseFields(result.output), error: null, kind: 'ok' };
}

/**
 * One page of a board's items, cursor-forward.
 *
 * One GraphQL page per call, matching the IPC contract's own shape
 * (`ForgeProjectItemsRequest`/`Response` carry exactly one page's
 * `cursor`/`nextCursor`) — the walk across pages, and the 1 000-item ceiling
 * the phase doc asks for, lives in the query layer (Theme C), which is what
 * lets it stay sequential without main holding open state across calls. This
 * function's own job is the one subprocess for the one page it was asked for.
 */
export async function projectItems(
  forge: Forge,
  projectId: string,
  cursor?: string,
): Promise<ForgeProjectItemsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(PROJECT_ITEMS_QUERY)}` +
    ` -f projectId=${shellQuote(projectId)}` +
    // `$cursor` is a nullable `String`; omitting the flag entirely on the
    // first page leaves the variable unset, which GraphQL treats as null —
    // exactly what an absent `after` argument means.
    (cursor ? ` -f cursor=${shellQuote(cursor)}` : '');

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    const kind = scopeErrorKind(result.output);
    return { cli, items: [], nextCursor: null, error: describeGraphqlFailure(result.output), kind };
  }

  const { items, nextCursor } = parseItemsPage(result.output);
  return { cli, items, nextCursor, error: null, kind: 'ok' };
}

/**
 * Whether a failed call was refused for a missing OAuth scope.
 *
 * GitHub's GraphQL API marks this failure with `"type":"INSUFFICIENT_SCOPES"`
 * in the error object — matched by substring on the raw output rather than a
 * full JSON parse, because the same reasoning `describeGraphqlFailure`
 * documents applies here: on a query error `gh api graphql` writes the
 * `{"errors":[…]}` body to stdout with no clean boundary from `gh`'s own
 * stderr line, so a substring match is the robust check and a strict parse is
 * not. `read:project` is matched too, for the same scope named in prose by a
 * differently-worded refusal on some `gh` versions.
 */
function scopeErrorKind(output: string): ForgeProjectReadKind {
  return /INSUFFICIENT_SCOPES/.test(output) || /\bread:project\b/.test(output)
    ? 'insufficient-scope'
    : 'error';
}

const pick = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * `repositoryOwner.{Organization,User}.projectsV2.nodes`, as `ForgeProject[]`.
 *
 * Only one of the two inline fragments ever has data — the owner is one kind
 * or the other — so both are walked and whichever is non-empty wins. Rows are
 * validated one at a time (the same rule every parser in this app follows) so
 * a single malformed board never costs the whole listing.
 */
export function parseProjectList(output: string): ForgeProject[] {
  const payload = parseJsonPayload(output);
  const owner = pick(pick(payload, 'data'), 'repositoryOwner');
  const nodes = [
    ...asArray(pick(pick(owner, 'projectsV2'), 'nodes')),
  ];

  const projects: ForgeProject[] = [];
  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const parsed = ForgeProjectSchema.safeParse({
      id: asString(row['id']),
      number: row['number'],
      title: asString(row['title']) ?? '',
      url: asString(row['url']) ?? '',
      closed: row['closed'] === true,
    });
    if (parsed.success) projects.push(parsed.data);
  }
  return projects;
}

/**
 * `node.fields.nodes`, as `ForgeProjectField[]`.
 *
 * `safeParse` per element against the discriminated union — a built-in field
 * whose `dataType` is not one of `text`/`number`/`date`/`single_select`/
 * `iteration` fails to parse and is dropped, never the whole board.
 */
export function parseFields(output: string): ForgeProjectField[] {
  const payload = parseJsonPayload(output);
  const project = pick(pick(pick(payload, 'data'), 'node'), 'fields');
  const nodes = asArray(pick(project, 'nodes'));

  const fields: ForgeProjectField[] = [];
  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const dataType = fieldDataType(asString(row['dataType']));
    if (dataType === null) continue;

    const base = { id: asString(row['id']) ?? '', name: asString(row['name']) ?? '' };
    const shape =
      dataType === 'single_select'
        ? { ...base, dataType, options: parseOptions(row['options']) }
        : { ...base, dataType };

    const parsed = ForgeProjectFieldSchema.safeParse(shape);
    if (parsed.success) fields.push(parsed.data);
  }
  return fields;
}

/**
 * GitHub's field `dataType` enum (`TEXT`, `NUMBER`, `DATE`, `SINGLE_SELECT`,
 * `ITERATION`, and a dozen built-in-field values this app does not render),
 * to this contract's lowercase, snake_case member — or `null` for everything
 * this union does not carry, which is most of the built-in fields.
 */
function fieldDataType(value: string | null): ForgeProjectField['dataType'] | null {
  switch (value) {
    case 'TEXT':
      return 'text';
    case 'NUMBER':
      return 'number';
    case 'DATE':
      return 'date';
    case 'SINGLE_SELECT':
      return 'single_select';
    case 'ITERATION':
      return 'iteration';
    default:
      return null;
  }
}

function parseOptions(value: unknown): { id: string; name: string; color: string }[] {
  const options: { id: string; name: string; color: string }[] = [];
  for (const raw of asArray(value)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const id = asString(row['id']);
    const name = asString(row['name']);
    if (id === null || name === null) continue;
    options.push({ id, name, color: asString(row['color']) ?? '' });
  }
  return options;
}

/** `node.items`, as one page of `ForgeProjectItem[]` plus the next cursor. */
export function parseItemsPage(output: string): {
  items: ForgeProjectItem[];
  nextCursor: string | null;
} {
  const payload = parseJsonPayload(output);
  const items = pick(pick(pick(payload, 'data'), 'node'), 'items');
  const nodes = asArray(pick(items, 'nodes'));
  const pageInfo = pick(items, 'pageInfo');
  const hasNextPage = pick(pageInfo, 'hasNextPage') === true;
  const endCursor = asString(pick(pageInfo, 'endCursor'));

  const parsedItems: ForgeProjectItem[] = [];
  for (const raw of nodes) {
    const item = parseItem(raw);
    if (item) parsedItems.push(item);
  }

  return { items: parsedItems, nextCursor: hasNextPage ? endCursor : null };
}

/**
 * One `items.nodes[]` entry, as a `ForgeProjectItem` — or `null` if its
 * content cannot be understood, the same "drop the row, not the page" rule
 * every parser here follows.
 */
function parseItem(raw: unknown): ForgeProjectItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const id = asString(row['id']);
  if (id === null) return null;

  const content = parseItemContent(row['content']);
  if (content === null) return null;

  const parsed = ForgeProjectItemSchema.safeParse({
    id,
    content,
    fieldValues: parseFieldValues(row['fieldValues']),
  });
  return parsed.success ? parsed.data : null;
}

function parseItemContent(value: unknown): ForgeProjectItem['content'] | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const typename = asString(row['__typename']);
  const id = asString(row['id']);
  if (id === null) return null;

  const assignees = asArray(pick(row['assignees'], 'nodes'))
    .map((entry) => asString(pick(entry, 'login')))
    .filter((login): login is string => login !== null && login.length > 0);

  if (typename === 'Issue' || typename === 'PullRequest') {
    const number = row['number'];
    const title = asString(row['title']);
    const url = asString(row['url']);
    const state = asString(row['state'])?.toLowerCase();
    if (typeof number !== 'number' || title === null || url === null || state === undefined) {
      return null;
    }
    return typename === 'Issue'
      ? { type: 'issue', id, number, title, url, state: state as 'open' | 'closed', assignees }
      : {
          type: 'pull',
          id,
          number,
          title,
          url,
          state: state as 'open' | 'closed' | 'merged',
          assignees,
        };
  }

  if (typename === 'DraftIssue') {
    const title = asString(row['title']) ?? '';
    return { type: 'draft', id, title, assignees };
  }

  return null;
}

/**
 * `fieldValues.nodes[]` — a heterogeneous GraphQL union — flattened into the
 * flat `Record<fieldId, ForgeProjectFieldValue>` the contract declares.
 *
 * **`safeParse` one element at a time, `continue` on failure.** This is the
 * theme's highest-risk part, restated from `parseJobs`'s own rule
 * (`gh-parse.ts:435`): handing the whole array to a schema would let zod fail
 * every field over one node this app does not recognise. Every node whose
 * `__typename` is not one of the five value types named in the query arrives
 * as a bare `{__typename: "..."}` with no `field`/value at all — that node
 * fails `pick(row, 'field')` and is dropped here, one field short, never the
 * whole item.
 */
function parseFieldValues(value: unknown): Record<string, ForgeProjectFieldValue> {
  const values: Record<string, ForgeProjectFieldValue> = {};

  for (const raw of asArray(pick(value, 'nodes'))) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const fieldId = asString(pick(row['field'], 'id'));
    if (fieldId === null) continue;

    const typename = asString(row['__typename']);
    const shape = fieldValueShape(fieldId, typename, row);
    if (shape === null) continue;

    const parsed = ForgeProjectFieldValueSchema.safeParse(shape);
    if (parsed.success) values[fieldId] = parsed.data;
  }

  return values;
}

function fieldValueShape(
  fieldId: string,
  typename: string | null,
  row: Record<string, unknown>,
): Record<string, unknown> | null {
  switch (typename) {
    case 'ProjectV2ItemFieldTextValue': {
      const text = asString(row['text']);
      return text === null ? null : { fieldId, dataType: 'text', text };
    }
    case 'ProjectV2ItemFieldNumberValue': {
      const number = row['number'];
      return typeof number === 'number' ? { fieldId, dataType: 'number', number } : null;
    }
    case 'ProjectV2ItemFieldDateValue': {
      const date = asString(row['date']);
      return date === null ? null : { fieldId, dataType: 'date', date };
    }
    case 'ProjectV2ItemFieldSingleSelectValue': {
      const optionId = asString(row['optionId']);
      return optionId === null
        ? null
        : { fieldId, dataType: 'single_select', optionId, name: asString(row['name']) ?? '' };
    }
    case 'ProjectV2ItemFieldIterationValue': {
      const iterationId = asString(row['iterationId']);
      return iterationId === null
        ? null
        : { fieldId, dataType: 'iteration', iterationId, title: asString(row['title']) ?? '' };
    }
    default:
      // An unrecognised node type — the array-safety guard this whole
      // function exists to prove. Drop this one field value; the item and
      // every other field on it are untouched.
      return null;
  }
}
