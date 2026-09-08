import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useLatestVersion } from './use-latest-version';

const mockFetch = (impl: () => Promise<Response> | Response) => {
  vi.stubGlobal('fetch', vi.fn(impl));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown): Response =>
  ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

describe('useLatestVersion', () => {
  it('reports a published version', async () => {
    mockFetch(() => json({ app: 'midnite-studio', version: '0.3.1' }));
    const { result } = renderHook(() => useLatestVersion());
    await waitFor(() => expect(result.current).toEqual({ status: 'released', version: '0.3.1' }));
  });

  it('treats a null version as unreleased, not as an error', async () => {
    // This is the feed's real state until the first release is cut, and it must
    // not be dressed up as a version number.
    mockFetch(() => json({ app: 'midnite-studio', version: null }));
    const { result } = renderHook(() => useLatestVersion());
    await waitFor(() => expect(result.current).toEqual({ status: 'unreleased' }));
  });

  it('reports unavailable when the feed cannot be reached', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => useLatestVersion());
    await waitFor(() => expect(result.current).toEqual({ status: 'unavailable' }));
  });

  it('reports unavailable on a non-2xx response', async () => {
    mockFetch(() => ({ ok: false, status: 404 }) as unknown as Response);
    const { result } = renderHook(() => useLatestVersion());
    await waitFor(() => expect(result.current).toEqual({ status: 'unavailable' }));
  });
});
