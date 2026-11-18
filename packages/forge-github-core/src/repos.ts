import type { GraphqlRequest } from './request';
import { asBool, asString, nodesOf, pick } from './json';

const REPO_FIELDS = 'name owner{login} isPrivate pushedAt defaultBranchRef{name}';

/**
 * The signed-in user's repos plus every organisation's repos they can see, newest push first.
 * Organisations are read in the same request (the first 20, each with its first `$first` repos); `after`
 * pages the viewer's own list only, which is what Theme E walks.
 */
export const REPO_LIST_QUERY = [
  'query($first:Int!,$after:String){viewer{',
  `repositories(first:$first,after:$after,orderBy:{field:PUSHED_AT,direction:DESC},ownerAffiliations:[OWNER,COLLABORATOR,ORGANIZATION_MEMBER]){pageInfo{hasNextPage endCursor} nodes{${REPO_FIELDS}}}`,
  `organizations(first:20){nodes{repositories(first:$first,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{${REPO_FIELDS}}}}}`,
  '}}',
].join('');

export function repoListQuery(first: number, after: string | null = null): GraphqlRequest {
  return { query: REPO_LIST_QUERY, variables: { first, after } };
}

export interface RepoSummary {
  owner: string;
  name: string;
  defaultBranch: string;
  pushedAt: string;
  isPrivate: boolean;
}

function parseRepoNode(raw: unknown): RepoSummary | null {
  const name = asString(pick(raw, 'name'));
  const owner = asString(pick(pick(raw, 'owner'), 'login'));
  if (name === null || owner === null) return null;
  return {
    owner,
    name,
    defaultBranch: asString(pick(pick(raw, 'defaultBranchRef'), 'name')) ?? '',
    pushedAt: asString(pick(raw, 'pushedAt')) ?? '',
    isPrivate: asBool(pick(raw, 'isPrivate')),
  };
}

/** Viewer and organisation repos merged, de-duplicated by `owner/name`, sorted by `pushedAt` descending. */
export function parseRepoList(data: unknown): RepoSummary[] {
  const viewer = pick(data, 'viewer');
  const raws = [
    ...nodesOf(pick(viewer, 'repositories')),
    ...nodesOf(pick(viewer, 'organizations')).flatMap((org) => nodesOf(pick(org, 'repositories'))),
  ];
  const seen = new Map<string, RepoSummary>();
  for (const raw of raws) {
    const repo = parseRepoNode(raw);
    if (repo && !seen.has(`${repo.owner}/${repo.name}`)) seen.set(`${repo.owner}/${repo.name}`, repo);
  }
  // ISO 8601 strings in the same zone sort lexically; an empty pushedAt sorts last.
  return [...seen.values()].sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

export const BRANCHES_QUERY = [
  'query($owner:String!,$name:String!,$first:Int!,$after:String){',
  'repository(owner:$owner,name:$name){refs(refPrefix:"refs/heads/",first:$first,after:$after,orderBy:{field:TAG_COMMIT_DATE,direction:DESC}){nodes{name}}}',
  '}',
].join('');

export function branchesQuery(owner: string, name: string, first: number, after: string | null = null): GraphqlRequest {
  return { query: BRANCHES_QUERY, variables: { owner, name, first, after } };
}

export function parseBranches(data: unknown): string[] {
  return nodesOf(pick(pick(data, 'repository'), 'refs'))
    .map((node) => asString(pick(node, 'name')))
    .filter((name): name is string => name !== null && name.length > 0);
}
