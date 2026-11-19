// The project picker (Phase 146 H1): a header Chip naming the project that opens a bottom Sheet over `useProjects`.
import { Chip, ListRow, Sheet, useTheme } from '@bilo-io/ui-native';
import type { ForgeProject } from '@midnite/studio-shared';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../ui/icons';

/** The board a repo opens on: a linked, open one first, then any open one, then whatever exists. */
export function defaultProject(projects: readonly ForgeProject[]): ForgeProject | null {
  return (
    projects.find((p) => p.linkedToRepo && !p.closed) ?? projects.find((p) => !p.closed) ?? projects[0] ?? null
  );
}

export function ProjectPicker({
  projects,
  selectedId,
  onSelect,
}: {
  projects: readonly ForgeProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === selectedId) ?? null;
  return (
    <>
      <Chip
        testID="project-chip"
        label={selected?.title ?? 'Choose project'}
        leading={<Icon name="trello" size={14} color={theme.colors.foreground} />}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} side="bottom" title="Project" snapPoints={[0.5]} insetBottom={insets.bottom} testID="project-sheet">
        <View>
          {projects.map((p) => (
            <ListRow
              key={p.id}
              testID={`project-option-${p.id}`}
              title={p.title}
              subtitle={p.closed ? 'Closed' : undefined}
              trailing={p.id === selectedId ? <Icon name="check" size={18} color={theme.colors.foreground} /> : undefined}
              onPress={() => {
                onSelect(p.id);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}
