import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { OnboardingModal } from './onboarding-modal';
import { useUiStore } from '../../store/ui-store';

/**
 * Phase 68 Theme D — a fullscreen modal shown to a first-time user, with zero
 * `role`, zero `aria-` and zero focus code until this phase.
 */
describe('OnboardingModal focus and role', () => {
  afterEach(() => {
    cleanup();
    act(() => useUiStore.getState().setShowOnboarding(false));
  });

  it('is a named modal dialog whose Tab cycle cannot leave it', () => {
    act(() => useUiStore.getState().setShowOnboarding(true));
    render(<OnboardingModal />);

    const dialog = screen.getByRole('dialog', { name: 'Welcome to Midnite Studio' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const close = screen.getByRole('button', { name: 'Close' });
    const start = screen.getByRole('button', { name: 'Get Started' });

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(start);

    fireEvent.keyDown(start, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('hands focus back to whatever opened it', () => {
    render(
      <>
        <button type="button" data-testid="opener">
          Show onboarding
        </button>
        <OnboardingModal />
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
});
