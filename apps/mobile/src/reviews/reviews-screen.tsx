// The Reviews tab (Phase 146 Theme I1): Requested / Mine / All over `usePulls`, an infinite list with pull to refresh.
import { EmptyState, SegmentedControl, Skeleton, useTheme } from '@bilo-io/ui-native';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { usePulls } from '../data/queries';
import { useShell } from '../shell/shell-context';
import { useCurrentRepo } from '../shell/use-current-repo';
import { Icon } from '../ui/icons';
import { ScreenState } from '../ui/screen-state';
import { SCOPE_OF, type ReviewTab } from './format';
import { PullRow } from './pull-row';

export const pullHref = (n: number): Href => `/reviews/${n}` as Href;

const SEGMENTS = [
  { key: 'requested', label: 'Requested' },
  { key: 'mine', label: 'Mine' },
  { key: 'all', label: 'All' },
];
const EMPTY_TITLE: Record<ReviewTab, string> = {
  requested: 'No reviews requested from you',
  mine: 'You have no pull requests',
  all: 'No pull requests',
};

export function ReviewsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setSwitcherOpen } = useShell();
  const { repo } = useCurrentRepo();
  const [tab, setTab] = useState<ReviewTab>('requested');
  const pulls = usePulls(repo, SCOPE_OF[tab]);
  const items = useMemo(() => pulls.data?.pages.flatMap((p) => p.items) ?? [], [pulls.data]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the clock only when the data changes
  const now = useMemo(() => new Date(), [pulls.dataUpdatedAt]);
  const open = useCallback((n: number) => router.push(pullHref(n)), [router]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pulls;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !pulls.isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, pulls.isFetchNextPageError, fetchNextPage]);

  const frame = { flex: 1, backgroundColor: theme.colors.background } as const;

  if (!repo) {
    return (
      <View style={frame}>
        <EmptyState
          testID="reviews-no-repo"
          icon={<Icon name="reviews" size={32} color={theme.colors.mutedForeground} />}
          title="Pick a repository"
          body="Choose a repository to see its pull requests."
          action={{ label: 'Choose repository', onPress: () => setSwitcherOpen(true) }}
        />
      </View>
    );
  }

  const body = (
    <ScreenState
      testID="reviews"
      query={pulls}
      skeleton={
        <View style={{ padding: theme.space[4], gap: theme.space[4] }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ gap: theme.space[2] }}>
              <Skeleton width="85%" height={16} />
              <Skeleton width="50%" height={12} />
            </View>
          ))}
        </View>
      }
      isEmpty={() => items.length === 0}
      empty={{ icon: 'reviews', title: EMPTY_TITLE[tab] }}
    >
      <FlatList
        testID="reviews-list"
        data={items}
        keyExtractor={(p) => String(p.number)}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onRefresh={() => void pulls.refetch()}
        refreshing={pulls.isRefetching && !isFetchingNextPage}
        renderItem={({ item }) => <PullRow pull={item} now={now} onPress={open} />}
        ListFooterComponent={
          pulls.isFetchNextPageError ? (
            <EmptyState testID="reviews-page-retry" title="Could not load more" action={{ label: 'Retry', onPress: () => void fetchNextPage() }} />
          ) : isFetchingNextPage ? (
            <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, padding: theme.space[4] }]}>Loading more…</Text>
          ) : undefined
        }
      />
    </ScreenState>
  );

  return (
    <View style={frame}>
      <View style={{ padding: theme.space[3] }}>
        <SegmentedControl testID="reviews-scope" accessibilityLabel="Pull request scope" segments={SEGMENTS} value={tab} onChange={(k) => setTab(k as ReviewTab)} />
      </View>
      {body}
    </View>
  );
}
