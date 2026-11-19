// TanStack Query hooks every screen reads through (Phase 146 Theme E6). One hook per `MobileDataSource` method, keys
// `[method, repoKey, ...args]` (`repoKey` is `'-'` for calls that are not per-repo), `staleTime` 30 s from the client's
// defaults, and `useInfiniteQuery` on the cursor for lists. A failed `Result` is thrown as a `SourceError`, so a
// screen reads `error.kind` and the query client can sign out on `auth`. Keys never contain a token.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ForgePullScope, ForgeReviewEvent } from '@midnite/studio-shared';
import { useDataSource } from './source-context';
import { repoKey, type MobileDataSource, type Page, type RepoRef, type Result, type ResultKind } from './source';

export class SourceError extends Error {
  constructor(
    readonly kind: ResultKind,
    message: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

/** The value of an ok result; a failed one throws a `SourceError`. */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new SourceError(result.kind, result.message);
  return result.value;
}

const NONE = '-';

export const mobileQueryKeys = {
  viewer: () => ['viewer', NONE] as const,
  repos: () => ['repos', NONE] as const,
  branches: (repo: RepoRef) => ['branches', repoKey(repo)] as const,
  history: (repo: RepoRef, ref: string) => ['history', repoKey(repo), ref] as const,
  commit: (repo: RepoRef, sha: string) => ['commit', repoKey(repo), sha] as const,
  projects: (repo: RepoRef) => ['projects', repoKey(repo)] as const,
  projectFields: (projectId: string) => ['projectFields', NONE, projectId] as const,
  projectItems: (projectId: string) => ['projectItems', NONE, projectId] as const,
  projectGraph: (projectId: string) => ['projectGraph', NONE, projectId] as const,
  issues: (repo: RepoRef) => ['issues', repoKey(repo)] as const,
  issue: (repo: RepoRef, n: number) => ['issue', repoKey(repo), n] as const,
  issueComments: (repo: RepoRef, n: number) => ['issueComments', repoKey(repo), n] as const,
  pulls: (repo: RepoRef, scope: ForgePullScope) => ['pulls', repoKey(repo), scope] as const,
  pull: (repo: RepoRef, n: number) => ['pull', repoKey(repo), n] as const,
  pullFiles: (repo: RepoRef, n: number) => ['pullFiles', repoKey(repo), n] as const,
  pullThreads: (repo: RepoRef, n: number) => ['pullThreads', repoKey(repo), n] as const,
  // Theme I
  pullOverview: (repo: RepoRef, n: number) => ['pullOverview', repoKey(repo), n] as const,
};

/** A cursor-paged list: `fetchNextPage` follows `nextCursor`; `getNextPageParam` ends on `null`. */
function usePaged<T>(
  queryKey: readonly unknown[],
  load: (cursor: string | null) => Promise<Result<Page<T>>>,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => unwrap(await load(pageParam)),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

// ---- reads ---------------------------------------------------------------------------------------------------

export function useViewer() {
  const source = useDataSource();
  return useQuery({ queryKey: mobileQueryKeys.viewer(), queryFn: async () => unwrap(await source.viewer()) });
}

export function useRepos() {
  const source = useDataSource();
  return usePaged(mobileQueryKeys.repos(), (c) => source.listRepos(c), true);
}

export function useBranches(repo: RepoRef | null) {
  const source = useDataSource();
  return usePaged(repo ? mobileQueryKeys.branches(repo) : ['branches', NONE], (c) => source.listBranches(repo!, c), repo !== null);
}

export function useHistory(repo: RepoRef | null, ref: string | null) {
  const source = useDataSource();
  return usePaged(
    repo && ref ? mobileQueryKeys.history(repo, ref) : ['history', NONE],
    (c) => source.history(repo!, ref!, c),
    repo !== null && ref !== null,
  );
}

export function useCommit(repo: RepoRef | null, sha: string | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && sha ? mobileQueryKeys.commit(repo, sha) : ['commit', NONE],
    enabled: repo !== null && sha !== null,
    queryFn: async () => unwrap(await source.commit(repo!, sha!)),
  });
}

export function useProjects(repo: RepoRef | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo ? mobileQueryKeys.projects(repo) : ['projects', NONE],
    enabled: repo !== null,
    queryFn: async () => unwrap(await source.listProjects(repo!)),
  });
}

export function useProjectFields(projectId: string | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: mobileQueryKeys.projectFields(projectId ?? NONE),
    enabled: projectId !== null,
    queryFn: async () => unwrap(await source.projectFields(projectId!)),
  });
}

export function useProjectItems(projectId: string | null) {
  const source = useDataSource();
  return usePaged(mobileQueryKeys.projectItems(projectId ?? NONE), (c) => source.projectItems(projectId!, c), projectId !== null);
}

export function useProjectGraph(projectId: string | null, repo?: RepoRef) {
  const source = useDataSource();
  return useQuery({
    queryKey: mobileQueryKeys.projectGraph(projectId ?? NONE),
    enabled: projectId !== null,
    queryFn: async () => unwrap(await source.projectGraph(projectId!, repo)),
  });
}

export function useIssues(repo: RepoRef | null) {
  const source = useDataSource();
  return usePaged(repo ? mobileQueryKeys.issues(repo) : ['issues', NONE], (c) => source.listIssues(repo!, c), repo !== null);
}

