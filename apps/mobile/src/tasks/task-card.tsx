// The board card (Phase 146 H2): number, title, labels, stacked assignee avatars and a left status stroke. The whole
// card reads as one sentence to a screen reader, so its children are not individually focusable.
import { Avatar, Chip, useTheme } from '@bilo-io/ui-native';
import type { ForgeProjectItem } from '@midnite/studio-shared';
import type { StatusStroke } from '@midnite/tasks-core';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { itemLabels, itemRef } from './model';

const STROKE_WIDTH = 3;
const MAX_AVATARS = 3;
const MAX_LABELS = 3;

/** "#12, Fix the thing. Labels ui, app. Assigned to octo, hubot." */
export function cardLabel(item: ForgeProjectItem): string {
  const parts = [`${itemRef(item)}, ${item.content.title}.`];
  const labels = itemLabels(item);
  if (labels.length > 0) parts.push(`Labels ${labels.join(', ')}.`);
  if (item.content.assignees.length > 0) parts.push(`Assigned to ${item.content.assignees.join(', ')}.`);
  return parts.join(' ');
}

export const TaskCard = memo(function TaskCard({
  item,
  stroke,
  onPress,
  onLongPress,
}: {
  item: ForgeProjectItem;
  stroke: StatusStroke | null;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const labels = itemLabels(item);
  const assignees = item.content.assignees;
  const shown = assignees.slice(0, MAX_AVATARS);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(item)}
      accessibilityHint={onLongPress ? 'Long press to move to another column' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      testID={`task-card-${item.id}`}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          overflow: 'hidden',
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.card,
          minHeight: 44,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        theme.elevation[1],
      ]}
    >
      <View
        testID="task-card-stroke"
        style={{ width: STROKE_WIDTH, backgroundColor: stroke?.color ?? theme.colors.border, opacity: stroke?.opacity ?? 1 }}
      />
      <View accessible={false} style={{ flex: 1, padding: theme.space[3], gap: theme.space[2] }}>
        <Text accessible={false} style={[theme.type.xs, { color: theme.colors.mutedForeground, fontFamily: theme.font.mono }]}>
          {itemRef(item)}
        </Text>
        <Text
          accessible={false}
          numberOfLines={3}
          style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}
        >
          {item.content.title}
        </Text>
        {labels.length > 0 || shown.length > 0 ? (
          <View accessible={false} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space[1] }}>
            {labels.slice(0, MAX_LABELS).map((l) => (
              <Chip key={l} label={l} />
            ))}
            {labels.length > MAX_LABELS ? <Chip label={`+${labels.length - MAX_LABELS}`} /> : null}
            <View style={{ flex: 1 }} />
            <View accessible={false} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {shown.map((login, i) => (
                <View key={login} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                  <Avatar name={login} size={24} />
                </View>
              ))}
              {assignees.length > MAX_AVATARS ? (
                <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, marginLeft: theme.space[1] }]}>
                  +{assignees.length - MAX_AVATARS}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
