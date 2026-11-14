// vitest/jsdom: flow logic only, no browser capability needed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fake, addToast } = vi.hoisted(() => ({
  fake: {
    plan: { entries: [] as { name: string; kind: string; bytes: number }[], totalBytes: 0 },
    sweep: vi.fn(),
  },
  addToast: vi.fn(),
}));

vi.mock('@midnite/studio-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-frame')>()),
  bridge: () => ({
    optimizer: {
      brokerSweepPlan: async () => ({ ok: true, value: fake.plan }),
      brokerSweep: fake.sweep,
    },
  }),
  useToastStore: { getState: () => ({ addToast }) },
}));

const { runSystemScan, runSystemClean, loadSystemCatalogue } = vi.hoisted(() => ({
  runSystemScan: vi.fn(async () => undefined),
  runSystemClean: vi.fn(),
  loadSystemCatalogue: vi.fn(async () => undefined),
}));
vi.mock('./use-optimizer', () => ({ runSystemScan, runSystemClean, loadSystemCatalogue }));

import { brokerLeftoversLine, confirmWarnings, runCleanSystem } from './clean-system';
import type { OptimizerSettingsState } from './host';
import { useOptimizerStore } from './optimizer-store';

const MB = 1024 * 1024;

const settings = (over: Partial<OptimizerSettingsState> = {}): OptimizerSettingsState =>
  ({
    optimizerEnabled: true,
    allowSystemCacheClean: true,
    systemCacheConsentGiven: true,
    setAllowSystemCacheClean: vi.fn(),
    setSystemCacheConsentGiven: vi.fn(),
    ...over,
  }) as unknown as OptimizerSettingsState;

const scanWith = (items: { entryId: string; label: string; bytes: number }[]): void => {
  useOptimizerStore.setState({
    systemScan: {
      state: 'done',
      progress: 100,
      message: null,
      result: {
        totalBytes: items.reduce((s, i) => s + i.bytes, 0),
        approximate: false,
        byEcosystem: {},
        items: items.map((i) => ({ ...i, path: `/x/${i.entryId}`, approximate: false, ecosystem: 'rust', reclaim: 'rebuild', producer: 'cargo' })),
      },
    } as never,
  });
};

const dialogs = () => ({ confirm: vi.fn(), notify: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  fake.plan = { entries: [], totalBytes: 0 };
});

describe('confirm contents', () => {
  it('lists each cache with its size, the broker line and the total', () => {
    const lines = confirmWarnings(
      [{ label: 'Cargo registry', bytes: 2 * MB, approximate: false }, { label: 'Gradle', bytes: MB, approximate: true }],
      { names: ['a', 'b', 'c'], bytes: MB },
    );
    expect(lines[0]).toBe('Cargo registry — 2 MB');
    expect(lines[1]).toBe('Gradle — at least 1 MB');
    expect(lines[2]).toBe('Broker leftovers (3 files · 1 MB) will be deleted for good, not moved to the Trash.');
    expect(lines[3]).toBe('Total: 4 MB');
  });

  it('has no broker line when there are no leftovers', () => {
    expect(brokerLeftoversLine({ names: [], bytes: 0 })).toBeNull();
    expect(brokerLeftoversLine({ names: ['a'], bytes: 10 })).toContain('(1 file ·');
  });
});

describe('runCleanSystem', () => {
  it('opens the Optimizer instead when it is switched off', async () => {
    const d = dialogs();
    const openOptimizer = vi.fn();
    await runCleanSystem({ dialogs: d, getSettings: () => settings({ optimizerEnabled: false }), openOptimizer });
    expect(openOptimizer).toHaveBeenCalled();
    expect(runSystemScan).not.toHaveBeenCalled();
  });

  it('asks for consent first, scanning nothing, and carries on once it is given', async () => {
    const d = dialogs();
    const s = settings({ systemCacheConsentGiven: false, allowSystemCacheClean: false });
    useOptimizerStore.setState({ systemCatalogue: [{ entryId: 'c', label: 'Cargo', producer: 'p', ecosystem: 'rust', reclaim: 'rebuild' }] as never });
    scanWith([]);
    await runCleanSystem({ dialogs: d, getSettings: () => s, openOptimizer: vi.fn() });
    expect(d.confirm).toHaveBeenCalledTimes(1);
    expect(d.confirm.mock.calls[0]?.[0]).toMatchObject({ title: expect.stringContaining('clean caches'), warnings: ['Cargo'] });
    expect(runSystemScan).not.toHaveBeenCalled();

    // Confirming records both flags, then the same action runs (consent now true).
    (s as { systemCacheConsentGiven: boolean }).systemCacheConsentGiven = true;
    (s as { allowSystemCacheClean: boolean }).allowSystemCacheClean = true;
    d.confirm.mock.calls[0]?.[0].onConfirm();
    expect(s.setAllowSystemCacheClean).toHaveBeenCalledWith(true);
    expect(s.setSystemCacheConsentGiven).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(runSystemScan).toHaveBeenCalled());
  });

  it('says so when there is nothing to clean', async () => {
    const d = dialogs();
    scanWith([]);
    await runCleanSystem({ dialogs: d, getSettings: () => settings(), openOptimizer: vi.fn() });
    expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nothing to clean' }));
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('shows one confirm, then cleans caches and sweeps the broker files and reports the bytes', async () => {
    const d = dialogs();
    scanWith([{ entryId: 'cargo', label: 'Cargo registry', bytes: 2 * MB }]);
    fake.plan = { entries: [{ name: '0.1.0-a.sock.pid', kind: 'pid', bytes: 4 }, { name: '0.1.0.log', kind: 'log', bytes: MB }], totalBytes: MB + 4 };
    runSystemClean.mockResolvedValue({ freedBytes: 2 * MB, skipped: [] });
    fake.sweep.mockResolvedValue({ ok: true, value: { removed: 2, freedBytes: MB + 4, skipped: [] } });

    await runCleanSystem({ dialogs: d, getSettings: () => settings(), openOptimizer: vi.fn() });
    expect(d.confirm).toHaveBeenCalledTimes(1);
    const request = d.confirm.mock.calls[0]?.[0];
    expect(request.blastRadius).toEqual({ count: 1, sample: [] });
    expect(request.warnings.join('\n')).toContain('Broker leftovers (2 files');
    expect(fake.sweep).not.toHaveBeenCalled();

    request.onConfirm();
    await vi.waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(runSystemClean).toHaveBeenCalledWith(['cargo']);
    expect(fake.sweep).toHaveBeenCalledWith({ names: ['0.1.0-a.sock.pid', '0.1.0.log'] });
    expect(addToast.mock.calls[0]?.[0].message).toContain('Reclaimed 3 MB');
  });

  it('cleans broker leftovers alone, without a cache blast radius', async () => {
    const d = dialogs();
    scanWith([]);
    fake.plan = { entries: [{ name: '0.1.0-a.sock.pid', kind: 'pid', bytes: 4 }], totalBytes: 4 };
    fake.sweep.mockResolvedValue({ ok: true, value: { removed: 1, freedBytes: 4, skipped: [] } });
    await runCleanSystem({ dialogs: d, getSettings: () => settings(), openOptimizer: vi.fn() });
    const request = d.confirm.mock.calls[0]?.[0];
    expect(request.blastRadius).toBeNull();
    request.onConfirm();
    await vi.waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(runSystemClean).not.toHaveBeenCalled();
  });
});
