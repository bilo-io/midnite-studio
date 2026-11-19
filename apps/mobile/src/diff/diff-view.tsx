// The shared unified diff viewer (Phase 146 Theme I4). One `FileDiff` as monospace rows: sticky hunk headers, a two-number
// gutter, add/remove tints with a stronger tint on the intraline ranges, wrapped long lines (a toggle switches to
// horizontal scroll) and a virtualised list so a large file stays smooth. More than 2,000 lines sit behind a gate.
// `compact` renders a few lines in place with no list, toggle or gate: the excerpt a review thread shows.
import { Button, EmptyState, useTheme, withAlpha } from '@bilo-io/ui-native';
import type { FileDiff } from '@midnite/studio-shared';
import { memo, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import {
  hunkIndices,
  isLargeDiff,
  lineCount,
  rowsForFile,
  segmentsOf,
  type DiffRow,
} from './diff-rows';

const MARK = { add: '+', del: '-', ctx: ' ' } as const;
const GUTTER = 32;

export interface DiffViewProps {
  file: FileDiff;
  compact?: boolean;
}

export function DiffView({ file, compact = false }: DiffViewProps) {
  const theme = useTheme();
  const [wrap, setWrap] = useState(true);
  const [loadFull, setLoadFull] = useState(false);
  const rows = useMemo(() => rowsForFile(file), [file]);
  const sticky = useMemo(() => hunkIndices(rows), [rows]);

  const note = (testID: string, title: string, body?: string) => (
    <EmptyState testID={testID} title={title} body={body} />
  );
  if (file.binary) return note('diff-binary', 'Binary file not shown');
  if (file.truncated && file.hunks.length === 0) return note('diff-too-large', 'Diff too large to show', 'GitHub did not include this file’s patch.');
  if (rows.length === 0) {
    return note('diff-empty', file.change === 'renamed' ? `Renamed from ${file.oldPath ?? 'unknown'}` : 'No textual changes');
  }

  if (compact) {
    return (
      <View testID="diff-compact" style={{ backgroundColor: theme.colors.background }}>
        {rows.map((row) => (
          <Row key={row.key} row={row} wrap />
        ))}
      </View>
    );
  }

  if (isLargeDiff(file) && !loadFull) {
    return (
      <EmptyState
        testID="diff-gate"
        title="Large diff"
        body={`${lineCount(file).toLocaleString()} changed lines. Showing them may be slow.`}
        action={{ label: 'Load full diff', onPress: () => setLoadFull(true) }}
      />
    );
  }

  const list = (
    <FlatList
      testID="diff-view"
      data={rows}
      keyExtractor={(r) => r.key}
      stickyHeaderIndices={sticky}
      initialNumToRender={40}
      windowSize={7}
      renderItem={({ item }) => <Row row={item} wrap={wrap} />}
      ListHeaderComponent={
        file.combined ? (
          <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, padding: theme.space[3] }]}>
            Combined diff of an unmerged path: markers show one column per parent.
          </Text>
        ) : undefined
      }
      ListFooterComponent={
        file.truncated ? (
          <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, padding: theme.space[3] }]}>
            {`${file.droppedLines} more lines not shown.`}
          </Text>
        ) : undefined
      }
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: theme.space[1] }}>
        <Button testID="diff-wrap-toggle" variant="ghost" size="sm" onPress={() => setWrap((w) => !w)}>
          {wrap ? 'No wrap' : 'Wrap lines'}
        </Button>
      </View>
      {wrap ? (
        list
      ) : (
        <ScrollView horizontal testID="diff-hscroll" contentContainerStyle={{ minWidth: '100%' }}>
          <View style={{ minWidth: 900, flex: 1 }}>{list}</View>
        </ScrollView>
      )}
    </View>
  );
}

const Row = memo(function Row({ row, wrap }: { row: DiffRow; wrap: boolean }) {
  const theme = useTheme();
  const mono = { fontFamily: theme.font.mono } as const;
  if (row.kind === 'hunk') {
    return (
      <Text
        testID="diff-hunk"
        numberOfLines={1}
        style={[theme.type.xs, mono, { color: theme.colors.mutedForeground, backgroundColor: theme.colors.muted, padding: theme.space[2] }]}
      >
        {row.text}
      </Text>
    );
  }
  const { line } = row;
  const hue = line.kind === 'add' ? theme.colors.success : line.kind === 'del' ? theme.accents.kind.bug : null;
  const gutter = [theme.type.xs, mono, { width: GUTTER, color: theme.colors.mutedForeground, textAlign: 'right' as const }];
  return (
    <View testID={`diff-line-${line.kind}`} style={{ flexDirection: 'row', backgroundColor: hue ? withAlpha(hue, 0.14) : undefined }}>
      <Text style={gutter}>{row.old}</Text>
      <Text style={gutter}>{row.new}</Text>
      <Text style={[theme.type.xs, mono, { width: 14, textAlign: 'center', color: hue ?? theme.colors.mutedForeground }]}>{MARK[line.kind]}</Text>
      <Text
        maxFontSizeMultiplier={1.4}
        numberOfLines={wrap ? undefined : 1}
        style={[theme.type.xs, mono, { flex: 1, color: theme.colors.foreground }]}
      >
        {segmentsOf(line.text, line.ranges).map((s, i) => (
          <Text key={i} style={s.changed && hue ? { backgroundColor: withAlpha(hue, 0.32) } : undefined}>
            {s.text}
          </Text>
        ))}
      </Text>
    </View>
  );
});
