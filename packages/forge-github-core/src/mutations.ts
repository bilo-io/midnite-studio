import type { ForgeReviewEvent } from '@midnite/studio-shared';

import { mutationResult, type MutationResult } from './errors';
import type { GraphqlRequest } from './request';

/**
 * GitHub write documents for mobile. Each is a request builder plus `parse…Result`, which takes the whole
 * response body (`{ data, errors }`, not just `data`: failures live in the sibling `errors` array) and
 * returns `{ ok: true } | { ok: false, kind: 'error', message }`.
 */

export const SUBMIT_REVIEW_MUTATION =
  'mutation($input:AddPullRequestReviewInput!){addPullRequestReview(input:$input){pullRequestReview{id}}}';

/** Submits a review in one call: `AddPullRequestReviewInput` with an `event` creates and submits it. */
export function submitReviewMutation(pullId: string, event: ForgeReviewEvent, body: string): GraphqlRequest {
  return { query: SUBMIT_REVIEW_MUTATION, variables: { input: { pullRequestId: pullId, event, body } } };
}

export const ADD_COMMENT_MUTATION =
  'mutation($input:AddCommentInput!){addComment(input:$input){commentEdge{node{id}}}}';

/** A conversation comment on a pull request or an issue (`subjectId` is the node id). */
export function addCommentMutation(subjectId: string, body: string): GraphqlRequest {
  return { query: ADD_COMMENT_MUTATION, variables: { input: { subjectId, body } } };
}

/** Same document, named for the pull request surface. */
export const addPullCommentMutation = addCommentMutation;

export const REPLY_TO_THREAD_MUTATION =
  'mutation($input:AddPullRequestReviewThreadReplyInput!){addPullRequestReviewThreadReply(input:$input){comment{id}}}';

export function replyToThreadMutation(threadId: string, body: string): GraphqlRequest {
  return { query: REPLY_TO_THREAD_MUTATION, variables: { input: { pullRequestReviewThreadId: threadId, body } } };
}

export const SET_PROJECT_FIELD_MUTATION =
  'mutation($input:UpdateProjectV2ItemFieldValueInput!){updateProjectV2ItemFieldValue(input:$input){projectV2Item{id}}}';

/** Single-select cell write, the same input shape desktop's `gh-project-write.ts` sends. */
export function setProjectFieldMutation(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): GraphqlRequest {
  return {
    query: SET_PROJECT_FIELD_MUTATION,
    variables: { input: { projectId, itemId, fieldId, value: { singleSelectOptionId: optionId } } },
  };
}

export const ADD_PROJECT_ITEM_MUTATION =
  'mutation($input:AddProjectV2ItemByIdInput!){addProjectV2ItemById(input:$input){item{id}}}';

export function addProjectItemMutation(projectId: string, contentId: string): GraphqlRequest {
  return { query: ADD_PROJECT_ITEM_MUTATION, variables: { input: { projectId, contentId } } };
}

export const CLOSE_ISSUE_MUTATION = 'mutation($input:CloseIssueInput!){closeIssue(input:$input){issue{id}}}';
export const REOPEN_ISSUE_MUTATION = 'mutation($input:ReopenIssueInput!){reopenIssue(input:$input){issue{id}}}';

export function setIssueStateMutation(issueId: string, state: 'OPEN' | 'CLOSED'): GraphqlRequest {
  return {
    query: state === 'CLOSED' ? CLOSE_ISSUE_MUTATION : REOPEN_ISSUE_MUTATION,
    variables: { input: { issueId } },
  };
}

export const CREATE_ISSUE_MUTATION =
  'mutation($input:CreateIssueInput!){createIssue(input:$input){issue{id number url}}}';

export function createIssueMutation(repoId: string, title: string, body: string): GraphqlRequest {
  return { query: CREATE_ISSUE_MUTATION, variables: { input: { repositoryId: repoId, title, body } } };
}

export const parseSubmitReviewResult = (response: unknown): MutationResult => mutationResult(response);
export const parseAddCommentResult = (response: unknown): MutationResult => mutationResult(response);
export const parseReplyToThreadResult = (response: unknown): MutationResult => mutationResult(response);
export const parseSetProjectFieldResult = (response: unknown): MutationResult => mutationResult(response);
export const parseAddProjectItemResult = (response: unknown): MutationResult => mutationResult(response);
export const parseSetIssueStateResult = (response: unknown): MutationResult => mutationResult(response);
export const parseCreateIssueResult = (response: unknown): MutationResult => mutationResult(response);
