// New issue (Phase 146 H6): title (required) and body, created in the current repo. With a project selected the new issue
// is added to it, then the app opens the issue's detail.
import { Button, Input, Textarea, useTheme } from '@bilo-io/ui-native';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useAddProjectItem, useCreateIssueWithId, useProjects } from '../data/queries';
import { usePrefs } from '../state/prefs';
import { useCurrentRepo } from '../shell/use-current-repo';
import { defaultProject } from './project-picker';
import { ErrorBanner, errorMessage } from './screen-state';
import { ScreenHeader } from './screen-header';
import { issueHref } from './tasks-screen';

export const canSubmit = (title: string, busy: boolean): boolean => title.trim().length > 0 && !busy;

export function NewIssueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { repo } = useCurrentRepo();
  const ref = useMemo(() => (repo ? { owner: repo.owner, name: repo.name } : null), [repo]);
  const projects = useProjects(ref);
  // "The selected project" is the one the Tasks tab opens on: a view stored for it, else the repo's default board.
  const views = usePrefs((s) => s.tasksViewByProject);
  const list = projects.data ?? [];
  const project = list.find((p) => views[p.id] !== undefined && !p.closed) ?? defaultProject(list);
  const create = useCreateIssueWithId();
  const addItem = useAddProjectItem();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Once the issue exists a retry (after a failed board add) must not create a second one.
  const created = useRef<{ id: string; number: number } | null>(null);
  const busy = create.isPending || addItem.isPending;

  const submit = async () => {
    if (!ref || !canSubmit(title, busy)) return;
    setError(null);
    if (!created.current) {
      try {
        created.current = await create.mutateAsync({ repo: ref, title: title.trim(), body });
      } catch (e) {
        setError(`Couldn't create the issue: ${errorMessage(e)}`);
        return;
      }
    }
    const issue = created.current;
    if (project) {
      try {
        await addItem.mutateAsync({ projectId: project.id, contentId: issue.id });
      } catch (e) {
        // The issue exists; only the board add failed. Stay so the message is seen; a retry only repeats the add.
        setError(`Issue #${issue.number} was created, but adding it to ${project.title} failed: ${errorMessage(e)}`);
        return;
      }
    }
    router.replace(issueHref(issue.number));
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="New issue" />
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.space[4], gap: theme.space[3] }}>
          <Input label="Title" value={title} onChangeText={setTitle} placeholder="Issue title" returnKeyType="next" />
          <Textarea label="Description" value={body} onChangeText={setBody} placeholder="Describe the issue (optional)" numberOfLines={8} />
          <Button onPress={() => void submit()} loading={busy} disabled={!canSubmit(title, busy) || !ref}>
            Create issue
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
