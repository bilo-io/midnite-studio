// Loading, empty and error surfaces for every screen (Phase 146 L4), per the design's state matrix and its
// `ScreenState` copy-by-kind table. History, Tasks, Reviews and the detail screens all render through these.
import { EmptyState, useTheme } from '@bilo-io/ui-native';
import { RefreshControl, ScrollView, Text, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { SourceError } from '../data/queries';
import type { ResultKind } from '../data/source';
import { Icon, type IconName } from './icons';

export const ERROR_COPY: Record<ResultKind, { icon: IconName; title: string; action: string }> = {
  auth: { icon: 'lock', title: 'Your GitHub session ended', action: 'Sign in again' },
  scope: { icon: 'shieldOff', title: 'This needs another GitHub permission', action: 'Re-authorise' },
  network: { icon: 'offline', title: "You're offline", action: 'Retry' },
  error: { icon: 'error', title: 'Something went wrong', action: 'Retry' },
};

export const errorKind = (error: unknown): ResultKind => (error instanceof SourceError ? error.kind : 'error');
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function ErrorState({ error, onRetry, testID = 'screen-error' }: { error: unknown; onRetry: () => void; testID?: string }) {
  const theme = useTheme();
  const kind = errorKind(error);
  const copy = ERROR_COPY[kind];
  return (
    <View style={{ flex: 1, justifyContent: 'center' }} testID={testID}>
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
      testID="screen-banner"
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


export interface ScreenQuery {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: unknown;
  isRefetching: boolean;
  refetch(): unknown;
}

export interface ScreenEmpty {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}

/** Empty means no items: an empty array, an infinite query's pages all empty, or no data at all. */
export function isEmptyData(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  const pages = (data as { pages?: unknown }).pages;
  if (Array.isArray(pages)) return pages.every((p) => isEmptyData((p as { items?: unknown }).items ?? p));
  return false;
}

const fill: ViewStyle = { flexGrow: 1, justifyContent: 'center' };

/**
 * One query, four surfaces: the skeleton while it is pending, the error copy for its `Result.kind` with a Retry (a
 * failed refresh with data on screen keeps the data), the empty state, and otherwise the children. Pull to refresh on
 * the error and empty surfaces refetches; a list in `children` wires its own `onRefresh`. `testID` prefixes the
 * surfaces: `<id>-skeleton`, `<id>-error`, `<id>-empty`.
 */
export function ScreenState({
  query,
  skeleton,
  empty,
  isEmpty = isEmptyData,
  testID = 'screen',
  children,
}: {
  query: ScreenQuery;
  skeleton: ReactNode;
  empty: ScreenEmpty;
  isEmpty?: (data: unknown) => boolean;
  testID?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  if (query.isPending) return <View testID={`${testID}-skeleton`}>{skeleton}</View>;
  const surface = (node: ReactNode) => (
    <ScrollView
      contentContainerStyle={fill}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {node}
    </ScrollView>
  );
  if (query.isError && query.data === undefined) {
    return surface(<ErrorState testID={`${testID}-error`} error={query.error} onRetry={() => void query.refetch()} />);
  }
  if (isEmpty(query.data)) {
    return surface(
      <EmptyState
        testID={`${testID}-empty`}
        icon={<Icon name={empty.icon} size={32} color={theme.colors.mutedForeground} />}
        title={empty.title}
        body={empty.body}
        action={empty.action}
      />,
    );
  }
  return <>{children}</>;
}
