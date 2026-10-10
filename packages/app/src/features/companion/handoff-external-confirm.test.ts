import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PendingAction } from '../../store/companion-store';
import { resetHandoffState, submitInput } from './handoff';
import { fakeHandoffDeps, fakeStore } from './test-doubles';

/**
 * Phase 109 Theme D — a pending yes that is not a palette command: an agent's
 * confirm-tier `companion_settings_set`, waiting on the same "yes" / Return /
 * Run chip a `confirm`-tier command uses. `resolvePending` asks the waiting
 * party *before* it clears the slot, so a yes cannot be mistaken for a
 * dismissal, and speaks whatever sentence comes back.
 */

afterEach(() => resetHandoffState());

function slotHolding(pending: PendingAction | null) {
  let current = pending;
  return {
    pendingAction: () => current,
    setPendingAction: (action: PendingAction | null) => {
      current = action;
    },
  };
}

describe('a pending yes with its own onConfirm', () => {
  it('a spoken "yes" calls it while the slot still holds it, then clears, then says nothing for null', async () => {
    const store = fakeStore();
    let seenWhileAsked: PendingAction | null = null;
    const slot = slotHolding(null);
    const pending: PendingAction = {
      label: 'Let your agent set what you call it to Nova',
      at: Date.now(),
      onConfirm: vi.fn(() => {
        seenWhileAsked = slot.pendingAction();
        return null;
      }),
    };
    slot.setPendingAction(pending);

    await submitInput('yes', fakeHandoffDeps({ store, ...slot }));

    expect(pending.onConfirm).toHaveBeenCalledTimes(1);
    expect(seenWhileAsked).toBe(pending);
    expect(slot.pendingAction()).toBeNull();
    expect(store.lines()).toEqual(['user: yes']);
  });

  it('speaks the sentence it returns — the "too late" path', async () => {
    const store = fakeStore();
    const slot = slotHolding({
      label: 'Let your agent set the microphone button to tap to toggle',
      at: Date.now(),
      onConfirm: () => 'Too late — ask your agent again.',
    });

    await submitInput('confirm', fakeHandoffDeps({ store, ...slot }));

    expect(store.lines().at(-1)).toBe('companion: Too late — ask your agent again.');
    expect(slot.pendingAction()).toBeNull();
  });

  it('"never mind" clears it without calling it', async () => {
    const store = fakeStore();
    const onConfirm = vi.fn(() => null);
    const slot = slotHolding({ label: 'x', at: Date.now(), onConfirm });

    await submitInput('never mind', fakeHandoffDeps({ store, ...slot }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(slot.pendingAction()).toBeNull();
    expect(store.lines().at(-1)).toBe('companion: Left it.');
  });
});
