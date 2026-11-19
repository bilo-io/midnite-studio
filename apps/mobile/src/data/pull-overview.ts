// Theme I: the parts of a pull request the detail screen needs beyond `ForgePullDetail` (which carries only the checks
// rollup): the check list, reviewer states and PR-level comments, in one GraphQL call.
import type { GraphqlRequest } from '@midnite/forge-github-core';
import type { PullCheck, PullComment, PullOverview, PullReviewer } from './source';

export const pullOverviewQuery = (owner: string, name: string, number: number): GraphqlRequest => ({
  query:
    'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){' +
    'reviewRequests(first:50){nodes{requestedReviewer{... on User{login} ... on Team{name}}}} ' +
    'latestReviews(first:50){nodes{state author{login}}} ' +
    'comments(first:100){nodes{id author{login} body createdAt}} ' +
    'commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{' +
    '__typename ... on CheckRun{name status conclusion detailsUrl} ... on StatusContext{context state targetUrl}}}}}}}}}}',
  variables: { owner, name, number },
});

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const nodes = (v: unknown): Record<string, unknown>[] => {
  const n = obj(v).nodes;
  return Array.isArray(n) ? n.map(obj) : [];
};

const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']);

export function checkConclusion(status: string | null, conclusion: string | null): PullCheck['conclusion'] {
  if (status && status !== 'COMPLETED') return 'pending';
  switch (conclusion) {
    case 'SUCCESS':
      return 'success';
    case 'NEUTRAL':
      return 'neutral';
    case 'SKIPPED':
      return 'skipped';
    case null:
      return 'pending';
    default:
      return 'failure';
  }
}

function statusContext(state: string | null): PullCheck['conclusion'] {
  if (state === 'SUCCESS') return 'success';
  if (state === 'PENDING' || state === 'EXPECTED') return 'pending';
  return 'failure';
}

export function parsePullOverview(data: unknown): PullOverview {
  const pr = obj(obj(obj(data).repository).pullRequest);
  const checks: PullCheck[] = nodes(obj(obj(nodes(pr.commits)[0]?.commit).statusCheckRollup).contexts).map((c) =>
    c.__typename === 'StatusContext'
      ? { name: str(c.context) ?? 'status', conclusion: statusContext(str(c.state)), detailsUrl: str(c.targetUrl) }
      : { name: str(c.name) ?? 'check', conclusion: checkConclusion(str(c.status), str(c.conclusion)), detailsUrl: str(c.detailsUrl) },
  );
  const reviewers = new Map<string, PullReviewer>();
  for (const r of nodes(pr.reviewRequests)) {
    const who = obj(r.requestedReviewer);
    const login = str(who.login) ?? str(who.name);
    if (login) reviewers.set(login, { login, state: 'REQUESTED' });
  }
  for (const r of nodes(pr.latestReviews)) {
    const login = str(obj(r.author).login);
    const state = str(r.state);
    if (login && state && REVIEW_STATES.has(state)) reviewers.set(login, { login, state: state as PullReviewer['state'] });
  }
  const comments: PullComment[] = nodes(pr.comments).map((c) => ({
    id: str(c.id) ?? '',
    author: str(obj(c.author).login) ?? '',
    body: str(c.body) ?? '',
    createdAt: str(c.createdAt) ?? '',
  }));
  return { checks, reviewers: [...reviewers.values()], comments };
}
