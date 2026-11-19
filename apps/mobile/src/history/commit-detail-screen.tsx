// Commit detail (Phase 146 Theme G3): full message, author and committer, parents (each tappable), then the changed
// files. Tapping a file shows its diff in place; the back arrow returns to the list, then to History.
import { AppBar, Avatar, EmptyState, IconButton, ListRow, Skeleton, useTheme } from '@bilo-io/ui-native';
import type { FileDiff } from '@midnite/studio-shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SourceError, useCommit } from '../data/queries';
import { useCurrentRepo } from '../shell/use-current-repo';
import { ICONS, Icon } from '../ui/icons';
import { ShaChip } from './commit-row';
import { DiffView } from '../diff/diff-view';
import { commitHref } from './history-screen';
import { formatDateTime, shortSha } from './group-by-day';

export function CommitDetailScreen({ sha }: { sha: string }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { repo } = useCurrentRepo();
  const detail = useCommit(repo, sha);
  const [file, setFile] = useState<FileDiff | null>(null);

  const back = () => (file ? setFile(null) : router.back());
  const bar = (
    <AppBar
      testID="commit-bar"
      insetTop={insets.top}
      leading={
        <IconButton icon={<Icon name={ICONS.chevronLeft} color={theme.colors.foreground} />} label="Back" size={40} onPress={back} />
      }
      title={file ? file.path : `Commit ${shortSha(sha)}`}
    />
  );
  const frame = { flex: 1, backgroundColor: theme.colors.background } as const;

  if (!repo) {
    return (
      <View style={frame}>
        {bar}
        <EmptyState testID="commit-no-repo" title="Pick a repository" body="Choose a repository to open this commit." />
      </View>
    );
  }
  if (detail.isPending) {
    return (
      <View style={frame}>
        {bar}
        <View testID="commit-skeleton" style={{ padding: theme.space[4], gap: theme.space[3] }}>
          <Skeleton width="80%" height={16} />
          <Skeleton width="50%" height={12} />
          <Skeleton width="100%" height={48} />
        </View>
      </View>
    );
  }
  if (detail.isError && !detail.data) {
    const offline = detail.error instanceof SourceError && detail.error.kind === 'network';
    return (
      <View style={frame}>
        {bar}
        <EmptyState
          testID="commit-error"
          title={offline ? 'You appear to be offline' : 'Could not load commit'}
          body={detail.error instanceof Error ? detail.error.message : undefined}
          action={{ label: 'Retry', onPress: () => void detail.refetch() }}
        />
      </View>
    );
  }

  const { commit, files, message, committerName } = detail.data!;
  if (file) {
    return (
      <View style={frame}>
        {bar}
        <DiffView file={file} />
      </View>
    );
  }

  const person = (label: string, name: string, at: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
      <Avatar name={name} size={24} />
      <Text maxFontSizeMultiplier={1.4} style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{`${label} ${name} · ${formatDateTime(at)}`}</Text>
    </View>
  );
  const sameCommitter = !committerName || committerName === commit.authorName;
  const body = (message ?? commit.subject).trim();
  const totalAdd = files.reduce((n, f) => n + f.insertions, 0);
  const totalDel = files.reduce((n, f) => n + f.deletions, 0);

  return (
    <View style={frame}>
      {bar}
      <ScrollView testID="commit-detail">
        <View style={{ padding: theme.space[4], gap: theme.space[3] }}>
          <Text
            selectable
            maxFontSizeMultiplier={1.4}
            style={[theme.type.base, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}
          >
            {body}
          </Text>
          {person('Authored by', commit.authorName, commit.authorDate)}
          {sameCommitter ? null : person('Committed by', committerName, commit.committerDate)}
          <ShaChip sha={commit.sha} />
        </View>
        {commit.parents.length > 0 ? (
          <View>
            <SectionLabel>{commit.parents.length > 1 ? 'Parents (merge)' : 'Parent'}</SectionLabel>
            {commit.parents.map((p) => (
              <ListRow
                key={p}
                testID={`parent-${shortSha(p)}`}
                title={shortSha(p)}
                onPress={() => router.push(commitHref(p))}
              />
            ))}
          </View>
        ) : null}
        <SectionLabel>{`${files.length} ${files.length === 1 ? 'file' : 'files'} changed · +${totalAdd} −${totalDel}`}</SectionLabel>
        {files.map((f) => (
          <ListRow
            key={f.path}
            testID={`file-${f.path}`}
            title={f.path}
            numberOfLines={2}
            subtitle={f.change === 'renamed' && f.oldPath ? `from ${f.oldPath}` : undefined}
            meta={f.binary ? 'binary' : `+${f.insertions} −${f.deletions}`}
            onPress={() => setFile(f)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={1.4}
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
      {children}
    </Text>
  );
}
