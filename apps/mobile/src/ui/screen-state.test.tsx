// vitest/jsdom: ScreenState's four surfaces, the copy for each error kind, and the offline banner's threshold (L4).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@bilo-io/ui-native';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_AFTER, useNetworkStatus } from '../data/network-status';
import { SourceError } from '../data/queries';
import type { ResultKind } from '../data/source';
import { createQueryClient } from '../providers/query-client';
import { OfflineBanner } from './offline-banner';
import { ERROR_COPY, ScreenState, isEmptyData, type ScreenQuery } from './screen-state';

afterEach(cleanup);

const query = (over: Partial<ScreenQuery> = {}): ScreenQuery => ({
  isPending: false,
  isError: false,
  error: null,
  data: [1],
  isRefetching: false,
  refetch: vi.fn(),
  ...over,
});

const show = (q: ScreenQuery) =>
  render(
    <ThemeProvider>
      <ScreenState query={q} skeleton={<Text>skeleton</Text>} empty={{ icon: 'history', title: 'Nothing here', body: 'Try later' }} testID="t">
        <Text>content</Text>
      </ScreenState>
    </ThemeProvider>,
  );

describe('ScreenState', () => {
  it('renders the skeleton while pending', () => {
    show(query({ isPending: true, data: undefined }));
    expect(screen.getByTestId('t-skeleton')).toBeTruthy();
    expect(screen.queryByText('content')).toBeNull();
  });
  it('renders the empty state for empty data, with its glyph', () => {
    show(query({ data: [] }));
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByText('Try later')).toBeTruthy();
    expect(screen.getByLabelText('icon:git-commit')).toBeTruthy();
  });
  it('renders the children otherwise', () => {
    show(query());
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('keeps the data on screen when a refresh fails', () => {
    show(query({ isError: true, error: new Error('x') }));
    expect(screen.getByText('content')).toBeTruthy();
  });

  const copy: [ResultKind, string, string, string][] = [
    ['auth', 'Your GitHub session ended', 'Sign in again', 'lock'],
    ['scope', 'This needs another GitHub permission', 'Re-authorise', 'shield-off'],
    ['network', "You're offline", 'Retry', 'wifi-off'],
    ['error', 'Something went wrong', 'Retry', 'alert-triangle'],
  ];
  it.each(copy)('shows the %s copy and its action', (kind, title, action, glyph) => {
    const refetch = vi.fn();
    show(query({ isError: true, data: undefined, error: new SourceError(kind, 'boom'), refetch }));
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText(`icon:${glyph}`)).toBeTruthy();
    fireEvent.click(screen.getByText(action));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(ERROR_COPY[kind].title).toBe(title);
  });
  it('shows the message for a plain error', () => {
    show(query({ isError: true, data: undefined, error: new Error('kaput') }));
    expect(screen.getByText('kaput')).toBeTruthy();
  });
});

describe('isEmptyData', () => {
  it('reads arrays, infinite pages and nothing', () => {
    expect(isEmptyData(undefined)).toBe(true);
    expect(isEmptyData([])).toBe(true);
    expect(isEmptyData({ pages: [{ items: [] }, { items: [] }] })).toBe(true);
    expect(isEmptyData({ pages: [{ items: [] }, { items: [1] }] })).toBe(false);
  });
});

describe('offline banner', () => {
  beforeEach(() => useNetworkStatus.setState({ consecutiveFailures: 0, offline: false }));

  it('appears after two consecutive network failures and hides on the next success', () => {
    render(
      <ThemeProvider>
        <OfflineBanner />
      </ThemeProvider>,
    );
    const { recordNetworkFailure, recordReached } = useNetworkStatus.getState();
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => recordNetworkFailure());
    expect(OFFLINE_AFTER).toBe(2);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => recordNetworkFailure());
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    act(() => recordReached());
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('a success between two failures resets the count, and the query client feeds it', async () => {
    const client = createQueryClient();
    const fail = () => client.fetchQuery({ queryKey: [Math.random()], queryFn: () => Promise.reject(new SourceError('network', 'x')), retry: false }).catch(() => {});
    await fail();
    await client.fetchQuery({ queryKey: ['ok'], queryFn: () => 1 });
    await fail();
    expect(useNetworkStatus.getState().offline).toBe(false);
    await fail();
    expect(useNetworkStatus.getState().offline).toBe(true);
  });
});
