import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { Screensaver } from './screensaver';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  useUiStore.setState({
    requirePasscode: false,
    passcode: null,
    passcodeOnlyWhenLocked: false,
    reposOpen: false,
    terminalOpen: false,
    activeView: 'graph',
  });
  vi.useFakeTimers();
  // The spinner asks the platform about reduced motion on mount, and jsdom
  // ships no `matchMedia`; the neural-cloud background asks for a 2D
  // context, which jsdom answers with a "Not implemented" throw rather than
  // `null` — same workaround `landing-view.test.tsx` uses for the same tree.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Screensaver pills (Phase 46 Theme C)', () => {
  it('without a passcode, a pill click navigates and closes the screensaver immediately', () => {
    const onClose = vi.fn();
    render(<Screensaver onClose={onClose} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /^0 agents/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().terminalOpen).toBe(true);
  });

  it('behind a passcode, a pill click holds the destination and shows the pad instead of navigating', () => {
    useUiStore.setState({ requirePasscode: true, passcode: '1234' });
    const onClose = vi.fn();
    render(<Screensaver onClose={onClose} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /^0 agents/ }));

    expect(screen.getByRole('dialog', { name: 'Enter passcode to unlock' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(useUiStore.getState().terminalOpen).toBe(false);
  });

  it('applies the held destination and closes once the correct code is entered', () => {
    useUiStore.setState({ requirePasscode: true, passcode: '1234' });
    const onClose = vi.fn();
    render(<Screensaver onClose={onClose} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /^0 agents/ }));
    for (const digit of '1234') {
      fireEvent.change(screen.getByLabelText(`Passcode digit ${'1234'.indexOf(digit) + 1}`), {
        target: { value: digit },
      });
    }

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().terminalOpen).toBe(true);
  });

  it("a keypress meant for the pill's pad does not also open LockScreen's own generic dialog", () => {
    useUiStore.setState({ requirePasscode: true, passcode: '1234' });
    render(<Screensaver onClose={vi.fn()} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /^0 agents/ }));
    // A window keydown, exactly what typing a passcode digit dispatches —
    // `LockScreen`'s own "any key opens my dialog too" listener only ever
    // checked its OWN `unlocking` flag, which the pill flow never touches,
    // so without `suppressUnlockTrigger` this used to open a second,
    // redundant "Enter passcode to unlock" dialog underneath the pill's own.
    fireEvent.keyDown(window, { key: '1' });

    expect(screen.getAllByRole('dialog', { name: 'Enter passcode to unlock' })).toHaveLength(1);
  });

  it('drops the held destination on cancel — no navigation, screen stays locked', () => {
    useUiStore.setState({ requirePasscode: true, passcode: '1234' });
    const onClose = vi.fn();
    render(<Screensaver onClose={onClose} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /^0 agents/ }));
    // `PasscodeUnlockDialog` only wires `onCancel` to `PasscodeDialog`'s own
    // header "Close" (X) button — `PasscodePad`'s in-body "Cancel" text
    // button is never rendered for the unlock case, only for setting one.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'Enter passcode to unlock' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(useUiStore.getState().terminalOpen).toBe(false);
  });
});
