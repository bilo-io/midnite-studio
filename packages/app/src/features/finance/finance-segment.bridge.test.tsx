import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { FinanceSegment } from './finance-segment';
import { useFinanceStore } from './finance-store';

beforeEach(() => {
  useFinanceStore.setState({ assets: [], twelveDataKeyConfigured: false, secretsHydrated: true });
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('renderer fetch should not run — finance is proxied through main');
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the finance footer, assembled through a real render', () => {
  it('shows a neutral trigger with an empty watchlist, opens the editor on click', () => {
    renderView(<FinanceSegment />, { fixtures });

    const trigger = screen.getByTestId('finance-segment');
    expect(trigger.textContent).toContain('Finance');

    fireEvent.click(trigger);
    expect(screen.getByTestId('finance-segment-panel')).toBeTruthy();
  });

  it('reflects a coin added through the panel back onto the trigger', async () => {
    renderView(<FinanceSegment />, { fixtures });

    const bridge = window.midniteStudio!;
    vi.spyOn(bridge.finance, 'search').mockResolvedValue({
      ok: true,
      value: [{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
    });
    vi.spyOn(bridge.finance, 'quote').mockResolvedValue({
      ok: true,
      value: { price: 50000, currency: 'USD' },
    });
    vi.spyOn(bridge.finance, 'history').mockResolvedValue({
      ok: true,
      value: [
        { t: 1_700_000_000_000, c: 45000 },
        { t: 1_700_600_000_000, c: 50000 },
      ],
    });

    fireEvent.click(screen.getByTestId('finance-segment'));
    const panel = screen.getByTestId('finance-segment-panel');
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit watchlist' }));

    const input = within(panel).getByPlaceholderText('Search coins…');
    fireEvent.change(input, { target: { value: 'bit' } });

    await waitFor(() => {
      expect(within(panel).getByText('Bitcoin (BTC)')).toBeTruthy();
    });
    fireEvent.click(within(panel).getByText('Bitcoin (BTC)'));

    await waitFor(() => {
      expect(screen.getByTestId('finance-segment').textContent).toMatch(/Bitcoin|BTC|50,?000/i);
    });
  });
});
