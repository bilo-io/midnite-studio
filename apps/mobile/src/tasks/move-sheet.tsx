// "Move to…" (Phase 146 H2): a bottom Sheet listing the group field's options, a check on the current one.
import { ListRow, Sheet, useTheme } from '@bilo-io/ui-native';
import type { ForgeProjectField } from '@midnite/studio-shared';
import { fieldOptionColor } from '@midnite/tasks-core';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../ui/icons';

type SingleSelect = Extract<ForgeProjectField, { dataType: 'single_select' }>;

export function MoveSheet({
  open,
  onOpenChange,
  field,
  currentOptionId,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: SingleSelect;
  currentOptionId: string | null;
  onChoose: (optionId: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title="Move to…" snapPoints={[0.5]} insetBottom={insets.bottom} testID="move-sheet">
      <View>
        {field.options.map((option) => {
          const current = option.id === currentOptionId;
          return (
            <ListRow
              key={option.id}
              title={option.name}
              testID={`move-option-${option.id}`}
              leading={
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fieldOptionColor(option.color || option.name) }}
                />
              }
              trailing={current ? <Icon name="check" size={18} color={theme.colors.foreground} /> : undefined}
              onPress={() => onChoose(option.id)}
            />
          );
        })}
      </View>
    </Sheet>
  );
}
