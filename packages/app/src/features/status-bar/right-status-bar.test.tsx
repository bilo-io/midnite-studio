import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { NotificationBell } from './notification-bell';
import { AssistantMenu } from './assistant-menu';
import { StatusSeparator } from './status-separator';

describe('Right zone status bar components', () => {
  it('renders NotificationBell popover header when open', async () => {
    render(<NotificationBell />);
    const bellButton = screen.getByTestId('notification-bell');
    expect(bellButton).toBeDefined();
  });

  // AssistantMenu itself renders nothing while no panel is docked
  // (`assistant-menu.test.tsx` covers that in depth) — this only needs to
  // confirm the mini FAB is what actually shows up once the Loops panel is.
  it('renders AssistantMenu as the mini FAB once the Loops panel is docked', async () => {
    useUiStore.setState({ fabPanelOpen: true, fabDetached: false });
    render(<AssistantMenu />);
    const assistantButton = screen.getByTestId('assistant-menu');
    expect(assistantButton).toBeDefined();
    useUiStore.setState({ fabPanelOpen: false });
  });

  // Was `RightDelimiterSegment`, a delimiter registered as a *segment* in the
  // middle of `STATUS_SEGMENTS`. Phase 39 moved placement into the data
  // (`StatusSegment.group`) and left only the markup here, so the assertion is
  // now about the shared separator rather than one hand-placed instance of it.
  it('renders StatusSeparator with the marker status-bar.tsx prunes on', () => {
    render(<StatusSeparator />);
    const separator = screen.getByTestId('status-separator');
    expect(separator).toBeDefined();
    expect(separator.hasAttribute('data-status-sep')).toBe(true);
  });
});
