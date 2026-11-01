// vitest/jsdom: `useSfx` state transitions over a fake bridge — progress events, whose run is whose, cleanup.
import { SFX_LICENCE_SHA256, type GitOpResult, type SfxGenerateResult, type SfxProgressEvent } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSfx } from './use-sfx';

const listeners = new Set<(event: SfxProgressEvent) => void>();
let resolveGenerate: ((result: GitOpResult<SfxGenerateResult>) => void) | null = null;
const sfx = {
  status: vi.fn(async () => ({
    ok: true as const,
    value: { state: 'installed' as const, consent: { licenceSha256: SFX_LICENCE_SHA256, acceptedAt: 'now', revenueAcknowledged: true as const }, bytesOnDisk: 1, totalBytes: 1 },
  })),
  generate: vi.fn(() => new Promise<GitOpResult<SfxGenerateResult>>((resolve) => (resolveGenerate = resolve))),
  cancelGenerate: vi.fn(async () => ({ ok: true as const, value: undefined })),
  onProgress: vi.fn((listener: (event: SfxProgressEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }),
};

vi.mock('@midnite/studio-frame', () => ({
  bridge: () => ({ media: { sfx } }),
  noBridge: () => ({ ok: false, kind: 'error', message: 'no bridge' }),
  reportFailure: vi.fn(),
  useMediaKit: () => ({ keys: { tab: (repoId: string, tab: string) => ['media', repoId, tab], projects: (repoId: string, tab: string) => ['projects', repoId, tab] } }),
}));

const emit = (event: SfxProgressEvent) => act(() => listeners.forEach((l) => l(event)));
const running = (generationId: string, repoId = 'r1'): SfxProgressEvent => ({ kind: 'generate', generationId, repoId, project: 'p', status: 'running', stage: 'sampling', fraction: 0.5 });

function setup(repoId = 'r1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useSfx(repoId), { wrapper }), invalidate };
}

beforeEach(() => {
  listeners.clear();
  resolveGenerate = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useSfx', () => {
  it('follows its own run from start to finish, then clears it', async () => {
    const { result } = setup();
    act(() => result.current.generate.mutate({ project: 'p', prompt: 'zap' }));
    await waitFor(() => expect(sfx.generate).toHaveBeenCalled());
    const ownId = (sfx.generate.mock.calls[0] as unknown as [{ generationId: string }])[0].generationId;
    emit(running(ownId));
    expect(result.current.running).toMatchObject({ generationId: ownId, stage: 'sampling', fraction: 0.5 });
    expect(result.current.busy).toBe(false);
    await act(async () => resolveGenerate!({ ok: true, value: { takes: [], elapsedMs: 1 } }));
    await waitFor(() => expect(result.current.running).toBeNull());
  });

  it('treats a run it did not start — any repo — as the engine being busy, never as its own', () => {
    const { result } = setup();
    emit(running('elsewhere', 'r2'));
    expect(result.current.running).toBeNull();
    expect(result.current.busy).toBe(true);
    emit(running('agent', 'r1'));
    for (const status of ['succeeded', 'failed', 'cancelled'] as const) {
      emit({ kind: 'generate', generationId: 'agent', repoId: 'r1', project: 'p', status });
      expect(result.current.busy).toBe(true); // `elsewhere` is still going
      emit(running('agent', 'r1'));
    }
    emit({ kind: 'generate', generationId: 'agent', repoId: 'r1', project: 'p', status: 'cancelled' });
    emit({ kind: 'generate', generationId: 'elsewhere', repoId: 'r2', project: 'p', status: 'succeeded' });
    expect(result.current.busy).toBe(false);
  });

  it('refreshes the takes when another run in this repo writes files, not for another repo', () => {
    const { invalidate } = setup();
    emit({ kind: 'generate', generationId: 'x', repoId: 'r2', project: 'p', status: 'succeeded', files: ['a.wav'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['media', 'r2', 'sfx'] });
    emit({ kind: 'generate', generationId: 'y', repoId: 'r1', project: 'p', status: 'succeeded', files: ['b.wav'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['media', 'r1', 'sfx'] });
  });

  it('removes its progress listener on unmount', () => {
    const { unmount } = setup();
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
