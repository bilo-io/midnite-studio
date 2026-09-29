import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { ThemeProvider } from '@bilo-io/ui/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_SETUP_STATE } from '../../store/setup-state';
import { useUiStore } from '../../store/ui-store';
import { SetupOverlay } from './setup-overlay';
import { SETUP_PAGES } from './setup-pages';
import { useSetupStore } from './setup-store';

/**
 * Phase 98 Theme A — the overlay frame: the first-run gate, the chrome (X,
 * theme toggle, dots, Skip), page navigation by button and by arrow key, and
 * what each way out records. Each page's own content is covered beside it in
 * `pages/`.
 */
function installBridge() {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    systemHealth: vi.fn().mockResolvedValue({
      git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
      shell: '/bin/zsh',
      sshAgent: { running: true, keys: 1 },
      cli: { installed: false, path: null, target: null, managed: false },
    }),
    forgeAccounts: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      remove: vi.fn(),
      switch: vi.fn(),
      capabilities: vi.fn(),
      reachableRepos: vi.fn(),
    } as unknown as MidniteStudioBridge['forgeAccounts'],
  };
}

function renderOverlay() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SetupOverlay />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const DONE = '2026-01-01T00:00:00.000Z';

beforeEach(() => {
  installBridge();
  useUiStore.setState({ setupState: INITIAL_SETUP_STATE });
  useSetupStore.setState({ requested: false, startPageId: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({ setupState: INITIAL_SETUP_STATE });
  useSetupStore.setState({ requested: false, startPageId: null });
});

const overlay = () => screen.queryByTestId('setup-overlay');
const stepOf = () => overlay()?.getAttribute('data-step');

describe('SetupOverlay — the gate', () => {
  it('opens by itself on a fresh profile, at the intro', () => {
    renderOverlay();
    expect(screen.getByRole('dialog', { name: 'Set up Midnite Studio' })).toBeTruthy();
    expect(stepOf()).toBe('intro');
  });

  it('stays closed for a profile that finished or left setup', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE } });
    const { unmount } = renderOverlay();
    expect(overlay()).toBeNull();
    unmount();

    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, dismissedAt: DONE } });
    renderOverlay();
    expect(overlay()).toBeNull();
  });

  it('opens on request for a finished profile, at the page asked for', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE } });
    renderOverlay();
    act(() => useSetupStore.getState().openSetup('forges'));
    expect(stepOf()).toBe('forges');
    expect(screen.getByRole('dialog', { name: 'Connect your forges' })).toBeTruthy();
  });
});

describe('SetupOverlay — chrome', () => {
  it('renders X, the theme toggle, one dot per page, and Skip', () => {
    renderOverlay();
    expect(screen.getByRole('button', { name: 'Close setup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeTruthy();
    const dots = screen.getByRole('list', { name: 'Setup pages' }).querySelectorAll('button');
    expect(dots).toHaveLength(SETUP_PAGES.length);
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  });

  it('marks the current dot active and the ones behind it done', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const dots = [...screen.getByRole('list', { name: 'Setup pages' }).querySelectorAll('button')];
    expect(dots.map((dot) => dot.getAttribute('data-dot'))).toEqual(['done', 'active']);
    expect(dots[1]?.getAttribute('aria-current')).toBe('step');
  });

  it('is a modal dialog whose Tab cycle cannot leave it', () => {
    renderOverlay();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: 'Close setup' });
    const skip = screen.getByRole('button', { name: 'Skip' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(skip);
    fireEvent.keyDown(skip, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });
});

describe('SetupOverlay — navigation', () => {
  it('Next and Back walk intro → pages → finale and back', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    expect(stepOf()).toBe('machine');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepOf()).toBe('forges');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepOf()).toBe('finale');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(stepOf()).toBe('forges');
  });

  it('→ and ← step between pages', () => {
    renderOverlay();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('machine');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('forges');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(stepOf()).toBe('machine');
  });

  it('ignores arrows typed into a text field, and arrows with a modifier', async () => {
    act(() => useSetupStore.getState().openSetup('forges'));
    renderOverlay();
    const [token] = await screen.findAllByPlaceholderText('paste a token');
    fireEvent.keyDown(token!, { key: 'ArrowLeft' });
    expect(stepOf()).toBe('forges');
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true });
    expect(stepOf()).toBe('forges');
  });

  it('→ on the finale does not finish setup — only Get started does', () => {
    renderOverlay();
    for (let i = 0; i <= SETUP_PAGES.length; i += 1) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('finale');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(stepOf()).toBe('finale');
    expect(useUiStore.getState().setupState.completedAt).toBeNull();
  });

  it('Get started on the finale completes setup and closes', () => {
    renderOverlay();
    for (let i = 0; i <= SETUP_PAGES.length; i += 1) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(useUiStore.getState().setupState.completedAt).not.toBeNull();
    expect(overlay()).toBeNull();
  });

  it('a dot jumps straight to its page', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: /^Connect your forges/ }));
    expect(stepOf()).toBe('forges');
  });
});

describe('SetupOverlay — leaving early', () => {
  it('Skip records the page it left, and when', () => {
    act(() => useSetupStore.getState().openSetup('forges'));
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    const state = useUiStore.getState().setupState;
    expect(state.skippedPageIds).toEqual(['forges']);
    expect(state.lastPageId).toBe('forges');
    expect(state.dismissedAt).not.toBeNull();
    expect(state.completedAt).toBeNull();
    expect(overlay()).toBeNull();
  });

  it('X records where it left but marks nothing skipped', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Begin setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    const state = useUiStore.getState().setupState;
    expect(state.skippedPageIds).toEqual([]);
    expect(state.lastPageId).toBe('machine');
    expect(state.dismissedAt).not.toBeNull();
    expect(overlay()).toBeNull();
  });

  it('Escape takes the X path', () => {
    renderOverlay();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().setupState.dismissedAt).not.toBeNull();
    expect(useUiStore.getState().setupState.skippedPageIds).toEqual([]);
    expect(overlay()).toBeNull();
  });

  it('Next through a page skipped on an earlier visit clears that skip', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE, skippedPageIds: ['forges'] } });
    renderOverlay();
    act(() => useSetupStore.getState().openSetup('forges'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(useUiStore.getState().setupState.skippedPageIds).toEqual([]);
  });

  it('hands focus back to whatever opened it', () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, completedAt: DONE } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <button type="button" data-testid="opener">
            Open setup
          </button>
          <SetupOverlay />
        </QueryClientProvider>
      </ThemeProvider>,
    );
    const opener = screen.getByTestId('opener');
    opener.focus();
    act(() => useSetupStore.getState().openSetup());
    expect(overlay()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
