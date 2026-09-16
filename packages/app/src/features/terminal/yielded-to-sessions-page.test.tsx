import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from './terminal-store';
import { YieldedToSessionsPage } from './yielded-to-sessions-page';

afterEach(() => {
  cleanup();
  useTerminalStore.setState({ sessionsPaneSessionId: null });
});

describe('YieldedToSessionsPage', () => {
  it('says where the terminal went and hands it back on "Focus it here"', () => {
    useTerminalStore.setState({ sessionsPaneSessionId: 's-1' });

    render(<YieldedToSessionsPage sessionId="s-1" />);

    expect(screen.getByText(/showing on the Sessions page/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Focus it here' });
    expect(button.className).toContain('bg-primary');

    fireEvent.click(button);
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBeNull();
  });

  it('never clears a claim held by a different session', () => {
    useTerminalStore.setState({ sessionsPaneSessionId: 's-2' });

    render(<YieldedToSessionsPage sessionId="s-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus it here' }));

    expect(useTerminalStore.getState().sessionsPaneSessionId).toBe('s-2');
  });

  it('stays in layout but invisible as an inactive stacked pane', () => {
    const { container } = render(<YieldedToSessionsPage sessionId="s-1" hidden />);
    const pane = container.querySelector('[data-terminal-yielded="s-1"]');
    expect(pane?.className).toContain('invisible');
    expect(pane?.getAttribute('aria-hidden')).toBe('true');
  });
});
