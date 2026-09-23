import { capabilitiesFor, type Forge } from '@midnite/studio-shared';

import type { ForgeAdapter } from '../adapter';
import { githubWhoami } from '../whoami';
import {
  issueComments,
  issueDetail,
  listIssues,
  listPulls,
  listRuns,
  listWorkflows,
  pullComments,
  pullDetail,
  forgetRun,
  pullFiles,
  runDetail,
  runLog,
} from './gh-cli';
import { pullThreads } from './gh-graphql';
import { linkIssues, unlinkIssues } from './gh-issue-links';
import { listProjects, projectFields, projectItems } from './gh-project';
import {
  addProjectItem,
  clearItemFieldValue,
  createProject,
  deleteProject,
  editProject,
  removeProjectItem,
  setItemFieldValue,
} from './gh-project-write';
import {
  addReviewComment,
  commentIssue,
  commentPull,
  createIssue,
  deleteIssue,
  editIssue,
  markReady,
  mergePull,
  replyToReviewComment,
  requestReview,
  rerunChecks,
  reviewPull,
  setIssueState,
  setThreadResolved,
} from './gh-write';

/**
 * GitHub's `ForgeAdapter` — every method is a direct binding onto the
 * `gh-*.ts` functions this theme moved into this directory, unchanged. No
 * method here contains logic of its own; the acceptance criterion for this
 * file is that it adds nothing a diff reviewer needs to check beyond "does
 * the name on the left match the import on the right".
 *
 * `listRepos` is omitted (Theme C's job — see `adapter.ts`'s docblock).
 */
export function createGitHubAdapter(): ForgeAdapter {
  return {
    kind: 'github',

    listRuns,
    runDetail,
    runLog,
    listWorkflows,

    listPulls,
    pullDetail,
    pullFiles,
    pullComments,
    pullThreads,

    listIssues,
    issueDetail,
    issueComments,

    listBoards: listProjects,
    boardFields: (forge: Forge, projectId: string) => projectFields(forge, projectId),
    boardItems: (forge: Forge, projectId: string, cursor?: string) =>
      projectItems(forge, projectId, cursor),

    addReviewComment,
    replyToReviewComment,
    setThreadResolved,
    reviewPull,
    commentPull,
    mergePull,
    requestReview,
    markReady,
    rerunChecks,

    commentIssue,
    setIssueState,

    setItemField: (forge, request) => setItemFieldValue(forge, request),

    createIssue,
    editIssue,
    deleteIssue,

    createProject: (forge, title) => createProject(forge, title),
    editProject,
    deleteProject: (forge, projectId) => deleteProject(forge, projectId),

    addProjectItem,
    removeProjectItem,
    clearItemFieldValue: (forge, request) => clearItemFieldValue(forge, request),

    linkIssues,
    unlinkIssues,

    whoami: (forge: Forge) => githubWhoami(forge.host),

    forgetRun,

    capabilities: () => capabilitiesFor('github'),
  };
}
