import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { OnboardingModal } from './onboarding-modal';

/**
 * Phase 68 Theme D gave this modal its role/`aria-`/focus skeleton. Phase 90
 * Theme I turned the single screen it wrapped into a two-step wizard — this
 * file now covers the frame (step navigation, Back/Skip/Continue, the
 * "Escape/close = skip the rest" rule) rather than the one screen it used to
 * be. `steps/welcome-step.test.tsx` and `steps/forge-connect-step.test.tsx`
 * cover each step's own content.
 */
function installBridge(overrides: Partial<MidniteStudioBridge> = {}) {
  const bridge: Partial<MidniteStudioBridge> = {
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
    ...overrides,
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingModal />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  act(() => {
    useUiStore.getState().setShowOnboarding(false);
    useUiStore.setState({ onboardingSkippedStepIds: [] });
  });
});

describe('OnboardingModal — frame', () => {
  it('is a named modal dialog whose Tab cycle cannot leave it, on the mandatory first step', () => {
    installBridge();
    act(() => useUiStore.getState().setShowOnboarding(true));
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Welcome to Midnite Studio' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    // Step one is mandatory: no Skip button, and Back is disabled — both
    // excluded from the tab order, so it cycles Close <-> Continue only.
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    const close = screen.getByRole('button', { name: 'Close' });
    const continueButton = screen.getByRole('button', { name: 'Continue' });

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(continueButton);

    fireEvent.keyDown(continueButton, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('hands focus back to whatever opened it', () => {
    installBridge();
    render(
      <>
        <button type="button" data-testid="opener">
          Show onboarding
        </button>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <OnboardingModal />
        </QueryClientProvider>
      </>,
    );

    const opener = screen.getByTestId('opener');
    opener.focus();

    act(() => useUiStore.getState().setShowOnboarding(true));
    expect(screen.queryByRole('dialog')).not.toBeNull();

    act(() => useUiStore.getState().setShowOnboarding(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Continue advances to step two, and Back returns to step one', async () => {
    installBridge();
    act(() => useUiStore.getState().setShowOnboarding(true));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('dialog', { name: 'Connect your forges' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: 'Welcome to Midnite Studio' })).toBeTruthy();
  });

  it('Skip on the optional step records it as skipped and closes on the last step', async () => {
    installBridge();
    act(() => useUiStore.getState().setShowOnboarding(true));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('dialog', { name: 'Connect your forges' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(useUiStore.getState().onboardingSkippedStepIds).toContain('forges');
    expect(useUiStore.getState().showOnboarding).toBe(false);
  });

  it('completing both steps via Continue never records the optional step as skipped', async () => {
    installBridge();
    act(() => useUiStore.getState().setShowOnboarding(true));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('dialog', { name: 'Connect your forges' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(useUiStore.getState().onboardingSkippedStepIds).not.toContain('forges');
    expect(useUiStore.getState().showOnboarding).toBe(false);
  });

  it('Escape from the mandatory step skips the rest (the downstream optional step) and closes', () => {
    installBridge();
    act(() => useUiStore.getState().setShowOnboarding(true));
    renderModal();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useUiStore.getState().onboardingSkippedStepIds).toContain('forges');
    expect(useUiStore.getState().showOnboarding).toBe(false);
  });

  it('the close button behaves the same as Escape — skip the rest, not cancel', () => {
    installBridge();
    act(() => useUiStore.getState().setShowOnboarding(true));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(useUiStore.getState().onboardingSkippedStepIds).toContain('forges');
    expect(useUiStore.getState().showOnboarding).toBe(false);
  });
});