export function useIssue(repo: RepoRef | null, n: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && n !== null ? mobileQueryKeys.issue(repo, n) : ['issue', NONE],
    enabled: repo !== null && n !== null,
    queryFn: async () => unwrap(await source.issue(repo!, n!)),
  });
}

export function useIssueComments(repo: RepoRef | null, n: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && n !== null ? mobileQueryKeys.issueComments(repo, n) : ['issueComments', NONE],
    enabled: repo !== null && n !== null,
    queryFn: async () => unwrap(await source.issueComments(repo!, n!)),
  });
}

export function usePulls(repo: RepoRef | null, scope: ForgePullScope) {
  const source = useDataSource();
  return usePaged(repo ? mobileQueryKeys.pulls(repo, scope) : ['pulls', NONE], (c) => source.listPulls(repo!, scope, c), repo !== null);
}

export function usePull(repo: RepoRef | null, n: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && n !== null ? mobileQueryKeys.pull(repo, n) : ['pull', NONE],
    enabled: repo !== null && n !== null,
    queryFn: async () => unwrap(await source.pull(repo!, n!)),
  });
}

export function usePullFiles(repo: RepoRef | null, n: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && n !== null ? mobileQueryKeys.pullFiles(repo, n) : ['pullFiles', NONE],
    enabled: repo !== null && n !== null,
    queryFn: async () => unwrap(await source.pullFiles(repo!, n!)),
  });
}

export function usePullThreads(repo: RepoRef | null, n: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && n !== null ? mobileQueryKeys.pullThreads(repo, n) : ['pullThreads', NONE],
    enabled: repo !== null && n !== null,
    queryFn: async () => unwrap(await source.pullThreads(repo!, n!)),
  });
}

// Theme I
export function usePullOverview(repo: RepoRef | null, n: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: repo && n !== null ? mobileQueryKeys.pullOverview(repo, n) : ['pullOverview', NONE],
    enabled: repo !== null && n !== null,
    queryFn: async () => unwrap(await source.pullOverview(repo!, n!)),
  });
}

// ---- mutations -----------------------------------------------------------------------------------------------

/** Invalidate every query whose key starts with one of these method names. */
function invalidate(client: QueryClient, methods: readonly string[]): Promise<unknown> {
  return Promise.all(methods.map((method) => client.invalidateQueries({ queryKey: [method] })));
}

const AFTER_ITEM_WRITE = ['projectItems', 'projectGraph'] as const;
const AFTER_PULL_WRITE = ['pull', 'pullThreads', 'pulls', 'pullOverview'] as const; // Theme I added 'pullOverview'
const AFTER_ISSUE_WRITE = ['issues', 'issue', 'issueComments', 'projectItems'] as const;

function useWrite<V>(
  run: (source: MobileDataSource, vars: V) => Promise<Result<null>>,
  invalidates: readonly string[],
) {
  const source = useDataSource();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: V) => unwrap(await run(source, vars)),
    onSuccess: () => invalidate(client, invalidates),
  });
}

export const useSetItemField = () =>
  useWrite<{ projectId: string; itemId: string; fieldId: string; optionId: string }>(
    (s, v) => s.setItemField(v.projectId, v.itemId, v.fieldId, v.optionId),
    AFTER_ITEM_WRITE,
  );

export const useAddProjectItem = () =>
  useWrite<{ projectId: string; contentId: string }>((s, v) => s.addProjectItem(v.projectId, v.contentId), AFTER_ITEM_WRITE);

export const useCreateIssue = () =>
  useWrite<{ repo: RepoRef; title: string; body: string }>((s, v) => s.createIssue(v.repo, v.title, v.body), AFTER_ISSUE_WRITE);

export const useSetIssueState = () =>
  useWrite<{ repo: RepoRef; n: number; state: 'OPEN' | 'CLOSED' }>((s, v) => s.setIssueState(v.repo, v.n, v.state), AFTER_ISSUE_WRITE);

export const useCommentIssue = () =>
  useWrite<{ repo: RepoRef; n: number; body: string }>((s, v) => s.commentIssue(v.repo, v.n, v.body), AFTER_ISSUE_WRITE);

export const useSubmitReview = () =>
  useWrite<{ repo: RepoRef; n: number; event: ForgeReviewEvent; body: string }>(
    (s, v) => s.submitReview(v.repo, v.n, v.event, v.body),
    AFTER_PULL_WRITE,
  );

export const useCommentPull = () =>
  useWrite<{ repo: RepoRef; n: number; body: string }>((s, v) => s.commentPull(v.repo, v.n, v.body), AFTER_PULL_WRITE);

export const useReplyToThread = () =>
  useWrite<{ threadId: string; body: string }>((s, v) => s.replyToThread(v.threadId, v.body), AFTER_PULL_WRITE);

// Theme H
export function useCreateIssueWithId() {
  const source = useDataSource();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { repo: RepoRef; title: string; body: string }) =>
      unwrap(await source.createIssueWithId(vars.repo, vars.title, vars.body)),
    onSuccess: () => invalidate(client, AFTER_ISSUE_WRITE),
  });
}
