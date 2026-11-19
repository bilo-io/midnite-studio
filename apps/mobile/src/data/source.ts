// The seam between mobile's screens and wherever the data lives (Phase 146 Theme E1).
//
// Today the one implementation is `GitHubDataSource` (GitHub's API directly, `github-source.ts`). A future
// `DesktopPairedDataSource` — mobile talking to a running Studio — implements this same interface and is swapped in
// at the provider; no screen changes. Every method returns a `Result` and never throws, matching the IPC envelope
// rule desktop follows.
import type {
  Commit,
  FileDiff,
  ForgeGraph,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeProject,
  ForgeProjectField,
  ForgeProjectItem,
  ForgePull,
  ForgePullDetail,
  ForgePullScope,
  ForgeReviewEvent,
  ForgeReviewThread,
} from '@midnite/studio-shared';

export type RepoRef = { owner: string; name: string };

/** `auth`: token rejected (401). `scope`: token lacks a scope. `network`: fetch failed. `error`: anything else. */
export type ResultKind = 'auth' | 'scope' | 'network' | 'error';

export type Result<T> = { ok: true; value: T } | { ok: false; kind: ResultKind; message: string };

/** One cursor page: `nextCursor` is `null` on the last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Viewer {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface RepoSummaryRow {
  owner: string;
  name: string;
  defaultBranch: string;
  pushedAt: string;
  isPrivate: boolean;
}

export interface IssueComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommitDetail {
  commit: Commit;
  files: FileDiff[];
}

export type MutationOutcome = Result<null>;

// Theme H
/** What creating an issue answers with: the node id (for `addProjectItem`) and the number (for the detail route). */
export interface CreatedIssue {
  id: string;
  number: number;
}

export interface MobileDataSource {
  viewer(): Promise<Result<Viewer>>;

  // Repos and history
  listRepos(cursor?: string | null): Promise<Result<Page<RepoSummaryRow>>>;
  listBranches(repo: RepoRef, cursor?: string | null): Promise<Result<Page<string>>>;
  history(repo: RepoRef, ref: string, cursor?: string | null): Promise<Result<Page<Commit>>>;
  commit(repo: RepoRef, sha: string): Promise<Result<CommitDetail>>;

  // Projects (Tasks)
  listProjects(repo: RepoRef): Promise<Result<ForgeProject[]>>;
  projectFields(projectId: string): Promise<Result<ForgeProjectField[]>>;
  projectItems(projectId: string, cursor?: string | null): Promise<Result<Page<ForgeProjectItem>>>;
  /** Dependency graph of a board: every item (up to the graph's node cap) resolved with `resolveForgeGraph`. */
  projectGraph(projectId: string, repo?: RepoRef): Promise<Result<ForgeGraph>>;
  setItemField(projectId: string, itemId: string, fieldId: string, optionId: string): Promise<MutationOutcome>;
  addProjectItem(projectId: string, contentId: string): Promise<MutationOutcome>;

  // Issues
  listIssues(repo: RepoRef, cursor?: string | null): Promise<Result<Page<ForgeIssue>>>;
  issue(repo: RepoRef, n: number): Promise<Result<ForgeIssueDetail>>;
  issueComments(repo: RepoRef, n: number): Promise<Result<IssueComment[]>>;
  createIssue(repo: RepoRef, title: string, body: string): Promise<MutationOutcome>;
  setIssueState(repo: RepoRef, n: number, state: 'OPEN' | 'CLOSED'): Promise<MutationOutcome>;
  commentIssue(repo: RepoRef, n: number, body: string): Promise<MutationOutcome>;
  // Theme H
  createIssueWithId(repo: RepoRef, title: string, body: string): Promise<Result<CreatedIssue>>;

  // Pull requests (Reviews)
  listPulls(repo: RepoRef, scope: ForgePullScope, cursor?: string | null): Promise<Result<Page<ForgePull>>>;
  pull(repo: RepoRef, n: number): Promise<Result<ForgePullDetail>>;
  pullFiles(repo: RepoRef, n: number): Promise<Result<FileDiff[]>>;
  pullThreads(repo: RepoRef, n: number): Promise<Result<ForgeReviewThread[]>>;
  submitReview(repo: RepoRef, n: number, event: ForgeReviewEvent, body: string): Promise<MutationOutcome>;
  commentPull(repo: RepoRef, n: number, body: string): Promise<MutationOutcome>;
  replyToThread(threadId: string, body: string): Promise<MutationOutcome>;
}

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (kind: ResultKind, message: string): Result<never> => ({ ok: false, kind, message });

/** Stable per-repo key segment for query keys and caches. Never includes a token. */
export const repoKey = (repo: RepoRef): string => `${repo.owner}/${repo.name}`;
