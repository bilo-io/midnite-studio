// A minimal unified diff viewer for one `FileDiff` (Phase 146 Theme G3). Theme I builds the shared viewer (I4); until
// it lands this renders hunks as monospace lines with an add/delete tint from theme tokens, and says so plainly for
// binary, truncated and combined (conflict) diffs rather than showing an empty pane.
import { useTheme, withAlpha } from '@bilo-io/ui-native';
import type { DiffLine, FileDiff } from '@midnite/studio-shared';
import { ScrollView, Text, View } from 'react-native';

const MARK: Record<DiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ' };

export function DiffView({ file }: { file: FileDiff }) {
  const theme = useTheme();
  const note = (text: string) => (
    <Text style={[theme.type.sm, { color: theme.colors.mutedForeground, padding: theme.space[4] }]}>{text}</Text>
  );
  if (file.binary) return <View testID="diff-binary">{note('Binary file not shown.')}</View>;
  if (file.hunks.length === 0) {
    return <View testID="diff-empty">{note(file.change === 'renamed' ? `Renamed from ${file.oldPath ?? 'unknown'}, no content changes.` : 'No textual changes.')}</View>;
  }
  const tint = (kind: DiffLine['kind']) =>
    kind === 'add' ? withAlpha(theme.colors.success, 0.14) : kind === 'del' ? withAlpha(theme.colors.destructive, 0.14) : undefined;
  return (
    <ScrollView testID="diff-view" style={{ flex: 1 }}>
      {file.combined ? note('Combined diff of an unmerged path: markers show one column per parent.') : null}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth: '100%' }}>
          {file.hunks.map((hunk, h) => (
            <View key={h}>
              <Text
                numberOfLines={1}
                style={[
                  theme.type.xs,
                  { fontFamily: theme.font.mono, color: theme.colors.mutedForeground, backgroundColor: theme.colors.muted, padding: theme.space[2] },
                ]}
              >
                {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.heading}`}
              </Text>
              {hunk.lines.map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', backgroundColor: tint(line.kind), paddingHorizontal: theme.space[2] }}>
                  <Text style={[theme.type.xs, { fontFamily: theme.font.mono, width: 36, color: theme.colors.mutedForeground }]}>
                    {line.newNo ?? line.oldNo ?? ''}
                  </Text>
                  <Text style={[theme.type.xs, { fontFamily: theme.font.mono, color: theme.colors.foreground }]}>
                    {`${MARK[line.kind]} ${line.text}`}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {file.truncated ? note(`${file.droppedLines} more lines not shown.`) : null}
    </ScrollView>
  );
}
