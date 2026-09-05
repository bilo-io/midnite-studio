import type { ReactNode } from 'react';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { useUiStore } from '../../../store/ui-store';
import { TrashSafetyPage } from './trash-safety-page';

function createWrapper() {
  return ({ children }: { children: ReactNode }) => <DialogHost>{children}</DialogHost>;
}

const reset = () => {
  useUiStore.setState({
    allowTrashEmpty: false,
    trashEmptyConsentGiven: false,
  });
};

afterEach(() => {
  cleanup();
  reset();
});

describe('TrashSafetyPage (Phase 74 Theme C/D)', () => {
  it('clicking the unchecked box opens the acknowledgment dialog rather than setting allowTrashEmpty directly', async () => {
    reset();
    render(<TrashSafetyPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow emptying the Trash' }));

    expect(useUiStore.getState().allowTrashEmpty).toBe(false);
    expect(await screen.findByText('Allow emptying the Trash?')).toBeTruthy();
  });

  it('confirming the dialog sets both allowTrashEmpty and trashEmptyConsentGiven', async () => {
    reset();
    render(<TrashSafetyPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow emptying the Trash' }));
    await screen.findByText('Allow emptying the Trash?');
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));

    await waitFor(() => expect(useUiStore.getState().allowTrashEmpty).toBe(true));
    expect(useUiStore.getState().trashEmptyConsentGiven).toBe(true);
  });

  it('cancelling the dialog reverts allowTrashEmpty to false', async () => {
    reset();
    render(<TrashSafetyPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow emptying the Trash' }));
    await screen.findByText('Allow emptying the Trash?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useUiStore.getState().allowTrashEmpty).toBe(false);
    expect(useUiStore.getState().trashEmptyConsentGiven).toBe(false);
  });

  it('unchecking an already-allowed setting is immediate and asks nothing', () => {
    reset();
    useUiStore.setState({ allowTrashEmpty: true, trashEmptyConsentGiven: true });
    render(<TrashSafetyPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow emptying the Trash' }));

    expect(useUiStore.getState().allowTrashEmpty).toBe(false);
    // A fact about what the user was shown, not a live permission.
    expect(useUiStore.getState().trashEmptyConsentGiven).toBe(true);
    expect(screen.queryByText('Allow emptying the Trash?')).toBeNull();
  });

  it('re-checking after consent was already given does not re-ask', () => {
    reset();
    useUiStore.setState({ allowTrashEmpty: false, trashEmptyConsentGiven: true });
    render(<TrashSafetyPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow emptying the Trash' }));

    expect(useUiStore.getState().allowTrashEmpty).toBe(true);
    expect(screen.queryByText('Allow emptying the Trash?')).toBeNull();
  });

  it('the pair survives a simulated reload — both keys are in the persisted partition', () => {
    reset();
    useUiStore.setState({ allowTrashEmpty: true, trashEmptyConsentGiven: true });

    const persistedState = (
      useUiStore.persist.getOptions().partialize as (state: unknown) => Record<string, unknown>
    )(useUiStore.getState());

    expect(persistedState.allowTrashEmpty).toBe(true);
    expect(persistedState.trashEmptyConsentGiven).toBe(true);
  });
});
