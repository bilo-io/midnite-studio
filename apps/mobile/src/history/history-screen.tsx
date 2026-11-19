// The History tab (Phase 146 Theme G1, G2, G4): a commit timeline for the current repo and branch. A FlatList over
// `useHistory` that pages on scroll, day separators that stick, a branch Chip in the title bar that opens the picker,
// and loading, empty, no-repo and error states.
import { Button, Chip, EmptyState, Skeleton, useTheme } from '@bilo-io/ui-native';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SourceError, useHistory } from '../data/queries';
import { useShell, useTitleBarAction } from '../shell/shell-context';
import { useCurrentRepo } from '../shell/use-current-repo';
import { ICONS, Icon } from '../ui/icons';
import { BranchSheet } from './branch-sheet';
import { CommitRow } from './commit-row';
import { buildTimeline, type TimelineEntry } from './group-by-day';

export const commitHref = (sha: string): Href => `/history/${sha}` as Href;

export function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setSwitcherOpen } = useShell();
  const { repo, branch } = useCurrentRepo();
  const [pickerOpen, setPickerOpen] = useState(false);
  const history = useHistory(repo, branch);

  const branchAction = useMemo(
    () =>
      repo && branch ? (
        <Chip
          testID="branch-chip"
          label={branch}
          selected
          leading={<Icon name={ICONS.branch} size={14} color={theme.colors.accentForeground} />}
          onPress={() => setPickerOpen(true)}
        />
      ) : null,
    [repo, branch, theme],
  );
  useTitleBarAction(branchAction);

  const commits = useMemo(() => history.data?.pages.flatMap((p) => p.items) ?? [], [history.data]);
  // `now` is read once per data change so rows do not shuffle between renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the clock only when the data changes
  const now = useMemo(() => new Date(), [history.dataUpdatedAt]);
  const entries = useMemo(() => buildTimeline(commits, now, history.hasNextPage), [commits, now, history.hasNextPage]);
  const stickyHeaderIndices = useMemo(() => entries.flatMap((e, i) => (e.kind === 'header' ? [i] : [])), [entries]);

  const open = useCallback((sha: string) => router.push(commitHref(sha)), [router]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !history.isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, history.isFetchNextPageError, fetchNextPage]);

  const frame = { flex: 1, backgroundColor: theme.colors.background } as const;

  if (!repo) {
    return (
      <View style={frame}>
        <EmptyState
          testID="history-no-repo"
          icon={<Icon name={ICONS.history} size={32} color={theme.colors.mutedForeground} />}
          title="Pick a repository"
          body="Choose a repository to see its commit history."
          action={{ label: 'Choose repository', onPress: () => setSwitcherOpen(true) }}
        />
      </View>
    );
  }

  let body;
  if (history.isPending) {
    body = <TimelineSkeleton />;
  } else if (history.isError) {
    const err = history.error;
    const message = err instanceof Error ? err.message : 'Something went wrong';
    body =
      err instanceof SourceError && err.kind === 'network' ? (
        <RetryRow testID="history-retry" message="You appear to be offline." onRetry={() => void history.refetch()} />
      ) : (
        <EmptyState
          testID="history-error"
          title="Could not load history"
          body={message}
          action={{ label: 'Retry', onPress: () => void history.refetch() }}
        />
      );
  } else if (commits.length === 0) {
    body = (
      <EmptyState
        testID="history-empty"
        icon={<Icon name={ICONS.history} size={32} color={theme.colors.mutedForeground} />}
        title={`No commits on ${branch ?? 'this branch'}`}
      />
    );
  } else {
    body = (
      <FlatList
        testID="history-list"
        data={entries}
        keyExtractor={(e) => e.key}
        stickyHeaderIndices={stickyHeaderIndices}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onRefresh={() => void history.refetch()}
        refreshing={history.isRefetching && !isFetchingNextPage}
        renderItem={({ item }) => <TimelineItem item={item} now={now} onPress={open} />}
        ListFooterComponent={
          history.isFetchNextPageError ? (
            <RetryRow testID="history-page-retry" message="Could not load more commits." onRetry={() => void fetchNextPage()} />
          ) : isFetchingNextPage ? (
            <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, padding: theme.space[4] }]}>Loading more…</Text>
          ) : undefined
        }
      />
    );
  }

  return (
    <View style={frame}>
      {body}
      {branch ? <BranchSheet repo={repo} current={branch} open={pickerOpen} onOpenChange={setPickerOpen} /> : null}
    </View>
  );
}

function TimelineItem({ item, now, onPress }: { item: TimelineEntry; now: Date; onPress(sha: string): void }) {
  const theme = useTheme();
  if (item.kind === 'header') {
    return (
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.4}
        style={[
          theme.type.xs,
          {
            backgroundColor: theme.colors.background,
            color: theme.colors.mutedForeground,
            fontWeight: theme.font.semibold,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[3],
            paddingBottom: theme.space[1],
          },
        ]}
      >
        {item.label}
      </Text>
    );
  }
  return <CommitRow commit={item.commit} isHead={item.isHead} isLast={item.isLast} now={now} onPress={onPress} />;
}

function TimelineSkeleton() {
  const theme = useTheme();
  return (
    <View testID="history-skeleton" accessibilityLabel="Loading history">
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], padding: theme.space[4], minHeight: 64 }}>
          <Skeleton width={10} height={10} radius={5} />
          <View style={{ flex: 1, gap: theme.space[2] }}>
            <Skeleton width="70%" height={12} />
            <Skeleton width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

function RetryRow({ message, onRetry, testID }: { message: string; onRetry(): void; testID: string }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[3], padding: theme.space[4] }}
    >
      <Text style={[theme.type.sm, { flex: 1, color: theme.colors.mutedForeground }]}>{message}</Text>
      <Button variant="outline" size="sm" onPress={onRetry}>
        Retry
      </Button>
    </View>
  );
}
