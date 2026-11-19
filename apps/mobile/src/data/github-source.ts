// `MobileDataSource` over GitHub's API directly (Phase 146 Theme E2). GraphQL for everything Theme D's documents
// cover; REST only for file patches, which GraphQL does not expose. Never throws: `http.ts` folds every failure into
// a `Result`, and a parser that yields nothing becomes an `error` result rather than an exception.
import {
  addCommentMutation,
  addProjectItemMutation,
  branchesQuery,
  createIssueMutation,
  historyQuery,
  issueDetailQuery,
  issuesQuery,
  listProjectsQuery,
  parseAddCommentResult,
  parseAddProjectItemResult,
  parseBranchesPage,
  parseCreateIssueResult,
  parseFields,
  parseHistory,
  parseIssueDetail,
  parseIssues,
  parseItemsPage,
  parseProjectList,
  parsePullDetail,
  parsePullsPage,
  parseRepoPage,
  parseReplyToThreadResult,
  parseReviewThreads,
  parseSetIssueStateResult,
  parseSetProjectFieldResult,
  parseSubmitReviewResult,
  projectFieldsQuery,
  projectItemsQuery,
  pullDetailQuery,
  pullsQuery,
  repoListQuery,
  replyToThreadMutation,
  reviewThreadsQuery,
  setIssueStateMutation,
  setProjectFieldMutation,
  submitReviewMutation,
  type GraphqlRequest,
  type MutationResult,
} from '@midnite/forge-github-core';
import { parseUnifiedDiff } from '@midnite/studio-git-engine/diff';
import {
  CommitSchema,
  DIFF_DEFAULT_CONTEXT,
  FORGE_GRAPH_NODE_CAP,
  resolveForgeGraph,
  type FileDiff,
  type ForgeProjectItem,
} from '@midnite/studio-shared';
import { graphql, nextLink, rest, type FetchLike, type HttpDeps } from './http';
import {
  fail,
  ok,
  type CommitDetail,
  type CreatedIssue,
  type IssueComment,
  type MobileDataSource,
  type MutationOutcome,
  type Page,
  type RepoRef,
  type Result,
  type Viewer,
} from './source';

export const PAGE_SIZE = 30;
const FILES_PAGE_CAP = 10;
const SHA_RE = /^[0-9a-fA-F]{4,64}$/;

export interface GitHubDataSourceOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  getToken: HttpDeps['getToken'];
}

const VIEWER_QUERY = '{viewer{login name avatarUrl}}';
const REPO_ID_QUERY = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id}}';
const ISSUE_COMMENTS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){comments(first:100){nodes{id author{login} body createdAt}}}}}';

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const pick = (v: unknown, key: string): unknown =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>)[key] : undefined;

const enc = encodeURIComponent;
const repoPath = (repo: RepoRef) => `/repos/${enc(repo.owner)}/${enc(repo.name)}`;

interface RestFile {
  filename?: unknown;
  previous_filename?: unknown;
  status?: unknown;
  additions?: unknown;
  deletions?: unknown;
  changes?: unknown;
  patch?: unknown;
}

function changeKind(status: unknown, previous: string | null): FileDiff['change'] {
  switch (status) {
    case 'added':
      return 'added';
    case 'removed':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    case 'copied':
      return 'copied';
    default:
      return previous ? 'renamed' : 'modified';
  }
}

/**
 * One REST `files[]` entry as a `FileDiff`. A file with no `patch` is binary (no changed lines) or too large for
 * GitHub to inline (changed lines but no patch): it keeps no hunks and sets `binary` / `truncated`, the flags
 * desktop's diff view already renders as "Binary file" / "Diff too large".
 */
export function restFileToDiff(file: RestFile): FileDiff {
  const path = str(file.filename) ?? '';
  const oldPath = str(file.previous_filename);
  const insertions = typeof file.additions === 'number' ? file.additions : 0;
  const deletions = typeof file.deletions === 'number' ? file.deletions : 0;
  const patch = str(file.patch);
  const change = changeKind(file.status, oldPath);
  if (patch === null || patch === '') {
    const hasChanges = (typeof file.changes === 'number' ? file.changes : insertions + deletions) > 0;
    return {
      path,
      oldPath,
      change,
      binary: !hasChanges,
      combined: false,
      oldMode: null,
      newMode: null,
      hunks: [],
      insertions,
      deletions,
      contextLines: DIFF_DEFAULT_CONTEXT,
      truncated: hasChanges,
      droppedLines: 0,
    };
  }
  const parsed = parseUnifiedDiff(patch, { contextLines: DIFF_DEFAULT_CONTEXT, fallbackPath: path });
  return { ...parsed, path, oldPath, change, insertions, deletions };
}

