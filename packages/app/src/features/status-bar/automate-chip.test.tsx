import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { AutomateChip } from './automate-chip';

describe('AutomateChip (Phase 95 Theme H)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    useUiStore.setState({ automateEnabledByProject: {}, activeView: 'graph' });
  });

  it('renders nothing while no board has Auto-mate on', () => {
    render(<AutomateChip />);
    expect(screen.queryByTestId('status-segment-automate')).toBeNull();
  });

  it('shows one chip per project board with Auto-mate on', () => {
    useUiStore.setState({
      automateEnabledByProject: { 'PVT_kwABCDEF': true, 'PVT_kwGHIJKL': false, 'PVT_kwMNOPQR': true },
    });
    render(<AutomateChip />);
    expect(screen.getByText(/ABCDEF/)).not.toBeNull();
    expect(screen.getByText(/MNOPQR/)).not.toBeNull();
    expect(screen.queryByText(/GHIJKL/)).toBeNull();
  });

  it('collapses past three running boards into a "+N more" tail', () => {
    useUiStore.setState({
      automateEnabledByProject: { a: true, b: true, c: true, d: true, e: true },
    });
    render(<AutomateChip />);
    expect(screen.getByText('+2 more')).not.toBeNull();
  });

  it('clicking navigates to the Projects view', () => {
    useUiStore.setState({ automateEnabledByProject: { PVT_1: true } });
    render(<AutomateChip />);
    fireEvent.click(screen.getByTestId('status-segment-automate'));
    expect(useUiStore.getState().activeView).toBe('projects');
  });
});
