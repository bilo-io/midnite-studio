import { act } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastHost, dismissToast, showToast, useToasts } from './toast-host';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger() {
  const toasts = useToasts();
  return (
    <>
      <button onClick={() => toasts.show({ message: 'Fetched origin' })}>plain</button>
      <button
        onClick={() =>
          toasts.show({
            message: 'Deleted branch feature/x',
            danger: true,
            action: { label: 'Undo', onAction: () => {} },
          })
        }
      >
        with-action
      </button>
    </>
  );
}

describe('ToastHost', () => {
  it('renders a toast pushed through useToasts, with its message', () => {
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    fireEvent.click(screen.getByText('plain'));
    expect(screen.getByText('Fetched origin')).not.toBeNull();
  });

  it('renders the action button only when the request carries one', () => {
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    fireEvent.click(screen.getByText('plain'));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();

    fireEvent.click(screen.getByText('with-action'));
    expect(screen.getByRole('button', { name: 'Undo' })).not.toBeNull();
  });

  it('dismisses on clicking its own close button, without touching a second toast', () => {
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    fireEvent.click(screen.getByText('plain'));
    fireEvent.click(screen.getByText('with-action'));
    expect(screen.getByText('Fetched origin')).not.toBeNull();
    expect(screen.getByText('Deleted branch feature/x')).not.toBeNull();

    fireEvent.click(screen.getAllByLabelText('Dismiss')[0]!);

    expect(screen.queryByText('Fetched origin')).toBeNull();
    expect(screen.getByText('Deleted branch feature/x')).not.toBeNull();
  });

  it('Escape dismisses only the topmost toast', () => {
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    fireEvent.click(screen.getByText('plain'));
    fireEvent.click(screen.getByText('with-action'));

    fireEvent.keyDown(window, { key: 'Escape' });

    // "with-action" was pushed last, so it is topmost and the one Escape takes.
    expect(screen.queryByText('Deleted branch feature/x')).toBeNull();
    expect(screen.getByText('Fetched origin')).not.toBeNull();
  });

  it('auto-dismisses a plain toast after 4s and an actioned one after 8s', () => {
    vi.useFakeTimers();
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    act(() => {
      fireEvent.click(screen.getByText('plain'));
      fireEvent.click(screen.getByText('with-action'));
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Fetched origin')).toBeNull();
    expect(screen.getByText('Deleted branch feature/x')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Deleted branch feature/x')).toBeNull();
  });

  it('calls the action and dismisses the toast when its button is clicked', () => {
    const onAction = vi.fn();
    function Local() {
      const toasts = useToasts();
      return (
        <button
          onClick={() => toasts.show({ message: 'msg', action: { label: 'Undo', onAction } })}
        >
          go
        </button>
      );
    }
    render(
      <ToastHost>
        <Local />
      </ToastHost>,
    );

    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByText('msg')).toBeNull();
  });

  it('throws a clear error from useToasts outside a ToastHost', () => {
    // Swallow the expected React error-boundary console noise for this one case.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/useToasts must be used inside <ToastHost>/);
    spy.mockRestore();
  });
});

// Phase 109 Theme E — the companion's Undo toast is raised from a plain
// function, with no component to call `useToasts()` from.
describe('showToast — outside React', () => {
  it('shows nothing and returns null when no host is mounted', () => {
    expect(showToast({ message: 'Nobody home' })).toBeNull();
  });

  it('pushes onto the mounted host, honours durationMs, and can be dismissed by id', () => {
    vi.useFakeTimers();
    render(<ToastHost>{null}</ToastHost>);

    let id: string | null = null;
    act(() => {
      id = showToast({
        message: 'Local voice set to Bella.',
        durationMs: 60_000,
        action: { label: 'Undo', onAction: () => {} },
      });
    });
    expect(id).not.toBeNull();
    expect(screen.getByText('Local voice set to Bella.')).toBeTruthy();

    // Past the 8 s an action toast normally gets, still up.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText('Local voice set to Bella.')).not.toBeNull();

    act(() => {
      dismissToast(id as unknown as string);
    });
    expect(screen.queryByText('Local voice set to Bella.')).toBeNull();
  });
});
