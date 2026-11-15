// vitest/jsdom: flow logic and copy only, no browser capability needed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fake, addToast } = vi.hoisted(() => ({
  fake: { plan: vi.fn(), freeRam: vi.fn() },
  addToast: vi.fn(),
}));

vi.mock('@midnite/studio-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-frame')>()),
  bridge: () => ({ optimizer: { freeRamPlan: fake.plan, freeRam: fake.freeRam } }),
  useToastStore: { getState: () => ({ addToast }) },
}));

import { confirmLines, resultMessage, runFreeRam, type FreeRamCandidate } from './free-ram';

const GB = 1_000_000_000;
const MB = 1_000_000;

const session: FreeRamCandidate = {
  id: 'session:s1',
  kind: 'previous-build-session',
  label: 'app · previous-build session',
  command: 'claude --resume',
  rssBytes: 2 * GB,
  destructive: true,
};
const broker: FreeRamCandidate = {
  id: 'broker:200',
  kind: 'lost-broker',
  label: 'Terminal broker 200 (unreachable)',
  command: 'node broker.js --socket /u/broker/old.sock',
  rssBytes: 512 * MB,
  destructive: true,
};
const tab: FreeRamCandidate = { id: 'tab:t1', kind: 'hidden-tab', label: 'Docs', command: null, rssBytes: 150 * MB, destructive: false };
const cache: FreeRamCandidate = {
  id: 'cache:renderer',
  kind: 'renderer-cache',
  label: 'Renderer and HTTP caches',
  command: null,
  rssBytes: null,
  destructive: false,
};

const dialogs = () => ({ confirm: vi.fn(), notify: vi.fn() });
const planOf = (candidates: FreeRamCandidate[]) => ({
  ok: true,
  value: { candidates, totalRssBytes: candidates.reduce((s, c) => s + (c.rssBytes ?? 0), 0) },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirm contents', () => {
  it('lists processes with command and RSS, then the also items, then the total held', () => {
    const lines = confirmLines([session, broker, tab, cache], 2 * GB + 512 * MB + 150 * MB);
    expect(lines).toEqual([
      'app · previous-build session — claude --resume · 2.0 GB',
      'Terminal broker 200 (unreachable) — node broker.js --socket /u/broker/old.sock · 512 MB · may hold live sessions',
      'Also: Docs · 150 MB',
      'Also: Renderer and HTTP caches',
      expect.stringMatching(/^≈2\.\d+ GB held$/),
    ]);
  });
});

describe('unreachable brokers', () => {
  it('labels an unreachable broker as possibly holding live sessions', () => {
    expect(confirmLines([broker], 512 * MB)[0]).toContain('may hold live sessions');
    const previous = { ...broker, label: 'Terminal broker 200 (previous build)' };
    expect(confirmLines([previous], 512 * MB)[0]).not.toContain('may hold live sessions');
  });

  it('counts sessions only in the blast radius when only a broker is offered', async () => {
    const d = dialogs();
    fake.plan.mockResolvedValue(planOf([broker, cache]));
    await runFreeRam({ dialogs: d });
    expect(d.confirm.mock.calls[0]?.[0]).toMatchObject({ danger: true, blastRadius: null });
  });
});

describe('result copy', () => {
  it('says the measurement was unavailable', () => {
    const m = { beforeRssBytes: 3 * GB, afterRssBytes: 3 * GB, freedRssBytes: 0, machineFreeDeltaBytes: null };
    expect(resultMessage(m, 0, true)).toBe('Freed RAM · the measurement was unavailable');
  });

  it('reads the measured freed figure and the before and after', () => {
    expect(resultMessage({ beforeRssBytes: 14.2 * GB, afterRssBytes: 2.4 * GB, freedRssBytes: 11.8 * GB, machineFreeDeltaBytes: null }, 0)).toBe(
      'Freed 11.8 GB · Midnite processes 14.2 GB → 2.4 GB',
    );
  });

  it('says zero when nothing was freed, and counts failures', () => {
    const zero = { beforeRssBytes: 3 * GB, afterRssBytes: 3 * GB, freedRssBytes: 0, machineFreeDeltaBytes: 0 };
    expect(resultMessage(zero, 0)).toBe('Nothing to free · Midnite processes 3.0 GB');
    expect(resultMessage(zero, 2)).toContain('2 could not be ended');
  });
});

