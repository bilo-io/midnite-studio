import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { CompanionLauncher } from './companion-launcher';

describe('CompanionLauncher', () => {
  beforeEach(() => {
    useUiStore.setState({ companionEnabled: true, companionPanelOpen: false });
    useCompanionStore.getState().send('enable');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders with button and toggles companion panel on click', () => {
    render(<CompanionLauncher />);
    const button = screen.getByTestId('companion-launcher');
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    expect(useUiStore.getState().companionPanelOpen).toBe(true);
  });

  it('shows open state when companionPanelOpen is true', () => {
    useUiStore.setState({ companionPanelOpen: true });
    render(<CompanionLauncher />);
    const button = screen.getByTestId('companion-launcher');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('is-open')).toBe(true);

    fireEvent.click(button);
    expect(useUiStore.getState().companionPanelOpen).toBe(false);
  });

  it('is disabled when companionEnabled is false', () => {
    useUiStore.setState({ companionEnabled: false });
    render(<CompanionLauncher />);
    const button = screen.getByTestId('companion-launcher');
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);
    expect(useUiStore.getState().companionPanelOpen).toBe(false);
  });
});
