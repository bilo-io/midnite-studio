import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fabPlacementFor } from './fab-placement';
import { StatusBar } from './status-bar';

describe('fabPlacementFor', () => {
  it('docks the FAB in the status bar on the Media view only', () => {
    expect(fabPlacementFor('media')).toBe('statusbar');
    expect(fabPlacementFor('graph')).toBe('floating');
    expect(fabPlacementFor('settings')).toBe('floating');
  });
});

describe('StatusBar fab slot', () => {
  it('renders the FAB inside the footer when handed one, and nothing otherwise', () => {
    const wrap = (ui: React.ReactElement) => (
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    );
    const { rerender } = render(wrap(<StatusBar />));
    expect(screen.queryByTestId('status-bar-fab')).toBeNull();
    rerender(wrap(<StatusBar fab={<button data-testid="fab-button">fab</button>} />));
    const slot = screen.getByTestId('status-bar-fab');
    expect(screen.getByTestId('status-bar').contains(slot)).toBe(true);
    expect(slot.querySelector('[data-testid="fab-button"]')).not.toBeNull();
  });
});
