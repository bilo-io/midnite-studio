import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_STATUSES } from '@midnite/studio-shared';

import { useActivityPaletteStore } from '../../activity/activity-palette-store';
import { ActivityPage } from './activity-page';

describe('ActivityPage', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = '';
    useActivityPaletteStore.setState({
      activePaletteId: 'brand',
      statusOverrides: {},
      agentStyle: 'gradient',
      shellStyle: 'metallic',
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = '';
  });

  it('renders one row per ActivityStatus', () => {
    render(<ActivityPage />);
    for (const status of ACTIVITY_STATUSES) {
      expect(screen.getByTestId(`activity-status-row-${status}`)).toBeTruthy();
    }
    expect(ACTIVITY_STATUSES).toHaveLength(9);
  });

  it('renders every built-in preset as a pickable option', () => {
    render(<ActivityPage />);
    for (const label of ['Brand', 'Rainbow', 'Ocean', 'Ember', 'Mono']) {
      expect(screen.getByRole('radio', { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it('picking a preset updates the store (and so the synced tokens)', () => {
    render(<ActivityPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Rainbow/ }));
    expect(useActivityPaletteStore.getState().activePaletteId).toBe('rainbow');
  });

  it('editing a status colour sets an override, and Reset restores the preset default', () => {
    render(<ActivityPage />);
    const row = screen.getByTestId('activity-status-row-done');
    const colorInput = row.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeTruthy();

    fireEvent.change(colorInput, { target: { value: '#123456' } });
    expect(useActivityPaletteStore.getState().statusOverrides.done?.color).toEqual({
      kind: 'solid',
      color: '#123456',
    });

    const resetButton = screen.getByTestId('activity-status-reset-done') as HTMLButtonElement;
    expect(resetButton.disabled).toBe(false);
    fireEvent.click(resetButton);
    expect(useActivityPaletteStore.getState().statusOverrides.done).toBeUndefined();
  });

  it('the reset button starts disabled for a status with no override', () => {
    render(<ActivityPage />);
    const resetButton = screen.getByTestId('activity-status-reset-queued') as HTMLButtonElement;
    expect(resetButton.disabled).toBe(true);
  });

  it('agent/shell style pickers write to the store', () => {
    render(<ActivityPage />);
    const agentGroup = screen.getByRole('radiogroup', { name: 'Agent style' });
    fireEvent.click(within(agentGroup).getByRole('radio', { name: 'Metallic' }));
    expect(useActivityPaletteStore.getState().agentStyle).toBe('metallic');

    const shellGroup = screen.getByRole('radiogroup', { name: 'Shell style' });
    fireEvent.click(within(shellGroup).getByRole('radio', { name: 'Match agent' }));
    expect(useActivityPaletteStore.getState().shellStyle).toBe('matchAgent');
  });

  it('the page-level reset restores every field', () => {
    render(<ActivityPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Rainbow/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    const s = useActivityPaletteStore.getState();
    expect(s.activePaletteId).toBe('brand');
    expect(s.statusOverrides).toEqual({});
    expect(s.agentStyle).toBe('gradient');
    expect(s.shellStyle).toBe('metallic');
  });
});
