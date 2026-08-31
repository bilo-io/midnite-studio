import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyWorkspace } from './empty-workspace';

function withQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('EmptyWorkspace component', () => {
  afterEach(cleanup);

  it('renders brand logo and wordmark', () => {
    render(withQuery(<EmptyWorkspace />));
    expect(screen.getByTestId('empty-workspace')).toBeDefined();
    expect(screen.getByText('Midnite')).toBeDefined();
    expect(screen.getByText('Studio')).toBeDefined();
  });

  it('renders primary command shortcuts list', () => {
    render(withQuery(<EmptyWorkspace />));
    expect(screen.getByText('Command Palette')).toBeDefined();
    expect(screen.getByText('Go to File')).toBeDefined();
    expect(screen.getByText('Toggle Terminal')).toBeDefined();
    expect(screen.getByText('Toggle Browser')).toBeDefined();
    expect(screen.getByText('Git Graph')).toBeDefined();
    expect(screen.getByText('Search Everywhere')).toBeDefined();
  });

  it('renders open repository button', () => {
    render(withQuery(<EmptyWorkspace />));
    expect(screen.getByRole('button', { name: /Open a repository…/i })).toBeDefined();
  });
});
