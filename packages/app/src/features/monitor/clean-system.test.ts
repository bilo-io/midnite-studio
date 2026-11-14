import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runCleanSystem } = vi.hoisted(() => ({ runCleanSystem: vi.fn(async () => undefined) }));
vi.mock('@midnite/studio-feature-optimizer/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-feature-optimizer/renderer')>()),
  runCleanSystem,
}));

import { runCleanSystemFromWidget, runCleanSystemWith } from './clean-system';
import { useFullRecoveryStore } from './full-recovery';

beforeEach(() => {
  runCleanSystem.mockClear();
  useFullRecoveryStore.getState().setDialogs(null);
});

describe('Clean system host wiring', () => {
  it('the widget does nothing before the dialog host has lent its dialogs', () => {
    runCleanSystemFromWidget();
    expect(runCleanSystem).not.toHaveBeenCalled();
  });

  it('the widget runs the flow with the host dialogs and Studio’s optimizer settings', () => {
    const dialogs = { confirm: vi.fn(), notify: vi.fn() };
    useFullRecoveryStore.getState().setDialogs(dialogs);
    runCleanSystemFromWidget();
    expect(runCleanSystem).toHaveBeenCalledTimes(1);
    const deps = (runCleanSystem.mock.calls[0] as unknown as [{ dialogs: unknown; getSettings: () => { optimizerEnabled: boolean } }])[0];
    expect(deps.dialogs).toBe(dialogs);
    expect(typeof deps.getSettings().optimizerEnabled).toBe('boolean');
  });

  it('a failure becomes a notify, never a rejection', async () => {
    runCleanSystem.mockRejectedValueOnce(new Error('boom'));
    const dialogs = { confirm: vi.fn(), notify: vi.fn() };
    runCleanSystemWith(dialogs);
    await vi.waitFor(() => expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ body: 'boom' })));
  });
});
