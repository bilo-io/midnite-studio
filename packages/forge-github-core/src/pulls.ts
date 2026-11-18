import {
  ForgePullDetailSchema,
  ForgePullSchema,
  type ForgePull,
  type ForgePullDetail,
  type ForgePullScope,
} from '@midnite/studio-shared';

import type { GraphqlRequest } from './request';
import { asBool, asInt, asString, nodesOf, pick } from './json';

/** The fields one list row needs. Shared by all three scopes so `parsePulls` reads one shape. */
const PULL_ROW_FIELDS =
  'id number title state isDraft reviewDecision headRefName url mergedAt closedAt author{login} ' +
  'comments{totalCount} commits(last:1){nodes{commit{statusCheckRollup{state}}}}';

export const PULLS_PAGE_MAX = 100;

const PULLS_ALL_QUERY = [
  'query($owner:String!,$name:String!,$first:Int!,$after:String){',
  'repository(owner:$owner,name:$name){',
  `pullRequests(states:OPEN,first:$first,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{${PULL_ROW_FIELDS}}}`,
  '}}',
].join('');

const PULLS_SEARCH_QUERY = [
  'query($q:String!,$first:Int!,$after:String){',
  `search(query:$q,type:ISSUE,first:$first,after:$after){pageInfo{hasNextPage endCursor} nodes{... on PullRequest{${PULL_ROW_FIELDS}}}}`,
  '}',
].join('');

/**
 * One page of a repo's open pull requests for a scope. "review-requested" and "mine" go through
 * `search(...)` (`review-requested:@me` / `author:@me`), "all" through `repository.pullRequests`.
 */
export function pullsQuery(
  owner: string,
  name: string,
  scope: ForgePullScope,
  first: number,
  after: string | null = null,
): GraphqlRequest {
  if (scope === 'all') {
    return { query: PULLS_ALL_QUERY, variables: { owner, name, first, after } };
  }
  const qualifier = scope === 'mine' ? 'author:@me' : 'review-requested:@me';
  return {
    query: PULLS_SEARCH_QUERY,
    variables: { q: `is:pr is:open ${qualifier} repo:${owner}/${name}`, first, after },
  };
}

/** GitHub's rollup state to the app's traffic light; null when the PR has no checks at all. */
function rollup(state: string | null): ForgePull['checks'] {
  switch (state) {
    case 'SUCCESS':
      return 'passing';
    case 'FAILURE':
    case 'ERROR':
      return 'failing';
    case 'PENDING':
    case 'EXPECTED':
      return 'pending';
    default:
      return null;
  }
}

const pullState = (value: string | null): ForgePull['state'] | null => {
  switch (value) {
    case 'OPEN':
      return 'open';
    case 'CLOSED':
      return 'closed';
    case 'MERGED':
      return 'merged';
    default:
      return null;
  }
};

const reviewDecision = (value: string | null): ForgePull['reviewDecision'] =>
  value === 'APPROVED' || value === 'CHANGES_REQUESTED' || value === 'REVIEW_REQUIRED' ? value : null;

function parsePullNode(raw: unknown): ForgePull | null {
  const state = pullState(asString(pick(raw, 'state')));
  if (state === null) return null; // a search node that is not a PullRequest arrives as `{}`
  const lastCommit = nodesOf(pick(raw, 'commits'))[0];
  const parsed = ForgePullSchema.safeParse({
    id: asString(pick(raw, 'id')) ?? '',
    number: pick(raw, 'number'),
    title: asString(pick(raw, 'title')) ?? '',
    state,
    isDraft: asBool(pick(raw, 'isDraft')),
    reviewDecision: reviewDecision(asString(pick(raw, 'reviewDecision'))),
    checks: rollup(asString(pick(pick(pick(lastCommit, 'commit'), 'statusCheckRollup'), 'state'))),
    headBranch: asString(pick(raw, 'headRefName')) ?? '',
    author: asString(pick(pick(raw, 'author'), 'login')) ?? '',
    url: asString(pick(raw, 'url')) ?? '',
    mergedAt: asString(pick(raw, 'mergedAt')),
    closedAt: asString(pick(raw, 'closedAt')),
    commentCount: asInt(pick(pick(raw, 'comments'), 'totalCount')) ?? 0,
  });
  return parsed.success ? parsed.data : null;
}

