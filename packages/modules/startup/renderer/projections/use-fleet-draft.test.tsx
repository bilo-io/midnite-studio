// vitest/jsdom, fake timers: the 400 ms debounced save and the draft-wins-while-dirty rule.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FleetProjection } from '@midnite/studio-shared';

import { fleetProjection } from './test-fixtures';
import { useFleetDraft } from './use-fleet-draft';

const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const SOURCE = fleetProjection();
let upsert: ReturnType<typeof vi.fn>;
let release: (() => void) | null;

beforeEach(() => {
  vi.useFakeTimers();
  release = null;
  upsert = vi.fn(() => new Promise((resolve) => (release = () => resolve({ ok: true, value: {} }))));
  window.midniteStudio = { startup: { upsertFleetProjection: upsert, onChanged: () => () => undefined } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.midniteStudio = undefined;
});

const scale = (n: number) => (p: FleetProjection) => ({ ...p, globals: { ...p.globals, scalePct: n } });

describe('useFleetDraft', () => {
  it('five updates within 400 ms save once, 400 ms after the last', async () => {
    const { result } = renderHook(() => useFleetDraft(SOURCE, false), { wrapper });
    for (const n of [110, 120, 130, 140, 150]) {
      act(() => result.current.update(scale(n)));
      act(() => void vi.advanceTimersByTime(100));
    }
    expect(upsert).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0] as unknown as [{ projection: FleetProjection }])[0].projection.globals.scalePct).toBe(150);
  });

  it('a newer source does not replace the draft while a save is pending, and does once it has resolved', async () => {
    const first = SOURCE;
    const { result, rerender } = renderHook(({ s }) => useFleetDraft(s, false), { wrapper, initialProps: { s: first } });
    act(() => result.current.update(scale(200)));
    const newer = { ...first, name: 'Renamed', updatedAt: '2027-01-01T00:00:00.000Z' };
    rerender({ s: newer });
    expect(result.current.draft?.name).not.toBe('Renamed');
    expect(result.current.draft?.globals.scalePct).toBe(200);
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(result.current.pending).toBe(true);
    await act(async () => release?.());
    rerender({ s: { ...newer } });
    expect(result.current.draft?.name).toBe('Renamed');
  });

  it('flushes a pending save on unmount', async () => {
    const { result, unmount } = renderHook(() => useFleetDraft(SOURCE, false), { wrapper });
    act(() => result.current.update(scale(300)));
    expect(upsert).not.toHaveBeenCalled();
    unmount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('never mutates the previous draft', () => {
    const { result } = renderHook(() => useFleetDraft(SOURCE, false), { wrapper });
    const before = result.current.draft!;
    const nodes = before.nodes;
    act(() => result.current.update(scale(250)));
    expect(before.nodes).toBe(nodes);
    expect(before.globals.scalePct).toBe(100);
    expect(result.current.draft).not.toBe(before);
  });

  it('read-only: update is a no-op and nothing saves', async () => {
    const { result } = renderHook(() => useFleetDraft(SOURCE, true), { wrapper });
    act(() => result.current.update(scale(250)));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(upsert).not.toHaveBeenCalled();
    expect(result.current.draft?.globals.scalePct).toBe(100);
  });
});
