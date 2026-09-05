import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Workbench } from './workbench';

/**
 * The working-tree tab's ladder — Phase 60 Theme C.
 *
 * `useStatus` carries `placeholderData`, so its "still reading" state is
 * `isPlaceholderData && isFetching` rather than `isPending`; these cases are
 * written against that shape deliberately, because a view that keyed on
 * `isPending` would never once show the skeleton and this is the assertion
 * that would catch it.
 */
const status = vi.fn();

vi.mock('../../services/use-status', () => ({
  useStatus: () => status(),
}));

vi.mock('../status/status-panel', () => ({
  StatusPanel: () => <div data-testid="status-panel" />,
}));

vi.mock('./tab-strip', () => ({
  TabStrip: () => <div data-testid="tab-strip" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const showing = (): string[] =>
  Object.entries({
    error: screen.queryByText('Could not read the working tree'),
    skeleton: screen.queryByText('Reading the working tree…'),
    content: screen.queryByTestId('status-panel'),
  })
    .filter(([, node]) => node !== null)
    .map(([name]) => name);

describe('Workbench — the working tree’s three states', () => {
  it('shows the failure, with its own message, when `git status` throws', () => {
    status.mockReturnValue({
      isError: true,
      isFetching: false,
      isPlaceholderData: false,
      error: new Error('not a git repository'),
    });
    render(<Workbench />);
    expect(showing()).toEqual(['error']);
    expect(screen.getByText('not a git repository')).toBeTruthy();
  });

  it('shows the skeleton while the placeholder status is still standing in', () => {
    status.mockReturnValue({
      isError: false,
      isFetching: true,
      isPlaceholderData: true,
      error: null,
    });
    render(<Workbench />);
    expect(showing()).toEqual(['skeleton']);
  });

  it('hands over to the panel — which owns the clean-tree copy — once the read lands', () => {
    status.mockReturnValue({
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    });
    render(<Workbench />);
    expect(showing()).toEqual(['content']);
  });

  it('keeps the tab strip up in every state — a failed read is not a lost workbench', () => {
    status.mockReturnValue({
      isError: true,
      isFetching: false,
      isPlaceholderData: false,
      error: new Error('boom'),
    });
    render(<Workbench />);
    expect(screen.getByTestId('tab-strip')).toBeTruthy();
  });
});
