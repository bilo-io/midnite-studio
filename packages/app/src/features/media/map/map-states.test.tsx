import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isMapOffline, MapErrorChip, MapLoadingBar, MapOfflinePanel } from './map-states';
import { mapStatusStore } from './use-map-status';

afterEach(() => {
  cleanup();
  mapStatusStore.reset();
});

describe('map states', () => {
  it('loading shows a progress bar and idle does not', () => {
    const { rerender } = render(<MapLoadingBar status={{ loading: true }} />);
    expect(screen.getByRole('progressbar', { name: 'Loading map tiles' })).toBeTruthy();
    rerender(<MapLoadingBar status={{ loading: false }} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('counts tile errors in a chip naming the first failure, and shows nothing at zero', () => {
    const { rerender } = render(<MapErrorChip status={{ failed: 0, firstError: null }} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<MapErrorChip status={{ failed: 3, firstError: { source: 'openfreemap', status: '503' } }} />);
    expect(screen.getByRole('status').textContent).toBe('3 tiles failed');
    rerender(<MapErrorChip status={{ failed: 1, firstError: null }} />);
    expect(screen.getByRole('status').textContent).toBe('1 tile failed');
  });

  it('offline is navigator.onLine false or a style that failed to load', () => {
    expect(isMapOffline({ online: false, styleFailed: false })).toBe(true);
    expect(isMapOffline({ online: true, styleFailed: true })).toBe(true);
    expect(isMapOffline({ online: true, styleFailed: false })).toBe(false);
  });

  it('the offline panel explains itself and Retry calls back', () => {
    const onRetry = vi.fn();
    render(<MapOfflinePanel onRetry={onRetry} />);
    expect(screen.getByText('Map tiles need a network connection.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
