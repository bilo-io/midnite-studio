import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';
import type { HealthMonthLog } from '@midnite/studio-shared';

import { HEALTH_CHROME } from '../compose/health-chrome';
import { monthsKey, useMonths, usePutDay, type MonthsData } from './use-health';

const day = { weightKg: 81.3, meals: [], sessions: [] };
const month: HealthMonthLog = { version: 1, id: 'log-2026-11', updatedAt: '2026-11-01T00:00:00.000Z', days: {} };
const getMonths = vi.fn();
const putDay = vi.fn();

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={HEALTH_CHROME}>{children}</FrameChromeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  getMonths.mockReset().mockResolvedValue({ ok: true, value: { months: [month], quarantined: 0 } });
  putDay.mockReset();
  window.midniteStudio = { health: { getMonths, putDay } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

async function seeded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hooks = renderHook(() => ({ months: useMonths('2026-11', '2026-11'), put: usePutDay() }), { wrapper: wrapper(client) });
  await waitFor(() => expect(hooks.result.current.months.data?.months).toHaveLength(1));
  return { client, hooks };
}

describe('usePutDay', () => {
  it('shows the day at once and keeps it after a successful save', async () => {
    let resolve!: (v: unknown) => void;
    putDay.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client, hooks } = await seeded();
    act(() => hooks.result.current.put.mutate({ date: '2026-11-11', day }));
    await waitFor(() => expect(client.getQueryData<MonthsData>(monthsKey('2026-11', '2026-11'))?.months[0]?.days['2026-11-11']?.weightKg).toBe(81.3));
    resolve({ ok: true, value: { updatedAt: '2026-11-11T10:00:00.000Z' } });
    await waitFor(() => expect(hooks.result.current.put.isSuccess).toBe(true));
  });

  it('rolls back on { ok: false }', async () => {
    putDay.mockResolvedValue({ ok: false, kind: 'error', message: 'disk full' });
    const { client, hooks } = await seeded();
    // Keep the refetch from restoring the cache: the rollback itself is what is asserted.
    getMonths.mockImplementation(() => new Promise(() => undefined));
    act(() => hooks.result.current.put.mutate({ date: '2026-11-11', day }));
    await waitFor(() => expect(hooks.result.current.put.isError).toBe(true));
    expect(client.getQueryData<MonthsData>(monthsKey('2026-11', '2026-11'))?.months[0]?.days).toEqual({});
  });
});

describe('useMonths', () => {
  it('errors when the bridge answers { ok: false }', async () => {
    getMonths.mockResolvedValue({ ok: false, kind: 'error', message: 'boom' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMonths('2026-11', '2026-11'), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
