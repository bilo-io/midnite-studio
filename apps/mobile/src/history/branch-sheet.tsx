// The branch picker (Phase 146 Theme G2): a bottom Sheet over `useBranches` with a filter. Choosing a branch stores
// it per repo in prefs (F6), so it survives a restart.
import { EmptyState, Input, ListRow, Sheet, useTheme } from '@bilo-io/ui-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBranches } from '../data/queries';
import { usePrefs, type RepoPref } from '../state/prefs';
import { Icon } from '../ui/icons';

/** Branch names matching the filter (case-insensitive substring), the current one pinned first. Pure, tested. */
export function filterBranches(names: readonly string[], filter: string, current: string | null): string[] {
  const q = filter.trim().toLowerCase();
  const hits = names.filter((n) => !q || n.toLowerCase().includes(q));
  return current && hits.includes(current) ? [current, ...hits.filter((n) => n !== current)] : hits;
}

export function BranchSheet({
  repo,
  current,
  open,
  onOpenChange,
}: {
  repo: RepoPref;
  current: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('');
  const branches = useBranches(open ? repo : null);
  const names = useMemo(() => branches.data?.pages.flatMap((p) => p.items) ?? [], [branches.data]);
  const shown = useMemo(() => filterBranches(names, filter, current), [names, filter, current]);

  // A filter that matches nothing loaded keeps paging until it does or the list ends.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = branches;
  useEffect(() => {
    if (open && filter.trim() && shown.length === 0 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [open, filter, shown.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const choose = (name: string) => {
    usePrefs.getState().setBranch(repo, name);
    onOpenChange(false);
    setFilter('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title="Switch branch" snapPoints={[0.6, 0.9]} insetBottom={insets.bottom} testID="branch-sheet">
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
          <Input value={filter} onChangeText={setFilter} placeholder="Filter branches" accessibilityLabel="Filter branches" autoCapitalize="none" autoCorrect={false} />
        </View>
        {branches.isError ? (
          <EmptyState
            title="Could not load branches"
            body={branches.error instanceof Error ? branches.error.message : undefined}
            action={{ label: 'Retry', onPress: () => void branches.refetch() }}
          />
        ) : branches.isPending ? null : shown.length === 0 && !hasNextPage ? (
          <EmptyState title={filter.trim() ? 'No branches match' : 'No branches'} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(n) => n}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) => (
              <ListRow
                title={item}
                subtitle={item === current ? 'Current' : undefined}
                leading={<Icon name="branch" size={18} color={theme.colors.mutedForeground} />}
                onPress={() => choose(item)}
              />
            )}
          />
        )}
      </View>
    </Sheet>
  );
}