export class GitHubDataSource implements MobileDataSource {
  private readonly http: HttpDeps;

  constructor(options: GitHubDataSourceOptions) {
    this.http = { fetch: options.fetch ?? ((input, init) => fetch(input, init)), getToken: options.getToken };
  }

  // ---- helpers -----------------------------------------------------------------------------------------------

  /** Run a GraphQL request and a parser; a thrown parser (malformed payload) becomes an `error` result. */
  private async read<T>(request: GraphqlRequest, parse: (data: unknown) => T): Promise<Result<T>> {
    const response = await graphql(this.http, request);
    if (!response.ok) return response;
    try {
      return ok(parse(response.value));
    } catch {
      return fail('error', 'GitHub returned an unexpected response');
    }
  }

  private async mutate(request: GraphqlRequest, parse: (body: unknown) => MutationResult): Promise<MutationOutcome> {
    const response = await graphql(this.http, request);
    if (!response.ok) return response;
    // `graphql()` hands back `data`; the parsers expect the whole body, so re-wrap it.
    const outcome = parse({ data: response.value });
    return outcome.ok ? ok(null) : fail(outcome.kind, outcome.message);
  }

  private async issueId(repo: RepoRef, n: number): Promise<Result<string>> {
    const detail = await this.issue(repo, n);
    if (!detail.ok) return detail;
    return detail.value.issue.id ? ok(detail.value.issue.id) : fail('error', 'Issue id unavailable');
  }

  private async pullId(repo: RepoRef, n: number): Promise<Result<string>> {
    const detail = await this.pull(repo, n);
    if (!detail.ok) return detail;
    return detail.value.pull.id ? ok(detail.value.pull.id) : fail('error', 'Pull request id unavailable');
  }

  // ---- identity, repos, history ------------------------------------------------------------------------------

  viewer(): Promise<Result<Viewer>> {
    return this.read({ query: VIEWER_QUERY, variables: {} }, (data) => {
      const viewer = pick(data, 'viewer');
      const login = str(pick(viewer, 'login'));
      if (!login) throw new Error('no viewer');
      return { login, name: str(pick(viewer, 'name')), avatarUrl: str(pick(viewer, 'avatarUrl')) };
    });
  }

  listRepos(cursor: string | null = null) {
    return this.read(repoListQuery(PAGE_SIZE, cursor), (data) => {
      const page = parseRepoPage(data);
      return { items: page.items, nextCursor: page.hasNextPage ? page.endCursor : null };
    });
  }

  listBranches(repo: RepoRef, cursor: string | null = null) {
    return this.read(branchesQuery(repo.owner, repo.name, PAGE_SIZE, cursor), (data) => {
      const page = parseBranchesPage(data);
      return { items: page.items, nextCursor: page.hasNextPage ? page.endCursor : null };
    });
  }

  history(repo: RepoRef, ref: string, cursor: string | null = null) {
    return this.read(historyQuery(repo.owner, repo.name, ref, PAGE_SIZE, cursor), (data) => {
      const page = parseHistory(data);
      return { items: page.commits, nextCursor: page.hasNextPage ? page.endCursor : null };
    });
  }

