// Loading, empty and error surfaces shared by the Tasks views (Phase 146 H, states per the design's state matrix and the
// `ScreenState` copy-by-kind table). Theme L may lift this into a shared `ScreenState`; until then it lives here.
import { EmptyState, Skeleton, useTheme } from '@bilo-io/ui-native';
import { Text, View } from 'react-native';
import { SourceError } from '../data/queries';
import type { ResultKind } from '../data/source';
import { Icon, type IconName } from '../ui/icons';

export const ERROR_COPY: Record<ResultKind, { icon: IconName; title: string; action: string }> = {
  auth: { icon: 'lock', title: 'Your GitHub session ended', action: 'Sign in again' },
  scope: { icon: 'shield-off', title: 'This needs another GitHub permission', action: 'Re-authorise' },
  network: { icon: 'wifi-off', title: "You're offline", action: 'Retry' },
  error: { icon: 'alert-triangle', title: 'Something went wrong', action: 'Retry' },
};

export const errorKind = (error: unknown): ResultKind => (error instanceof SourceError ? error.kind : 'error');
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const theme = useTheme();
  const kind = errorKind(error);
  const copy = ERROR_COPY[kind];
  return (
    <View style={{ flex: 1, justifyContent: 'center' }} testID="tasks-error">
      <EmptyState
        icon={<Icon name={copy.icon} size={32} color={theme.colors.mutedForeground} />}
        title={copy.title}
        body={kind === 'error' ? errorMessage(error) : undefined}
        action={{ label: copy.action, onPress: onRetry }}
      />
    </View>
  );
}

/** A top banner for a failed write (a move that snapped back, a comment that did not send). Press to dismiss. */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      testID="tasks-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[2],
        marginHorizontal: theme.space[3],
        marginBottom: theme.space[2],
        padding: theme.space[3],
        borderRadius: theme.radius.md,
        backgroundColor: theme.accents.kind.bug,
      }}
    >
      <Text style={[theme.type.sm, { flex: 1, color: theme.colors.foreground }]}>{message}</Text>
      <Text
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.semibold }]}
      >
        Dismiss
      </Text>
    </View>
  );
}

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
