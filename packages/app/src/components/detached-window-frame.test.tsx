import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DetachedWindowFrame } from './detached-window-frame';

const mockBridge = {
  windowChrome: {
    platform: 'darwin',
    frameless: true,
    onFullscreenChange: vi.fn(() => () => {}),
    onFocusChange: vi.fn(() => () => {}),
    setBackgroundColor: vi.fn(),
  },
  window: {
    dock: vi.fn(),
  },
};

vi.mock('../services/bridge', () => ({
  bridge: () => mockBridge,
}));

vi.mock('../services/queries', () => ({
  useRepos: () => ({ data: [] }),
}));

vi.mock('../store/ui-store', () => ({
  useUiStore: (selector: (s: { selectedRepoId: string | null }) => unknown) =>
    selector({ selectedRepoId: null }),
}));

describe('DetachedWindowFrame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and applies top padding offset for the fixed titlebar', () => {
    const { container } = render(
      <DetachedWindowFrame role="terminal" title="Terminal">
        <div data-testid="content">Terminal Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Terminal')).toBeDefined();
    expect(screen.getByTestId('content')).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeDefined();
    expect(root.style.paddingTop).toBe('var(--titlebar-h, 0px)');
  });
});
