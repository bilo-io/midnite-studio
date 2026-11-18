import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runFreeRam } = vi.hoisted(() => ({ runFreeRam: vi.fn(async () => undefined) }));
vi.mock('@midnite/studio-feature-optimizer/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-feature-optimizer/renderer')>()),
  runFreeRam,
}));

import { runFreeRamFromWidget, runFreeRamWith } from './free-ram';
import { useFullRecoveryStore } from './full-recovery';

beforeEach(() => {
  runFreeRam.mockReset();
  runFreeRam.mockResolvedValue(undefined);
  useFullRecoveryStore.getState().setDialogs(null);
});

describe('Free RAM host wiring', () => {
  it('the widget does nothing before the dialog host has lent its dialogs', () => {
    runFreeRamFromWidget();
    expect(runFreeRam).not.toHaveBeenCalled();
  });

  it('the widget runs the flow with the host dialogs', () => {
    const dialogs = { confirm: vi.fn(), notify: vi.fn() };
    useFullRecoveryStore.getState().setDialogs(dialogs);
    runFreeRamFromWidget();
    expect(runFreeRam).toHaveBeenCalledWith({ dialogs });
  });

  it('a flow that rejects becomes a notify, never an unhandled rejection', async () => {
    const dialogs = { confirm: vi.fn(), notify: vi.fn() };
    runFreeRam.mockRejectedValue(new Error('boom'));
    runFreeRamWith(dialogs);
    await vi.waitFor(() => expect(dialogs.notify).toHaveBeenCalledWith({ title: 'Could not free RAM', body: 'boom' }));
  });
});
