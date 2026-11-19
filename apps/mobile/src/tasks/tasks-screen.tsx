// The Tasks tab (Phase 146 H1): project picker, Board / List / Graph switch (remembered per project), and the three
// views over one set of loaded items. A repo with no GitHub Projects falls back to its Issues as a plain list.
import { EmptyState, ListRow, SegmentedControl, useTheme } from '@bilo-io/ui-native';
import type { ForgeProjectItem } from '@midnite/studio-shared';
import { resolveGroupField, type PositionedNode } from '@midnite/tasks-core';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  useIssues,
  useProjectFields,
  useProjectGraph,
  useProjectItems,
  useProjects,
  useViewer,
} from '../data/queries';
import { repoKey, usePrefs } from '../state/prefs';
import { useCurrentRepo } from '../shell/use-current-repo';
import { Icon } from '../ui/icons';
import { BoardView } from './board-view';
import { GraphLoading, GraphView } from './graph-view';
import { ListView } from './list-view';
import { VIEW_SEGMENTS, isTasksView, needsMorePages, type TasksView } from './model';
import { ProjectPicker, defaultProject } from './project-picker';
import { BoardSkeleton, ErrorState, ListSkeleton } from './screen-state';

export const issueHref = (n: number): Href => `/tasks/issue/${n}` as Href;
export const NEW_ISSUE_HREF = '/tasks/new-issue' as Href;

export function TasksScreen() {
  const theme = useTheme();
  const { repo } = useCurrentRepo();
  const ref = useMemo(() => (repo ? { owner: repo.owner, name: repo.name } : null), [repo]);
  const projects = useProjects(ref);
  const [picked, setPicked] = useState<{ repo: string; id: string } | null>(null);

  const list = projects.data ?? [];
  const repoId = repo ? repoKey(repo) : '';
  const projectId = picked && picked.repo === repoId && list.some((p) => p.id === picked.id) ? picked.id : (defaultProject(list)?.id ?? null);

  if (!repo || !ref) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <EmptyState icon={<Icon name="trello" size={32} color={theme.colors.mutedForeground} />} title="Pick a repository" body="Choose one from the title bar to see its tasks." />
      </View>
    );
  }
  if (projects.isError) return <Screen><ErrorState error={projects.error} onRetry={() => void projects.refetch()} /></Screen>;
  if (projects.isPending) return <Screen><ListSkeleton /></Screen>;
  if (list.length === 0 || projectId === null) return <Screen><IssuesFallback repo={ref} /></Screen>;

  return (
    <Screen>
      <ProjectBody
        key={projectId}
        repo={ref}
        projectId={projectId}
        picker={<ProjectPicker projects={list} selectedId={projectId} onSelect={(id) => setPicked({ repo: repoId, id })} />}
      />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: theme.space[3] }}>{children}</View>;
}

function ProjectBody({
  repo,
  projectId,
  picker,
}: {
  repo: { owner: string; name: string };
  projectId: string;
  picker: React.ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const stored = usePrefs((s) => s.tasksViewByProject[projectId]);
  const view: TasksView = stored ?? 'board';
  const fields = useProjectFields(projectId);
  const items = useProjectItems(projectId);
  const viewer = useViewer();
  const graph = useProjectGraph(view === 'graph' ? projectId : null, repo);

  // Board and List need every item, so keep paging until the last page.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;
  useEffect(() => {
    if (needsMorePages(hasNextPage, isFetchingNextPage)) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const all = useMemo(() => items.data?.pages.flatMap((p) => p.items) ?? [], [items.data]);
  const fieldList = fields.data ?? [];
  const groupField = useMemo(() => resolveGroupField(fieldList, null), [fieldList]);

  const open = (item: ForgeProjectItem) => {
    const c = item.content;
    if (c.type === 'issue' && (c.repo === '' || c.repo === `${repo.owner}/${repo.name}`)) router.push(issueHref(c.number));
  };
  const openNode = (node: PositionedNode) => {
    if (node.kind === 'issue' && node.number !== null && (node.repo === '' || node.repo === `${repo.owner}/${repo.name}`)) {
      router.push(issueHref(node.number));
    }
  };
  const setView = (key: string) => {
    if (isTasksView(key)) usePrefs.getState().setTasksView(projectId, key);
  };

  const error = fields.error ?? items.error;
  const loading = fields.isPending || items.isPending;
  const retry = () => {
    void fields.refetch();
    void items.refetch();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingHorizontal: theme.space[3], paddingBottom: theme.space[3] }}>
        {picker}
        <SegmentedControl
          style={{ flex: 1 }}
          accessibilityLabel="Tasks view"
          segments={VIEW_SEGMENTS.map((s) => ({ key: s.key, label: s.label }))}
          value={view}
          onChange={setView}
        />
      </View>
      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : loading ? (
        view === 'list' ? <ListSkeleton /> : view === 'graph' ? <GraphLoading count={0} /> : <BoardSkeleton columnWidth={300} />
      ) : view === 'board' ? (
        <BoardView projectId={projectId} items={all} fields={fieldList} groupField={groupField} onOpenItem={open} onNewIssue={() => router.push(NEW_ISSUE_HREF)} />
      ) : view === 'list' ? (
        <ListView items={all} fields={fieldList} groupField={groupField} viewerLogin={viewer.data?.login ?? null} onOpenItem={open} />
      ) : graph.isError ? (
        <ErrorState error={graph.error} onRetry={() => void graph.refetch()} />
      ) : graph.isPending || !graph.data ? (
        <GraphLoading count={all.length} />
      ) : (
        <GraphView graph={graph.data} items={all} fields={fieldList} onOpenNode={openNode} onViewAsList={() => setView('list')} />
      )}
    </View>
  );
}

/** No GitHub Projects on this repo: its open and closed issues as a plain list. */
function IssuesFallback({ repo }: { repo: { owner: string; name: string } }) {
  const theme = useTheme();
  const router = useRouter();
  const issues = useIssues(repo);
  const rows = issues.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <View style={{ flex: 1 }} testID="issues-fallback">
      <EmptyState
        icon={<Icon name="trello" size={32} color={theme.colors.mutedForeground} />}
        title="This repo has no GitHub Projects"
        body="Its issues are listed below."
        action={{ label: 'New issue', onPress: () => router.push(NEW_ISSUE_HREF) }}
      />
      {issues.isError ? (
        <ErrorState error={issues.error} onRetry={() => void issues.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => String(i.number)}
          onEndReached={() => {
            if (issues.hasNextPage && !issues.isFetchingNextPage) void issues.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <ListRow title={item.title} meta={`#${item.number}`} subtitle={item.state === 'closed' ? 'Closed' : undefined} onPress={() => router.push(issueHref(item.number))} />
          )}
        />
      )}
    </View>
  );
}
