import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DetachedWindowFrame, usePopoutHeaderActions } from './detached-window-frame';

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

  it('merges terminal/repos/browser into the bar: dock-on-hover mark, no separate re-dock button', () => {
    render(
      <DetachedWindowFrame role="repos" title="Git Repos">
        <div data-testid="content">Repos Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Git Repos')).toBeDefined();
    expect(screen.queryByLabelText('Re-dock Git Repos')).toBeNull();

    screen.getByLabelText('Dock Git Repos').click();
    expect(mockBridge.window.dock).toHaveBeenCalledWith({ role: 'repos' });
  });

  it('leaves the FAB popout on the plain generic frame — a dedicated re-dock button, no merged mark', () => {
    render(
      <DetachedWindowFrame role="fab" title="Midnite Loops">
        <div data-testid="content">Loops Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Midnite Loops')).toBeDefined();
    expect(screen.queryByLabelText('Dock Midnite Loops')).toBeNull();

    screen.getByLabelText('Re-dock Midnite Loops').click();
    expect(mockBridge.window.dock).toHaveBeenCalledWith({ role: 'fab' });
  });

  it('exposes the merged bar action slot only for a merged role', () => {
    let slotForRepos: HTMLDivElement | null = null;
    let slotForFab: HTMLDivElement | null = null;

    function ReadSlot({ into }: { into: (el: HTMLDivElement | null) => void }) {
      into(usePopoutHeaderActions());
      return null;
    }

    render(
      <DetachedWindowFrame role="repos" title="Git Repos">
        <ReadSlot into={(el) => (slotForRepos = el)} />
      </DetachedWindowFrame>,
    );
    render(
      <DetachedWindowFrame role="fab" title="Midnite Loops">
        <ReadSlot into={(el) => (slotForFab = el)} />
      </DetachedWindowFrame>,
    );

    expect(slotForRepos).not.toBeNull();
    expect(slotForFab).toBeNull();
  });
});
