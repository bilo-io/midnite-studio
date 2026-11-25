// The Board (Phase 146 H2): paged columns from `deriveColumns` over the group field, a card list per column, a
// long-press "Move to…" sheet with an optimistic write, and position dots above the columns.
import { Chip, EmptyState, useTheme } from '@bilo-io/ui-native';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { deriveColumns, fieldOptionChipStyle, findStatusField, itemStatusStroke, type BoardColumn } from '@midnite/tasks-core';
import { useMemo, useState } from 'react';
import { FlatList, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Icon } from '../ui/icons';
import { MoveSheet } from './move-sheet';
import { applyMoves, columnSnapInterval, columnWidth, currentOptionId, movableField, pageIndex } from './model';
import { ErrorBanner } from '../ui/screen-state';
import { TaskCard } from './task-card';
import { useMoveItem } from './use-move-item';

const GAP = 12;

export function BoardView({
  projectId,
  items,
  fields,
  groupField,
  onOpenItem,
  onNewIssue,
}: {
  projectId: string;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  groupField: ForgeProjectField | null;
  onOpenItem: (item: ForgeProjectItem) => void;
  onNewIssue: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { moves, error, clearError, move } = useMoveItem(projectId, groupField);
  const [page, setPage] = useState(0);
  const [moving, setMoving] = useState<ForgeProjectItem | null>(null);

  const shown = useMemo(() => applyMoves(items, groupField, moves), [items, groupField, moves]);
  const columns = useMemo(() => deriveColumns(groupField, shown), [groupField, shown]);
  const statusField = useMemo(() => findStatusField(fields), [fields]);
  const colWidth = columnWidth(width);
  const interval = columnSnapInterval(width, GAP);
  const writable = movableField(groupField);

  if (items.length === 0 || columns.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="tasks" size={32} color={theme.colors.mutedForeground} />}
        title="No items in this project"
        action={{ label: 'New issue', onPress: onNewIssue }}
      />
    );
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(pageIndex(e.nativeEvent.contentOffset.x, interval, columns.length));

  return (
    <View style={{ flex: 1 }} testID="board-view">
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
      <View
        accessibilityLabel={`Column ${page + 1} of ${columns.length}`}
        style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: theme.space[2] }}
      >
        {columns.map((c, i) => (
          <View
            key={c.id}
            testID={i === page ? 'column-dot-active' : 'column-dot'}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === page ? theme.colors.foreground : theme.colors.border,
            }}
          />
        ))}
      </View>
      <FlatList
        horizontal
        style={{ flex: 1 }}
        data={columns}
        keyExtractor={(c) => c.id}
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingHorizontal: theme.space[3], gap: GAP }}
        renderItem={({ item: column }) => (
          <Column
            column={column}
            width={colWidth}
            statusField={statusField}
            onOpenItem={onOpenItem}
            onMove={writable ? setMoving : undefined}
          />
        )}
      />
      {writable && moving ? (
        <MoveSheet
          open
          onOpenChange={(o) => {
            if (!o) setMoving(null);
          }}
          field={writable}
          currentOptionId={currentOptionId(moving, writable)}
          onChoose={(optionId) => {
            const item = moving;
            setMoving(null);
            if (optionId !== currentOptionId(item, writable)) void move(item, optionId);
          }}
        />
      ) : null}
    </View>
  );
}

function Column({
  column,
  width,
  statusField,
  onOpenItem,
  onMove,
}: {
  column: BoardColumn;
  width: number;
  statusField: ForgeProjectField | null;
  onOpenItem: (item: ForgeProjectItem) => void;
  onMove?: (item: ForgeProjectItem) => void;
}) {
  const theme = useTheme();
  const chip = fieldOptionChipStyle(column.color || column.name);
  return (
    <View style={{ width, flex: 1 }} testID={`column-${column.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2], paddingBottom: theme.space[2] }}>
        <Chip label={column.name} color={chip.color} />
        <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{column.items.length}</Text>
      </View>
      <FlatList
        data={column.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ gap: theme.space[2], paddingBottom: theme.space[6] }}
        renderItem={({ item }) => (
          <TaskCard
            item={item}
            stroke={itemStatusStroke(item, statusField)}
            onPress={() => onOpenItem(item)}
            onLongPress={onMove ? () => onMove(item) : undefined}
          />
        )}
      />
    </View>
  );
}
