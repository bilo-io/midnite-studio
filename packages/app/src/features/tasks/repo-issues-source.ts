import {
  EMPTY_ISSUE_LINK_SET,
  type ForgeIssue,
  type ForgeProjectField,
  type ForgeProjectItem,
} from '@midnite/studio-shared';

import { sortByUpdated } from './issue/issue-order';

/**
 * The built-in "Repo issues" source — Tasks' stand-in for the Issues view it
 * absorbed.
 *
 * Always offered in the board picker beside the forge's real Project boards,
 * so an issue that is on no board is still reachable. It is not a board: it
 * is the repo's own issue list (`useForgeIssues(repoId, …, 'all')`) turned
 * into `ForgeProjectItem`s, so the same Table, Board and Graph views render it
 * with no second code path. One synthetic single-select field, `Status`
 * (Open / Closed), is what Board mode groups by and what paints the status
 * stroke; it is read-only (`isRepoIssuesField`), because an issue's state
 * changes through the issue itself (close/reopen in the issue modal), never
 * through a board field that does not exist on the forge.
 *
 * Its id is a sentinel stored in `projectBoardByRepo` and keys
 * `projectViewByProject` like any board id, so its filter, sort and grouping
 * persist exactly the way a real board's do. It can never collide with a real
 * board: forge project ids are GraphQL node ids (`PVT_…`) or numeric strings.
 */
export const REPO_ISSUES_SOURCE_ID = 'midnite:repo-issues';

export const isRepoIssuesSource = (projectId: string | null | undefined): boolean =>
  projectId === REPO_ISSUES_SOURCE_ID;

const STATE_FIELD_ID = `${REPO_ISSUES_SOURCE_ID}:status`;

/** The one field the Repo issues source carries. */
export const REPO_ISSUES_FIELDS: ForgeProjectField[] = [
  {
    id: STATE_FIELD_ID,
    name: 'Status',
    dataType: 'single_select' as const,
    options: [
      { id: 'open', name: 'Open', color: 'GREEN' },
      { id: 'closed', name: 'Closed', color: 'PURPLE' },
    ],
  },
];

/** A synthetic field no forge write can target — rendered read-only by `ProjectFieldCell`. */
export const isRepoIssuesField = (field: ForgeProjectField): boolean => field.id.startsWith(`${REPO_ISSUES_SOURCE_ID}:`);

/** The item id a repo issue wears inside the source — stable across refetches. */
export const repoIssueItemId = (number: number): string => `${REPO_ISSUES_SOURCE_ID}#${number}`;

/**
 * The repo's issues as board items, most recently updated first — the order
 * the Issues view opened on. `repoName` is `owner/name`, so an item's `repo`
 * matches what a real board item from this repo carries.
 */
export function repoIssuesAsItems(issues: readonly ForgeIssue[], repoName: string): ForgeProjectItem[] {
  return sortByUpdated(issues).map((issue) => ({
    id: repoIssueItemId(issue.number),
    content: {
      type: 'issue',
      id: issue.id,
      number: issue.number,
      repo: repoName,
      title: issue.title,
      url: issue.url,
      state: issue.state,
      assignees: issue.assignees,
      body: '',
      labels: issue.labels.map((label) => label.name),
      dependencies: EMPTY_ISSUE_LINK_SET,
      linkedPrs: [],
    },
    fieldValues: {
      [STATE_FIELD_ID]: {
        fieldId: STATE_FIELD_ID,
        dataType: 'single_select',
        optionId: issue.state,
        name: issue.state === 'open' ? 'Open' : 'Closed',
      },
    },
  }));
}