  async commit(repo: RepoRef, sha: string): Promise<Result<CommitDetail>> {
    if (!SHA_RE.test(sha)) return fail('error', 'Not a commit sha');
    const response = await rest(this.http, `${repoPath(repo)}/commits/${sha}`);
    if (!response.ok) return response;
    const body = response.value.body;
    const commitBody = pick(body, 'commit');
    const message = str(pick(commitBody, 'message')) ?? '';
    const seconds = (iso: unknown) => {
      const ms = Date.parse(str(iso) ?? '');
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
    };
    const authored = seconds(pick(pick(commitBody, 'author'), 'date'));
    const parsed = CommitSchema.safeParse({
      sha: str(pick(body, 'sha')) ?? sha,
      parents: (Array.isArray(pick(body, 'parents')) ? (pick(body, 'parents') as unknown[]) : [])
        .map((p) => str(pick(p, 'sha')))
        .filter((s): s is string => s !== null),
      authorName: str(pick(pick(commitBody, 'author'), 'name')) ?? '',
      authorEmail: str(pick(pick(commitBody, 'author'), 'email')) ?? '',
      authorDate: authored,
      committerDate: seconds(pick(pick(commitBody, 'committer'), 'date')) || authored,
      subject: message.split('\n')[0] ?? '',
      refs: [],
      coAuthors: [],
      sessionTrailers: [],
    });
    if (!parsed.success) return fail('error', 'GitHub returned an unexpected response');
    const files = pick(body, 'files');
    return ok({ commit: parsed.data, files: (Array.isArray(files) ? files : []).map((f) => restFileToDiff(f as RestFile)) });
  }

  // ---- projects ----------------------------------------------------------------------------------------------

  listProjects(repo: RepoRef) {
    return this.read({ query: listProjectsQuery, variables: { owner: repo.owner, repo: repo.name } }, parseProjectList);
  }

  projectFields(projectId: string) {
    return this.read({ query: projectFieldsQuery, variables: { projectId } }, parseFields);
  }

  projectItems(projectId: string, cursor: string | null = null) {
    return this.read({ query: projectItemsQuery, variables: { projectId, cursor } }, (data) => {
      const page = parseItemsPage(data);
      return { items: page.items, nextCursor: page.nextCursor };
    });
  }

  async projectGraph(projectId: string, repo?: RepoRef) {
    const fields = await this.projectFields(projectId);
    if (!fields.ok) return fields;
    const items: ForgeProjectItem[] = [];
    let cursor: string | null = null;
    do {
      const page: Result<Page<ForgeProjectItem>> = await this.projectItems(projectId, cursor);
      if (!page.ok) return page;
      items.push(...page.value.items);
      cursor = page.value.nextCursor;
    } while (cursor !== null && items.length < FORGE_GRAPH_NODE_CAP);
    return ok(resolveForgeGraph(items, fields.value, { boardRepo: repo ? `${repo.owner}/${repo.name}` : '' }));
  }

  setItemField(projectId: string, itemId: string, fieldId: string, optionId: string) {
    return this.mutate(setProjectFieldMutation(projectId, itemId, fieldId, optionId), parseSetProjectFieldResult);
  }

  addProjectItem(projectId: string, contentId: string) {
    return this.mutate(addProjectItemMutation(projectId, contentId), parseAddProjectItemResult);
  }

  // ---- issues ------------------------------------------------------------------------------------------------

  listIssues(repo: RepoRef, cursor: string | null = null) {
    return this.read(issuesQuery(repo.owner, repo.name, PAGE_SIZE, cursor), (data) => {
      const page = parseIssues(data);
      return { items: page.issues, nextCursor: page.hasNextPage ? page.endCursor : null };
    });
  }

  async issue(repo: RepoRef, n: number) {
    const result = await this.read(issueDetailQuery(repo.owner, repo.name, n), parseIssueDetail);
    if (!result.ok) return result;
    return result.value ? ok(result.value) : fail('error', 'Issue not found');
  }

  issueComments(repo: RepoRef, n: number): Promise<Result<IssueComment[]>> {
    return this.read(
      { query: ISSUE_COMMENTS_QUERY, variables: { owner: repo.owner, name: repo.name, number: n } },
      (data) => {
        const nodes = pick(pick(pick(pick(data, 'repository'), 'issue'), 'comments'), 'nodes');
        return (Array.isArray(nodes) ? nodes : []).flatMap((node): IssueComment[] => {
          const id = str(pick(node, 'id'));
          return id
            ? [
                {
                  id,
                  author: str(pick(pick(node, 'author'), 'login')) ?? '',
                  body: str(pick(node, 'body')) ?? '',
                  createdAt: str(pick(node, 'createdAt')) ?? '',
                },
              ]
            : [];
        });
      },
    );
  }

