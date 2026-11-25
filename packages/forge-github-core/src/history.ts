import { CommitSchema, type Commit } from '@midnite/studio-shared';

import type { GraphqlRequest } from './request';
import { asBool, asString, nodesOf, pick } from './json';

export const HISTORY_QUERY = [
  'query($owner:String!,$name:String!,$ref:String!,$first:Int!,$after:String){',
  'repository(owner:$owner,name:$name){',
  'ref(qualifiedName:$ref){target{... on Commit{',
  'history(first:$first,after:$after){pageInfo{hasNextPage endCursor}',
  'nodes{oid message messageHeadline authoredDate committedDate author{name email} parents(first:10){nodes{oid}}}}',
  '}}}}}',
].join('');

/** One page of a ref's commit history. `qualifiedRef` is `refs/heads/main` or `main`. */
export function historyQuery(
  owner: string,
  name: string,
  qualifiedRef: string,
  first: number,
  after: string | null = null,
): GraphqlRequest {
  return { query: HISTORY_QUERY, variables: { owner, name, ref: qualifiedRef, first, after } };
}

export interface HistoryPage {
  commits: Commit[];
  endCursor: string | null;
  hasNextPage: boolean;
}

/*
  Trailer rules mirror git-engine's log format (`%(trailers:key=Co-Authored-By,valueonly)` and
  `%(trailers:key=Midnite-Session,valueonly)`, packages/git-engine/src/parsers/log-parser.ts): git matches
  the key case-insensitively on `Key: value` lines in the message's last paragraph. Copied, not imported,
  because this package takes `shared` only.
*/
const CO_AUTHOR_TRAILER = /^co-authored-by:[ \t]*(.+?)[ \t]*$/i;
const SESSION_TRAILER = /^midnite-session:[ \t]*(.+?)[ \t]*$/i;

function trailers(message: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const line of message.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match?.[1]) out.push(match[1]);
  }
  return out;
}

const unixSeconds = (iso: string | null): number => {
  if (iso === null) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};

/** `repository.ref.target.history` as commits. A missing ref yields an empty page. `refs` is always `[]`. */
export function parseHistory(data: unknown): HistoryPage {
  const history = pick(pick(pick(pick(data, 'repository'), 'ref'), 'target'), 'history');
  const pageInfo = pick(history, 'pageInfo');
  const commits: Commit[] = [];
  for (const raw of nodesOf(history)) {
    const sha = asString(pick(raw, 'oid'));
    if (sha === null) continue;
    const message = asString(pick(raw, 'message')) ?? '';
    const authored = unixSeconds(asString(pick(raw, 'authoredDate')));
    const parsed = CommitSchema.safeParse({
      sha,
      parents: nodesOf(pick(raw, 'parents'))
        .map((p) => asString(pick(p, 'oid')))
        .filter((oid): oid is string => oid !== null),
      authorName: asString(pick(pick(raw, 'author'), 'name')) ?? '',
      authorEmail: asString(pick(pick(raw, 'author'), 'email')) ?? '',
      authorDate: authored,
      committerDate: unixSeconds(asString(pick(raw, 'committedDate'))) || authored,
      subject: asString(pick(raw, 'messageHeadline')) ?? message.split('\n')[0] ?? '',
      refs: [],
      coAuthors: trailers(message, CO_AUTHOR_TRAILER),
      sessionTrailers: trailers(message, SESSION_TRAILER),
    });
    if (parsed.success) commits.push(parsed.data);
  }
  return {
    commits,
    endCursor: asString(pick(pageInfo, 'endCursor')),
    hasNextPage: asBool(pick(pageInfo, 'hasNextPage')),
  };
}