describe('runFreeRam', () => {
  it('shows one confirm with the blast radius, runs nothing until it is confirmed, then toasts the measured figure', async () => {
    const d = dialogs();
    fake.plan.mockResolvedValue(planOf([session, broker, tab, cache]));
    fake.freeRam.mockResolvedValue({
      ok: true,
      value: {
        ended: ['session:s1'],
        measured: { beforeRssBytes: 14.2 * GB, afterRssBytes: 2.4 * GB, freedRssBytes: 11.8 * GB, machineFreeDeltaBytes: 1 },
        failures: [],
      },
    });

    await runFreeRam({ dialogs: d });
    expect(d.confirm).toHaveBeenCalledTimes(1);
    const request = d.confirm.mock.calls[0]?.[0];
    expect(request).toMatchObject({ title: 'Free RAM?', danger: true, blastRadius: { count: 1, sample: [{ sha: 'session', subject: 'app · previous-build session' }] }, blastRadiusKind: 'sessions' });
    expect(fake.freeRam).not.toHaveBeenCalled();

    request.onConfirm();
    await vi.waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(fake.freeRam).toHaveBeenCalledWith({ candidateIds: ['session:s1', 'broker:200', 'tab:t1', 'cache:renderer'] });
    expect(addToast.mock.calls[0]?.[0]).toEqual({
      message: 'Freed 11.8 GB · Midnite processes 14.2 GB → 2.4 GB',
      status: 'info',
    });
  });

  it('does not mark the confirm dangerous when only tabs and caches are offered', async () => {
    const d = dialogs();
    fake.plan.mockResolvedValue(planOf([tab, cache]));
    await runFreeRam({ dialogs: d });
    expect(d.confirm.mock.calls[0]?.[0]).toMatchObject({ danger: false, blastRadius: null });
  });

  it('says nothing to free, with no confirm, when only the always-offered cache is left', async () => {
    const d = dialogs();
    fake.plan.mockResolvedValue(planOf([cache]));
    await runFreeRam({ dialogs: d });
    expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nothing to free' }));
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('notifies on a plan error envelope and offers no confirm', async () => {
    const d = dialogs();
    fake.plan.mockResolvedValue({ ok: false, message: 'Could not read the process table.' });
    await runFreeRam({ dialogs: d });
    expect(d.notify).toHaveBeenCalledWith({ title: 'Could not plan Free RAM', body: 'Could not read the process table.' });
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('toasts an error when every step failed, and an error envelope from execution', async () => {
    const d = dialogs();
    fake.plan.mockResolvedValue(planOf([broker, cache]));
    fake.freeRam.mockResolvedValueOnce({
      ok: true,
      value: {
        ended: [],
        measured: { beforeRssBytes: GB, afterRssBytes: GB, freedRssBytes: 0, machineFreeDeltaBytes: null },
        failures: [{ id: 'broker:200', message: 'protected' }],
      },
    });
    await runFreeRam({ dialogs: d });
    d.confirm.mock.calls[0]?.[0].onConfirm();
    await vi.waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    expect(addToast.mock.calls[0]?.[0]).toMatchObject({ status: 'error', message: expect.stringContaining('Nothing to free') });

    fake.freeRam.mockResolvedValueOnce({ ok: false, message: 'boom' });
    await runFreeRam({ dialogs: d });
    d.confirm.mock.calls[1]?.[0].onConfirm();
    await vi.waitFor(() => expect(addToast).toHaveBeenCalledTimes(2));
    expect(addToast.mock.calls[1]?.[0]).toEqual({ message: 'boom', status: 'error' });
  });
});