export interface PullsPage {
  pulls: ForgePull[];
  endCursor: string | null;
  hasNextPage: boolean;
}

/** Either `repository.pullRequests` (scope all) or `search` (mine, review-requested). */
export function parsePullsPage(data: unknown): PullsPage {
  const connection = pick(pick(data, 'repository'), 'pullRequests') ?? pick(data, 'search');
  const pageInfo = pick(connection, 'pageInfo');
  const pulls: ForgePull[] = [];
  for (const raw of nodesOf(connection)) {
    const pull = parsePullNode(raw);
    if (pull) pulls.push(pull);
  }
  return {
    pulls,
    endCursor: asString(pick(pageInfo, 'endCursor')),
    hasNextPage: asBool(pick(pageInfo, 'hasNextPage')),
  };
}

export const parsePulls = (data: unknown): ForgePull[] => parsePullsPage(data).pulls;

export const PULL_DETAIL_QUERY = [
  'query($owner:String!,$name:String!,$number:Int!){',
  'repository(owner:$owner,name:$name){pullRequest(number:$number){',
  `${PULL_ROW_FIELDS} body headRefOid baseRefOid baseRefName additions deletions changedFiles createdAt updatedAt mergeable `,
  'allCommits:commits(last:3){totalCount nodes{commit{oid messageHeadline}}} ',
  'reviewRequests(first:20){nodes{requestedReviewer{__typename ... on User{login} ... on Team{name}}}}',
  '}}}',
].join('');

export function pullDetailQuery(owner: string, name: string, number: number): GraphqlRequest {
  return { query: PULL_DETAIL_QUERY, variables: { owner, name, number } };
}

/** `repository.pullRequest` as `ForgePullDetail`, or null when the PR is not visible. */
export function parsePullDetail(data: unknown): ForgePullDetail | null {
  const raw = pick(pick(data, 'repository'), 'pullRequest');
  const pull = parsePullNode(raw);
  if (pull === null) return null;
  const all = pick(raw, 'allCommits');
  const parsed = ForgePullDetailSchema.safeParse({
    pull,
    body: asString(pick(raw, 'body')) ?? '',
    headSha: asString(pick(raw, 'headRefOid')),
    baseSha: asString(pick(raw, 'baseRefOid')),
    baseBranch: asString(pick(raw, 'baseRefName')) ?? '',
    additions: asInt(pick(raw, 'additions')),
    deletions: asInt(pick(raw, 'deletions')),
    changedFiles: asInt(pick(raw, 'changedFiles')),
    createdAt: asString(pick(raw, 'createdAt')),
    updatedAt: asString(pick(raw, 'updatedAt')),
    mergeable: asString(pick(raw, 'mergeable')),
    commitCount: asInt(pick(all, 'totalCount')) ?? 0,
    commits: nodesOf(all)
      .map((node) => ({
        sha: asString(pick(pick(node, 'commit'), 'oid')) ?? '',
        subject: asString(pick(pick(node, 'commit'), 'messageHeadline')) ?? '',
      }))
      .filter((commit) => commit.sha !== ''),
    reviewRequests: nodesOf(pick(raw, 'reviewRequests'))
      .map((node) => {
        const reviewer = pick(node, 'requestedReviewer');
        return asString(pick(reviewer, 'login')) ?? asString(pick(reviewer, 'name'));
      })
      .filter((name): name is string => name !== null && name.length > 0),
  });
  return parsed.success ? parsed.data : null;
}