  async createIssue(repo: RepoRef, title: string, body: string) {
    const id = await this.read({ query: REPO_ID_QUERY, variables: { owner: repo.owner, name: repo.name } }, (data) => {
      const found = str(pick(pick(data, 'repository'), 'id'));
      if (!found) throw new Error('no repo');
      return found;
    });
    if (!id.ok) return id;
    return this.mutate(createIssueMutation(id.value, title, body), parseCreateIssueResult);
  }

  // Theme H
  async createIssueWithId(repo: RepoRef, title: string, body: string): Promise<Result<CreatedIssue>> {
    const repoId = await this.read({ query: REPO_ID_QUERY, variables: { owner: repo.owner, name: repo.name } }, (data) => {
      const found = str(pick(pick(data, 'repository'), 'id'));
      if (!found) throw new Error('no repo');
      return found;
    });
    if (!repoId.ok) return repoId;
    const response = await graphql(this.http, createIssueMutation(repoId.value, title, body));
    if (!response.ok) return response;
    const outcome = parseCreateIssueResult({ data: response.value });
    if (!outcome.ok) return fail(outcome.kind, outcome.message);
    const issue = pick(pick(response.value, 'createIssue'), 'issue');
    const id = str(pick(issue, 'id'));
    const number = pick(issue, 'number');
    if (!id || typeof number !== 'number') return fail('error', 'GitHub did not return the new issue');
    return ok({ id, number });
  }

  async setIssueState(repo: RepoRef, n: number, state: 'OPEN' | 'CLOSED') {
    const id = await this.issueId(repo, n);
    if (!id.ok) return id;
    return this.mutate(setIssueStateMutation(id.value, state), parseSetIssueStateResult);
  }

  async commentIssue(repo: RepoRef, n: number, body: string) {
    const id = await this.issueId(repo, n);
    if (!id.ok) return id;
    return this.mutate(addCommentMutation(id.value, body), parseAddCommentResult);
  }

  // ---- pull requests -----------------------------------------------------------------------------------------

  listPulls(repo: RepoRef, scope: Parameters<MobileDataSource['listPulls']>[1], cursor: string | null = null) {
    return this.read(pullsQuery(repo.owner, repo.name, scope, PAGE_SIZE, cursor), (data) => {
      const page = parsePullsPage(data);
      return { items: page.pulls, nextCursor: page.hasNextPage ? page.endCursor : null };
    });
  }

  async pull(repo: RepoRef, n: number) {
    const result = await this.read(pullDetailQuery(repo.owner, repo.name, n), parsePullDetail);
    if (!result.ok) return result;
    return result.value ? ok(result.value) : fail('error', 'Pull request not found');
  }

  async pullFiles(repo: RepoRef, n: number): Promise<Result<FileDiff[]>> {
    const files: FileDiff[] = [];
    let url: string | null = `${repoPath(repo)}/pulls/${n}/files?per_page=100`;
    for (let page = 0; url !== null && page < FILES_PAGE_CAP; page += 1) {
      const response = await rest(this.http, url);
      if (!response.ok) return response;
      const body = response.value.body;
      files.push(...(Array.isArray(body) ? body : []).map((f) => restFileToDiff(f as RestFile)));
      url = nextLink(response.value.link);
    }
    return ok(files);
  }

  pullThreads(repo: RepoRef, n: number) {
    return this.read(
      { query: reviewThreadsQuery, variables: { owner: repo.owner, name: repo.name, number: n } },
      parseReviewThreads,
    );
  }

  async submitReview(repo: RepoRef, n: number, event: Parameters<typeof submitReviewMutation>[1], body: string) {
    const id = await this.pullId(repo, n);
    if (!id.ok) return id;
    return this.mutate(submitReviewMutation(id.value, event, body), parseSubmitReviewResult);
  }

  async commentPull(repo: RepoRef, n: number, body: string) {
    const id = await this.pullId(repo, n);
    if (!id.ok) return id;
    return this.mutate(addCommentMutation(id.value, body), parseAddCommentResult);
  }

  replyToThread(threadId: string, body: string) {
    return this.mutate(replyToThreadMutation(threadId, body), parseReplyToThreadResult);
  }
}
