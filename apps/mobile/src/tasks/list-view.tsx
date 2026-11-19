// The List (Phase 146 H3): a SectionList grouped by the board's group field, filtered by search and chips (assigned to
// me, label) through tasks-core `filter.ts`, and sorted through `sort.ts`.
import { Chip, EmptyState, Input, ListRow, useTheme } from '@bilo-io/ui-native';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import {
  EMPTY_PROJECT_ITEM_FILTER,
  deriveColumns,
  deriveLabelCounts,
  filterProjectItems,
  findStatusField,
  isProjectItemFilterEmpty,
  itemStatusStroke,
  nextSortState,
  selectProjectItem,
  sortItems,
  type ProjectItemFilterState,
  type SortState,
} from '@midnite/tasks-core';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, Text, View } from 'react-native';
import { Icon } from '../ui/icons';
import { itemLabels, itemRef } from './model';

const MAX_LABEL_CHIPS = 8;

/** Toggle one value in a facet list. */
export const toggle = (list: readonly string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function ListView({
  items,
  fields,
  groupField,
  viewerLogin,
  onOpenItem,
}: {
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  groupField: ForgeProjectField | null;
  viewerLogin: string | null;
  onOpenItem: (item: ForgeProjectItem) => void;
}) {
  const theme = useTheme();
  const [filter, setFilter] = useState<ProjectItemFilterState>(EMPTY_PROJECT_ITEM_FILTER);
  const [sort, setSort] = useState<SortState>(null);
  const statusField = useMemo(() => findStatusField(fields), [fields]);

  const labels = useMemo(
    () => [...deriveLabelCounts(items, selectProjectItem).entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LABEL_CHIPS).map(([l]) => l),
    [items],
  );
  const sortable = useMemo(() => fields.filter((f) => f.dataType !== 'text'), [fields]);

  const sections = useMemo(() => {
    const visible = sortItems(filterProjectItems(items, filter), fields, sort);
    const columns = groupField ? deriveColumns(groupField, visible) : [];
    if (columns.length === 0) return visible.length ? [{ id: 'all', title: 'All items', data: visible }] : [];
    return columns.filter((c) => c.items.length > 0).map((c) => ({ id: c.id, title: c.name, data: [...c.items] }));
  }, [items, filter, fields, sort, groupField]);

  const sortLabel = (f: ForgeProjectField) => (sort?.fieldId === f.id ? `${f.name} ${sort.direction === 'asc' ? '↑' : '↓'}` : f.name);

  return (
    <View style={{ flex: 1 }} testID="list-view">
      <View style={{ paddingHorizontal: theme.space[3], paddingBottom: theme.space[2] }}>
        <Input
          value={filter.query}
          onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
          placeholder="Search items"
          accessibilityLabel="Search items"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[2], paddingHorizontal: theme.space[3], paddingBottom: theme.space[2] }} style={{ flexGrow: 0 }}>
        {viewerLogin ? (
          <Chip
            label="Assigned to me"
            selected={filter.assignees.includes(viewerLogin)}
            onPress={() => setFilter((f) => ({ ...f, assignees: toggle(f.assignees, viewerLogin) }))}
          />
        ) : null}
        {labels.map((l) => (
          <Chip key={l} label={l} selected={filter.labels.includes(l)} onPress={() => setFilter((f) => ({ ...f, labels: toggle(f.labels, l) }))} />
        ))}
      </ScrollView>
      {sortable.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[2], paddingHorizontal: theme.space[3], paddingBottom: theme.space[2] }} style={{ flexGrow: 0 }}>
          <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, alignSelf: 'center' }]}>Sort</Text>
          {sortable.map((f) => (
            <Chip key={f.id} label={sortLabel(f)} selected={sort?.fieldId === f.id} onPress={() => setSort((s) => nextSortState(s, f.id))} />
          ))}
        </ScrollView>
      ) : null}
      {sections.length === 0 ? (
        <EmptyState
          icon={<Icon name="search" size={32} color={theme.colors.mutedForeground} />}
          title="No items match"
          action={
            isProjectItemFilterEmpty(filter)
              ? undefined
              : { label: 'Clear filters', onPress: () => setFilter(EMPTY_PROJECT_ITEM_FILTER) }
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                theme.type.xs,
                { color: theme.colors.mutedForeground, fontWeight: theme.font.semibold, backgroundColor: theme.colors.background, paddingHorizontal: theme.space[3], paddingVertical: theme.space[1] },
              ]}
            >
              {section.title.toUpperCase()} · {section.data.length}
            </Text>
          )}
          renderItem={({ item }) => {
            const stroke = itemStatusStroke(item, statusField);
            return (
              <ListRow
                testID={`list-row-${item.id}`}
                title={item.content.title}
                subtitle={itemLabels(item).join(' · ') || undefined}
                meta={itemRef(item)}
                numberOfLines={2}
                leading={<View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: stroke?.color ?? theme.colors.border }} />}
                onPress={() => onOpenItem(item)}
              />
            );
          }}
        />
      )}
    </View>
  );
}
