import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ActivityIndicator } from './terminal-session-list';

afterEach(cleanup);

describe('ActivityIndicator', () => {
  it.each([
    ['thinking' as const, 'thinking', 'Thinking'],
    ['waiting' as const, 'waiting', 'Waiting for input'],
    ['idle' as const, 'idle', 'Idle'],
    [undefined, 'unknown', 'Activity unknown'],
  ])('renders %s as data-activity=%s with the label %s', (activity, expectedData, label) => {
    const { container } = render(<ActivityIndicator activity={activity} />);
    expect(container.querySelector(`[data-activity="${expectedData}"]`)).not.toBeNull();
    expect(screen.getByLabelText(label)).not.toBeNull();
  });

  it('never renders a live region — an agent repaints too fast for one to be read', () => {
    for (const activity of ['thinking', 'waiting', 'idle', undefined] as const) {
      const { container, unmount } = render(<ActivityIndicator activity={activity} />);
      expect(container.querySelector('[aria-live]')).toBeNull();
      unmount();
    }
  });
});
