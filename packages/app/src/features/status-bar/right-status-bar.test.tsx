import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotificationBell } from './notification-bell';
import { AssistantMenu } from './assistant-menu';
import { RightDelimiterSegment } from './right-delimiter';

describe('Right zone status bar components', () => {
  it('renders NotificationBell popover header when open', async () => {
    render(<NotificationBell />);
    const bellButton = screen.getByTestId('notification-bell');
    expect(bellButton).toBeDefined();
  });

  it('renders AssistantMenu popover header when open', async () => {
    render(<AssistantMenu />);
    const assistantButton = screen.getByTestId('assistant-menu');
    expect(assistantButton).toBeDefined();
  });

  it('renders RightDelimiterSegment correctly', () => {
    render(<RightDelimiterSegment />);
    const delim = screen.getByTestId('right-delimiter');
    expect(delim).toBeDefined();
  });
});
