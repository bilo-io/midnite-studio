// Issue detail (Phase 146 H5): title, state Badge, labels, assignees, the project's field values as Chips (tap to change
// a single-select one), the body as plain text with tappable links, the comments and a composer. Close / Reopen sits in
// the header's trailing slot.
import { Badge, Button, Chip, ListRow, Sheet, Textarea, useTheme } from '@bilo-io/ui-native';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { fieldOptionColor } from '@midnite/tasks-core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCommentIssue,
  useIssue,
  useIssueComments,
  useProjectFields,
  useProjectItems,
  useProjects,
  useSetIssueState,
  useSetItemField,
} from '../data/queries';
import { useCurrentRepo } from '../shell/use-current-repo';
import { Icon } from '../ui/icons';
import { LinkedText } from './linked-text';
import { defaultProject } from './project-picker';
import { ScreenHeader } from './screen-header';
import { ErrorBanner, ErrorState, ListSkeleton, errorMessage } from './screen-state';

type SingleSelect = Extract<ForgeProjectField, { dataType: 'single_select' }>;

/** A readable value for one project field on an item, or null when unset. */
export function fieldValueText(item: ForgeProjectItem, field: ForgeProjectField): string | null {
  const v = item.fieldValues[field.id];
  if (!v) return null;
  switch (v.dataType) {
    case 'single_select': {
      const name = field.dataType === 'single_select' ? field.options.find((o) => o.id === v.optionId)?.name : undefined;
      return name ?? (v.name || null);
    }
    case 'iteration':
      return v.title || null;
    case 'text':
      return v.text || null;
    case 'number':
      return String(v.number);
    case 'date':
      return v.date;
  }
}

export function IssueDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ number?: string }>();
  const n = Number(params.number);
  const valid = Number.isInteger(n) && n > 0;
  const { repo } = useCurrentRepo();
  const ref = useMemo(() => (repo ? { owner: repo.owner, name: repo.name } : null), [repo]);
  const issue = useIssue(ref, valid ? n : null);
  const comments = useIssueComments(ref, valid ? n : null);
  const setState = useSetIssueState();
  const comment = useCommentIssue();
  const [draft, setDraft] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const projects = useProjects(ref);
  const project = defaultProject(projects.data ?? []);
  const fields = useProjectFields(project?.id ?? null);
  const items = useProjectItems(project?.id ?? null);
  const item = useMemo(
    () => items.data?.pages.flatMap((p) => p.items).find((i) => i.content.type === 'issue' && i.content.number === n) ?? null,
    [items.data, n],
  );
  const [editing, setEditing] = useState<SingleSelect | null>(null);
  const setField = useSetItemField();

  if (!valid || !ref) {
    return (
      <Shell title="Issue">
        <ErrorState error={new Error('No such issue')} onRetry={() => undefined} />
      </Shell>
    );
  }
  if (issue.isError) {
    return (
      <Shell title={`#${n}`}>
        <ErrorState error={issue.error} onRetry={() => void issue.refetch()} />
      </Shell>
    );
  }
  if (issue.isPending) {
    return (
      <Shell title={`#${n}`}>
        <ListSkeleton />
      </Shell>
    );
  }

  const { issue: row, body } = issue.data;
  const closed = row.state === 'closed';
  const run = async (p: Promise<unknown>, what: string): Promise<boolean> => {
    setBanner(null);
    try {
      await p;
      return true;
    } catch (e) {
      setBanner(`Couldn't ${what}: ${errorMessage(e)}`);
      return false;
    }
  };
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await run(comment.mutateAsync({ repo: ref, n, body: text }), 'send the comment')) setDraft('');
  };

  const fieldChips = (fields.data ?? []).flatMap((f) => {
    if (!item) return [];
    const text = fieldValueText(item, f);
    return text === null && f.dataType !== 'single_select' ? [] : [{ f, text: text ?? 'Not set' }];
  });

  return (
    <Shell
      title={`#${n}`}
      trailing={
        <Button
          size="sm"
          variant="outline"
          loading={setState.isPending}
          onPress={() =>
            void run(setState.mutateAsync({ repo: ref, n, state: closed ? 'OPEN' : 'CLOSED' }), closed ? 'reopen' : 'close')
          }
        >
          {closed ? 'Reopen' : 'Close'}
        </Button>
      }
    >
      {banner ? <ErrorBanner message={banner} onDismiss={() => setBanner(null)} /> : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.space[4], gap: theme.space[3], paddingBottom: insets.bottom + theme.space[6] }}
      >
        <Text style={[theme.type.lg, { color: theme.colors.foreground, fontWeight: theme.font.semibold }]}>{row.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space[2] }}>
          <Badge tone={closed ? 'neutral' : 'success'} testID="state-badge">
            {closed ? 'Closed' : 'Open'}
          </Badge>
          {row.labels.map((l) => (
            <Chip key={l.name} label={l.name} />
          ))}
        </View>
        {row.assignees.length > 0 ? (
          <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>Assigned to {row.assignees.join(', ')}</Text>
        ) : null}
        {fieldChips.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }} testID="field-chips">
            {fieldChips.map(({ f, text }) => (
              <Chip key={f.id} label={`${f.name}: ${text}`} onPress={f.dataType === 'single_select' ? () => setEditing(f) : undefined} />
            ))}
          </View>
        ) : null}
        {body.trim() ? (
          <LinkedText>{body}</LinkedText>
        ) : (
          <Text style={[theme.type.sm, { color: theme.colors.mutedForeground }]}>No description.</Text>
        )}

        <Text style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.semibold, marginTop: theme.space[2] }]}>
          Comments {comments.data ? `(${comments.data.length})` : ''}
        </Text>
        {comments.isError ? (
          <Text style={[theme.type.sm, { color: theme.colors.mutedForeground }]}>Couldn't load comments.</Text>
        ) : (
          (comments.data ?? []).map((c) => (
            <View
              key={c.id}
              testID={`comment-${c.id}`}
              style={{ gap: theme.space[1], padding: theme.space[3], borderRadius: theme.radius.md, backgroundColor: theme.colors.card }}
            >
              <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>
                {c.author} · {c.createdAt.slice(0, 10)}
              </Text>
              <LinkedText>{c.body}</LinkedText>
            </View>
          ))
        )}
        <Textarea value={draft} onChangeText={setDraft} placeholder="Add a comment" accessibilityLabel="Add a comment" />
        <Button onPress={() => void send()} loading={comment.isPending} disabled={!draft.trim()}>
          Send
        </Button>
      </ScrollView>
      {editing && item ? (
        <Sheet
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          side="bottom"
          title={editing.name}
          snapPoints={[0.5]}
          insetBottom={insets.bottom}
          testID="field-sheet"
        >
          <View>
            {editing.options.map((o) => {
              const v = item.fieldValues[editing.id];
              const current = v?.dataType === 'single_select' && v.optionId === o.id;
              return (
                <ListRow
                  key={o.id}
                  title={o.name}
                  testID={`field-option-${o.id}`}
                  leading={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fieldOptionColor(o.color || o.name) }} />}
                  trailing={current ? <Icon name="check" size={18} color={theme.colors.foreground} /> : undefined}
                  onPress={() => {
                    const field = editing;
                    setEditing(null);
                    if (!current && project) {
                      void run(
                        setField.mutateAsync({ projectId: project.id, itemId: item.id, fieldId: field.id, optionId: o.id }),
                        `set ${field.name}`,
                      );
                    }
                  }}
                />
              );
            })}
          </View>
        </Sheet>
      ) : null}
    </Shell>
  );
}

function Shell({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title={title} trailing={trailing} />
      {children}
    </View>
  );
}
