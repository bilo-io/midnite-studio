// One commit in the timeline (Phase 146 Theme G1): a 24dp rail (dot plus connecting line), the subject on two lines,
// author and relative time, and the short sha in a mono Chip. A merge commit's dot is a hollow ring; the branch head's
// dot is filled with the success colour.
import { Avatar, useTheme } from '@bilo-io/ui-native';
import type { Commit } from '@midnite/studio-shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isMerge, relativeTime, shortSha } from './group-by-day';

export interface CommitRowProps {
  commit: Commit;
  isHead: boolean;
  isLast: boolean;
  now: Date;
  onPress(sha: string): void;
}

const RAIL = 24;
const DOT = 10;

function CommitRowImpl({ commit, isHead, isLast, now, onPress }: CommitRowProps) {
  const theme = useTheme();
  const merge = isMerge(commit);
  const time = relativeTime(commit.authorDate, now);
  const sha = shortSha(commit.sha);
  return (
    <Pressable
      testID={`commit-row-${sha}`}
      accessibilityRole="button"
      accessibilityLabel={`${merge ? 'Merge commit' : 'Commit'} ${commit.subject}, ${commit.authorName}, ${time}, ${sha}`}
      onPress={() => onPress(commit.sha)}
      style={({ pressed }) => [
        styles.row,
        { minHeight: 64, paddingRight: theme.space[4] },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
    >
      <View style={{ width: RAIL, alignItems: 'center', marginLeft: theme.space[2] }}>
        <View
          testID={merge ? 'rail-dot-merge' : isHead ? 'rail-dot-head' : 'rail-dot'}
          style={{
            width: DOT,
            height: DOT,
            marginTop: theme.space[4],
            borderRadius: theme.radius.full,
            borderWidth: 2,
            borderColor: isHead ? theme.colors.success : theme.colors.border,
            backgroundColor: merge ? theme.colors.background : isHead ? theme.colors.success : theme.colors.border,
          }}
        />
        <View
          style={{
            width: StyleSheet.hairlineWidth * 2,
            flex: 1,
            backgroundColor: theme.colors.border,
            opacity: isLast ? 0 : 1,
          }}
        />
      </View>
      <View style={{ flex: 1, paddingVertical: theme.space[3], paddingLeft: theme.space[2], gap: theme.space[1] }}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
          style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}
        >
          {commit.subject}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Avatar name={commit.authorName} size={24} />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={[theme.type.xs, { flexShrink: 1, color: theme.colors.mutedForeground }]}
          >
            {`${commit.authorName} · ${time}`}
          </Text>
        </View>
      </View>
      <View style={{ paddingTop: theme.space[3] }}>
        <ShaChip sha={sha} />
      </View>
    </Pressable>
  );
}

/** The short sha in a muted mono pill (ui-native's `Chip` has no mono face, so this one is local). */
export function ShaChip({ sha }: { sha: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.muted,
        borderRadius: theme.radius.full,
        paddingHorizontal: theme.space[2],
        paddingVertical: 2,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        style={[theme.type.xs, { fontFamily: theme.font.mono, color: theme.colors.mutedForeground }]}
      >
        {sha}
      </Text>
    </View>
  );
}

export const CommitRow = memo(CommitRowImpl);

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'stretch' } });
