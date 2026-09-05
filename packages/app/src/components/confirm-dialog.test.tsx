import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog, type ConfirmRequest } from './confirm-dialog';

/**
 * `requireAck` (Phase 74 Theme C) — the first friction beyond a plain button
 * click this dialog has ever had, reserved for emptying the Trash. Net-new
 * coverage: the component ships untested before this phase.
 */
describe('ConfirmDialog requireAck', () => {
  afterEach(cleanup);

  const baseRequest: ConfirmRequest = {
    title: 'Empty the Trash?',
    confirmLabel: 'Empty Trash',
    onConfirm: vi.fn(),
  };

  it('every existing caller is unaffected: Confirm is enabled with no requireAck', () => {
    render(<ConfirmDialog request={baseRequest} onCancel={() => {}} />);
    const confirmButton = screen.getByRole('button', { name: 'Empty Trash' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('disables Confirm until the acknowledgment checkbox is checked', () => {
    render(
      <ConfirmDialog
        request={{ ...baseRequest, requireAck: 'I understand this cannot be undone' }}
        onCancel={() => {}}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Empty Trash' }) as HTMLButtonElement;
    const checkbox = screen.getByRole('checkbox', {
      name: 'I understand this cannot be undone',
    }) as HTMLInputElement;

    expect(confirmButton.disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(confirmButton.disabled).toBe(false);
  });

  it('a setBlastRadius-style patch (new props, same mounted instance) does not clear the checkbox', () => {
    const { rerender } = render(
      <ConfirmDialog
        request={{ ...baseRequest, requireAck: 'I understand', blastRadius: undefined }}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }));
    expect((screen.getByRole('button', { name: 'Empty Trash' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    // Simulates `dialog-host.tsx`'s `setBlastRadius` patching the open request
    // in place — same component instance (no new `key`), only new props.
    rerender(
      <ConfirmDialog
        request={{
          ...baseRequest,
          requireAck: 'I understand',
          blastRadius: { count: 3, sample: [] },
          blastRadiusKind: 'trash',
        }}
        onCancel={() => {}}
      />,
    );

    expect((screen.getByRole('checkbox', { name: 'I understand' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Empty Trash' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('the trash BLAST_RADIUS_COPY arm reads "permanently deleted"', () => {
    render(
      <ConfirmDialog
        request={{
          ...baseRequest,
          blastRadiusKind: 'trash',
          blastRadius: { count: 5, sample: [] },
        }}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText(/5 items/)).not.toBeNull();
    expect(screen.getByText(/permanently deleted — this cannot be undone/)).not.toBeNull();
  });
});
