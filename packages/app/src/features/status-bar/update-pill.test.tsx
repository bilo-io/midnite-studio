import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UpdateState } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { UpdatePill } from './update-pill';

const IDLE: UpdateState = { phase: 'idle', version: null, percent: null, error: null };

/** A bridge carrying only the pieces this surface touches. */
function stubBridge() {
  const check = vi.fn();
  const download = vi.fn();
  const restart = vi.fn();
  const setChannel = vi.fn();
  let handler: ((s: UpdateState) => void) | null = null;
  const onState = vi.fn((h: (s: UpdateState) => void) => {
    handler = h;
    return () => {
      handler = null;
    };
  });

  Object.defineProperty(window, 'midniteStudio', {
    configurable: true,
    value: { update: { check, download, restart, setChannel, onState } },
  });

  return {
    check,
    download,
    restart,
    setChannel,
    emit: (state: UpdateState) => act(() => handler?.(state)),
  };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'midniteStudio');
  useUiStore.setState({ updateChannel: 'stable' });
  vi.restoreAllMocks();
});

describe('UpdatePill', () => {
  it('renders nothing with no bridge at all', () => {
    const { container } = render(<UpdatePill />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing while idle', () => {
    const { emit } = stubBridge();
    const { container } = render(<UpdatePill />);
    emit(IDLE);
    expect(container.innerHTML).toBe('');
  });

  // The blind surface Theme G closes: a check that errors used to render
  // nothing at all in the status bar, indistinguishable from success.
  it('shows an error affordance and lets a click retry the check', () => {
    const { emit, check } = stubBridge();
    render(<UpdatePill />);
    emit({ phase: 'error', version: null, percent: null, error: 'HTTP 404' });

    expect(screen.getByTitle('HTTP 404')).toBeDefined();
    expect(screen.getByText('Update check failed')).toBeDefined();

    fireEvent.click(screen.getByText('Update check failed'));
    expect(check).toHaveBeenCalled();
  });

  it('falls back to a generic label when the error carries no message', () => {
    const { emit } = stubBridge();
    render(<UpdatePill />);
    emit({ phase: 'error', version: null, percent: null, error: null });

    expect(screen.getByTitle('Failed to check for updates')).toBeDefined();
  });

  it('shows a checking indicator instead of rendering nothing', () => {
    const { emit } = stubBridge();
    render(<UpdatePill />);
    emit({ phase: 'checking', version: null, percent: null, error: null });

    expect(screen.getByTitle('Checking for updates…')).toBeDefined();
  });

  it('downloads on click while available, restarts on click once downloaded', () => {
    const { emit, download, restart } = stubBridge();
    render(<UpdatePill />);

    emit({ phase: 'available', version: '1.2.3', percent: null, error: null });
    fireEvent.click(screen.getByText('Update v1.2.3 available'));
    expect(download).toHaveBeenCalled();

    emit({ phase: 'downloaded', version: '1.2.3', percent: null, error: null });
    fireEvent.click(screen.getByText('v1.2.3 ready'));
    expect(restart).toHaveBeenCalled();
  });

  /*
   * `update-service.ts` boots every session on the `stable` feed and only
   * learns otherwise from a `updateSetChannel` message — main cannot read
   * the renderer's persisted `ui-store`. This is the one push Theme G's
   * decision (a) calls for: once, on mount, with whatever channel was
   * already rehydrated from `localStorage`.
   */
  it('pushes the persisted channel to main once the bridge exists', () => {
    useUiStore.setState({ updateChannel: 'beta' });
    const { setChannel } = stubBridge();
    render(<UpdatePill />);

    expect(setChannel).toHaveBeenCalledTimes(1);
    expect(setChannel).toHaveBeenCalledWith({ channel: 'beta' });
  });

  it('does not push again on an unrelated re-render', () => {
    const { setChannel, emit } = stubBridge();
    render(<UpdatePill />);
    expect(setChannel).toHaveBeenCalledTimes(1);

    emit({ phase: 'checking', version: null, percent: null, error: null });
    emit(IDLE);
    expect(setChannel).toHaveBeenCalledTimes(1);
  });
});
