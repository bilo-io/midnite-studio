// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyDialog } from './components/privacy-dialog';
import { createMockBridge } from './mock-bridge';

afterEach(cleanup);

describe('PrivacyDialog', () => {
  it('shows the master and both switches, and the master disables the others without changing them', async () => {
    const bridge = createMockBridge(null);
    const set = vi.spyOn(bridge.privacy, 'set');
    render(<PrivacyDialog bridge={bridge} onClose={() => undefined} />);
    const updates = (await screen.findByRole('checkbox', { name: /check for updates at start/i })) as HTMLInputElement;
    const master = screen.getByRole('checkbox', { name: /turn off all automatic network/i });
    expect(updates.checked).toBe(true);
    fireEvent.click(master);
    await waitFor(() =>
      expect(set).toHaveBeenLastCalledWith({ allAutomaticOff: true, switches: { 'launcher-updates': true, 'launcher-catalog': true } }),
    );
    expect(updates.disabled).toBe(true);
    expect(updates.checked).toBe(true);
  });
});
