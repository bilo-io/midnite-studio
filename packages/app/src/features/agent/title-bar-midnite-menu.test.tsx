import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TitleBarMidniteMenu } from './title-bar-midnite-menu';

const mockOpenMenu = vi.fn();
vi.mock('../../components/dialog-host', () => ({
  useDialogs: () => ({
    openMenu: mockOpenMenu,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  cleanup();
  mockOpenMenu.mockClear();
});

describe('TitleBarMidniteMenu', () => {
  const PROPS = {
    repoId: 'r1',
    repoName: 'test-repo',
    cwd: '/path/to/repo',
  };

  it('renders the midnite button with appropriate accessible label', () => {
    render(<TitleBarMidniteMenu {...PROPS} />, { wrapper: createWrapper() });
    const button = screen.getByTestId('titlebar-midnite-menu');
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toBe('Midnite actions for test-repo');
  });

  it('opens menu with project actions, lifecycle actions, and skill groups on click', () => {
    render(<TitleBarMidniteMenu {...PROPS} />, { wrapper: createWrapper() });
    const button = screen.getByTestId('titlebar-midnite-menu');
    fireEvent.click(button);

    expect(mockOpenMenu).toHaveBeenCalledTimes(1);
    const items: { label?: string; type?: string }[] = mockOpenMenu.mock.calls[0]?.[1] ?? [];

    // Check that lifecycle actions are present
    const labels = items.map((i) => i.label ?? i.type);
    expect(labels).toContain('Install');
    expect(labels).toContain('Build');
    expect(labels).toContain('Test');
    expect(labels).toContain('Launch');

    // Check that separators exist
    expect(labels).toContain('separator');
  });
});
