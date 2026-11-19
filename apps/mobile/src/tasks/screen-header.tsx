// A back header for the routes pushed above the tabs (issue detail, New issue). The tabs' title bar belongs to the
// shell, so detail screens draw their own, as History's commit detail does.
import { AppBar, IconButton, useTheme } from '@bilo-io/ui-native';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ICONS, Icon } from '../ui/icons';

export function ScreenHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <AppBar
      testID="screen-header"
      insetTop={insets.top}
      leading={
        <IconButton
          icon={<Icon name={ICONS.chevronLeft} color={theme.colors.foreground} />}
          label="Back"
          size={40}
          onPress={() => router.back()}
        />
      }
      title={title}
      trailing={trailing}
    />
  );
}
