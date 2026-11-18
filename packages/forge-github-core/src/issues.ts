import {
  ForgeIssueDetailSchema,
  ForgeIssueSchema,
  type ForgeIssue,
  type ForgeIssueDetail,
} from '@midnite/studio-shared';

import type { GraphqlRequest } from './request';
import { asBool, asString, nodesOf, pick } from './json';

const ISSUE_ROW_FIELDS =
  'id number title state url createdAt updatedAt author{login} ' +
  'labels(first:20){nodes{name color}} assignees(first:10){nodes{login}} milestone{title}';

export const ISSUES_QUERY = [
  'query($owner:String!,$name:String!,$first:Int!,$after:String){',
  'repository(owner:$owner,name:$name){',
  `issues(first:$first,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{${ISSUE_ROW_FIELDS}}}`,
  '}}',
].join('');

export const ISSUE_DETAIL_QUERY = [
  'query($owner:String!,$name:String!,$number:Int!){',
  `repository(owner:$owner,name:$name){issue(number:$number){${ISSUE_ROW_FIELDS} body}}`,
  '}',
].join('');

export function issuesQuery(owner: string, name: string, first: number, after: string | null = null): GraphqlRequest {
  return { query: ISSUES_QUERY, variables: { owner, name, first, after } };
}

export function issueDetailQuery(owner: string, name: string, number: number): GraphqlRequest {
  return { query: ISSUE_DETAIL_QUERY, variables: { owner, name, number } };
}

function parseIssueNode(raw: unknown): ForgeIssue | null {
  const state = asString(pick(raw, 'state'))?.toLowerCase();
  if (state !== 'open' && state !== 'closed') return null;
  const milestone = asString(pick(pick(raw, 'milestone'), 'title'));
  const parsed = ForgeIssueSchema.safeParse({
    id: asString(pick(raw, 'id')) ?? '',
    number: pick(raw, 'number'),
    title: asString(pick(raw, 'title')) ?? '',
    state,
    author: asString(pick(pick(raw, 'author'), 'login')) ?? '',
    labels: nodesOf(pick(raw, 'labels'))
      .map((label) => ({ name: asString(pick(label, 'name')), color: asString(pick(label, 'color')) ?? '' }))
      .filter((label): label is { name: string; color: string } => label.name !== null),
    assignees: nodesOf(pick(raw, 'assignees'))
      .map((entry) => asString(pick(entry, 'login')))
      .filter((login): login is string => login !== null && login.length > 0),
    updatedAt: asString(pick(raw, 'updatedAt')) ?? '',
    createdAt: asString(pick(raw, 'createdAt')),
    url: asString(pick(raw, 'url')) ?? '',
    milestone: milestone === null ? null : { title: milestone },
  });
  return parsed.success ? parsed.data : null;
}

export interface IssuesPage {
  issues: ForgeIssue[];
  endCursor: string | null;
  hasNextPage: boolean;
}

export function parseIssues(data: unknown): IssuesPage {
  const connection = pick(pick(data, 'repository'), 'issues');
  const pageInfo = pick(connection, 'pageInfo');
  const issues: ForgeIssue[] = [];
  for (const raw of nodesOf(connection)) {
    const issue = parseIssueNode(raw);
    if (issue) issues.push(issue);
  }
  return {
    issues,
    endCursor: asString(pick(pageInfo, 'endCursor')),
    hasNextPage: asBool(pick(pageInfo, 'hasNextPage')),
  };
}

/** `repository.issue` as `ForgeIssueDetail`, or null when the issue is not visible. */
export function parseIssueDetail(data: unknown): ForgeIssueDetail | null {
  const raw = pick(pick(data, 'repository'), 'issue');
  const issue = parseIssueNode(raw);
  if (issue === null) return null;
  const parsed = ForgeIssueDetailSchema.safeParse({ issue, body: asString(pick(raw, 'body')) ?? '' });
  return parsed.success ? parsed.data : null;
}
