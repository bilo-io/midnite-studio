import {
  listProjectsQuery,
  parseFields,
  parseItemsPage,
  parseProjectList,
  projectFieldsQuery,
  projectItemsQuery,
  scopeErrorKind,
} from '@midnite/forge-github-core';
import type {
  Forge,
  ForgeProject,
  ForgeProjectField,
  ForgeProjectFieldsResult,
  ForgeProjectItem,
  ForgeProjectItemsResult,
  ForgeProjectsResult,
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
 *
 * The query documents and the response parsers now live in `@midnite/forge-github-core` (Phase 146
 * Theme D), shared with the mobile app. What stays here is the `gh` transport and the `…FromStdout`
 * wrappers that turn `gh`'s output into the `data` object those parsers take.
 */

/**
 * The boards visible to the open repository's owner.
 */
export async function listProjects(forge: Forge): Promise<ForgeProjectsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, projects: [], error: null, kind: 'ok' };

  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(listProjectsQuery)}` +
    // `-f`, not `-F`: a String! variable sent through `-F` would have its type
    // guessed from the text, and an owner login that happens to look numeric
    // (rare, but legal) would be posted as an Int and refused outright. Same
    // reasoning for `repo`.
    ` -f owner=${shellQuote(forge.owner)}` +
    ` -f repo=${shellQuote(forge.repo)}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    const kind = scopeErrorKind(result.output);
    return { cli, projects: [], error: describeGraphqlFailure(result.output), kind };
  }

  return { cli, projects: parseProjectListFromStdout(result.output), error: null, kind: 'ok' };
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
    ` -f query=${shellQuote(projectFieldsQuery)}` +
    // `-f` for an ID! variable — the same reasoning `setThreadResolved` gives
    // for `threadId`: `-F` would type-guess the value out of being a string.
    ` -f projectId=${shellQuote(projectId)}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    const kind = scopeErrorKind(result.output);
    return { cli, fields: [], error: describeGraphqlFailure(result.output), kind };
  }

  return { cli, fields: parseFieldsFromStdout(result.output), error: null, kind: 'ok' };
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
    ` -f query=${shellQuote(projectItemsQuery)}` +
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

  const { items, nextCursor } = parseItemsPageFromStdout(result.output, `${forge.owner}/${forge.repo}`);
  return { cli, items, nextCursor, error: null, kind: 'ok' };
}

const dataOf = (output: string): unknown => {
  const payload = parseJsonPayload(output);
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)['data'] : undefined;
};

export const parseProjectListFromStdout = (output: string): ForgeProject[] => parseProjectList(dataOf(output));

export const parseFieldsFromStdout = (output: string): ForgeProjectField[] => parseFields(dataOf(output));

export function parseItemsPageFromStdout(
  output: string,
  boardRepo = '',
): { items: ForgeProjectItem[]; nextCursor: string | null } {
  return parseItemsPage(dataOf(output), boardRepo);
}

