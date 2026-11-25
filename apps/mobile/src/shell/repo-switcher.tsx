// The repo switcher (Phase 146 F3): a bottom Sheet over `listRepos`, infinite, with a filter. The last five repos used
// are pinned at the top. Choosing one makes it the current repo and resets the branch to the repo's default.
import { EmptyState, Input, ListRow, Sheet, useTheme } from '@bilo-io/ui-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepos } from '../data/queries';
import type { RepoSummaryRow } from '../data/source';
import { repoKey, usePrefs, type RepoPref } from '../state/prefs';
import { Icon } from '../ui/icons';
import { useShell } from './shell-context';

type Entry = { kind: 'heading'; key: string; label: string } | { kind: 'repo'; key: string; repo: RepoPref; isPrivate: boolean };

/** Pinned recents first (filtered), then every other loaded repo. Pure so the ordering is tested directly. */
export function buildEntries(
  repos: readonly RepoSummaryRow[],
  recents: readonly RepoPref[],
  filter: string,
): Entry[] {
  const q = filter.trim().toLowerCase();
  const matches = (r: { owner: string; name: string }) => !q || repoKey(r).toLowerCase().includes(q);
  const privacy = new Map(repos.map((r) => [repoKey(r), r.isPrivate]));
  const pinned = recents.filter(matches);
  const pinnedKeys = new Set(pinned.map(repoKey));
  const rest = repos.filter((r) => matches(r) && !pinnedKeys.has(repoKey(r)));
  const out: Entry[] = [];
  if (pinned.length > 0) {
    out.push({ kind: 'heading', key: 'h:recent', label: 'Recent' });
    for (const r of pinned) out.push({ kind: 'repo', key: `p:${repoKey(r)}`, repo: r, isPrivate: privacy.get(repoKey(r)) ?? false });
  }
  if (rest.length > 0) {
    if (pinned.length > 0) out.push({ kind: 'heading', key: 'h:all', label: 'All repositories' });
    for (const r of rest) {
      out.push({
        kind: 'repo',
        key: `r:${repoKey(r)}`,
        repo: { owner: r.owner, name: r.name, defaultBranch: r.defaultBranch },
        isPrivate: r.isPrivate,
      });
    }
  }
  return out;
}

export function RepoSwitcher() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { switcherOpen, setSwitcherOpen } = useShell();
  const repos = useRepos();
  const recents = usePrefs((s) => s.recentRepos);
  const current = usePrefs((s) => s.currentRepo);
  const hydrated = usePrefs((s) => s.hydrated);
  const [filter, setFilter] = useState('');

  const loaded = useMemo(() => repos.data?.pages.flatMap((p) => p.items) ?? [], [repos.data]);
  const entries = useMemo(() => buildEntries(loaded, recents, filter), [loaded, recents, filter]);

  // First run: with no repo chosen there is nothing to show, so the switcher opens itself once.
  useEffect(() => {
    if (hydrated && current === null) setSwitcherOpen(true);
  }, [hydrated, current, setSwitcherOpen]);

  // A filter that matches nothing loaded keeps paging until it does or the list ends.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = repos;
  useEffect(() => {
    if (switcherOpen && filter.trim() && entries.length === 0 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [switcherOpen, filter, entries.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const choose = (repo: RepoPref) => {
    usePrefs.getState().setCurrentRepo(repo);
    setSwitcherOpen(false);
    setFilter('');
  };

  return (
    <Sheet
      open={switcherOpen}
      onOpenChange={setSwitcherOpen}
      side="bottom"
      title="Switch repository"
      snapPoints={[0.6, 0.9]}
      insetBottom={insets.bottom}
      testID="repo-switcher"
    >
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
          <Input
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter repositories"
            accessibilityLabel="Filter repositories"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {repos.isError ? (
          <EmptyState
            title="Could not load repositories"
            body={repos.error instanceof Error ? repos.error.message : undefined}
            action={{ label: 'Retry', onPress: () => void repos.refetch() }}
          />
        ) : repos.isPending ? (
          <Text style={[theme.type.sm, { color: theme.colors.mutedForeground, padding: theme.space[4] }]}>Loading repositories…</Text>
        ) : entries.length === 0 && !hasNextPage ? (
          <EmptyState title={filter.trim() ? 'No repositories match' : 'No repositories'} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.key}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) =>
              item.kind === 'heading' ? (
                <Text
                  style={[
                    theme.type.xs,
                    {
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
              ) : (
                <ListRow
                  title={repoKey(item.repo)}
                  subtitle={current && repoKey(current) === repoKey(item.repo) ? 'Current' : undefined}
                  trailing={item.isPrivate ? <Icon name="lock" size={16} color={theme.colors.mutedForeground} /> : undefined}
                  onPress={() => choose(item.repo)}
                />
              )
            }
            ListFooterComponent={
              isFetchingNextPage ? (
                <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, padding: theme.space[4] }]}>Loading more…</Text>
              ) : undefined
            }
          />
        )}
      </View>
    </Sheet>
  );
}
