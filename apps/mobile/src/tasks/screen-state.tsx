// Skeletons shaped like the Tasks views (Phase 146 H). Error, empty and banner surfaces are the shared ones in
// `../ui/screen-state` (Theme L4).
import { Skeleton, useTheme } from '@bilo-io/ui-native';
import { View } from 'react-native';

export function BoardSkeleton({ columnWidth }: { columnWidth: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.space[3], paddingHorizontal: theme.space[3] }} testID="board-skeleton">
      {[0, 1, 2].map((c) => (
        <View key={c} style={{ width: columnWidth, gap: theme.space[2] }}>
          <Skeleton width={120} height={20} />
          {[0, 1, 2].map((r) => (
            <Skeleton key={r} width="100%" height={72} radius={theme.radius.lg} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2], padding: theme.space[3] }} testID="list-skeleton">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} width="100%" height={48} radius={theme.radius.md} />
      ))}
    </View>
  );
}
