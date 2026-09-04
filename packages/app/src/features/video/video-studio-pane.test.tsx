import type { MidniteStudioBridge, VideoStudioStatus, VideoToolchain } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { VideoStudioPane } from './video-studio-pane';

/** jsdom has no `ResizeObserver` — `useBrowserBounds`'s own polyfill precedent. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

const FOUND_TOOLCHAIN: VideoToolchain = {
  node: { found: true, path: '/usr/bin/node' },
  npx: { found: true, path: '/usr/bin/npx' },
};

function installBridge(status: VideoStudioStatus, toolchain: VideoToolchain = FOUND_TOOLCHAIN) {
  const start = vi.fn().mockResolvedValue({ ok: true, value: status });
  const stop = vi.fn().mockResolvedValue({ ok: true });
  const statusFn = vi.fn().mockResolvedValue({ status });
  const create = vi.fn().mockResolvedValue({ ok: true });
  const close = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    video: {
      studio: { start, stop, status: statusFn },
      toolchain: vi.fn().mockResolvedValue({ toolchain }),
      onStudioChanged: vi.fn(() => () => {}),
      onRenderProgress: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['video'],
    browser: { create, close, setBounds: vi.fn(), setVisible: vi.fn() } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { start, stop, create, close };
}

function renderPane(projectId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <VideoStudioPane projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe('VideoStudioPane', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows a select-a-project state with no project selected', () => {
    renderPane(null);
    expect(screen.getByText('Select a project')).toBeDefined();
  });

  it('shows the no-toolchain state when node/npx are missing', async () => {
    installBridge({ state: 'stopped' }, { node: { found: false, reason: 'node was not found on PATH.' }, npx: FOUND_TOOLCHAIN.npx });
    renderPane('p1');
    expect(await screen.findByText('node/npx not found')).toBeDefined();
    expect(await screen.findByText('node was not found on PATH.')).toBeDefined();
  });

  it('shows a Start button when stopped, and starts the studio on click', async () => {
    const { start } = installBridge({ state: 'stopped' });
    renderPane('p1');

    fireEvent.click(await screen.findByRole('button', { name: /Start studio/ }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ projectId: 'p1' }));
  });

  it('shows a starting spinner', async () => {
    installBridge({ state: 'starting' });
    renderPane('p1');
    expect(await screen.findByText('Starting the studio…')).toBeDefined();
  });

  it('hosts the studio tab once running, and closes it on unmount', async () => {
    const { create, close } = installBridge({ state: 'running', url: 'http://localhost:3001' });
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <VideoStudioPane projectId="p1" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ tabId: 'video-studio-p1', url: 'http://localhost:3001' }),
    );
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeDefined();

    unmount();
    expect(close).toHaveBeenCalledWith({ tabId: 'video-studio-p1' });
  });

  it('shows the failure state with stderr, and a retry button', async () => {
    installBridge({ state: 'failed', stderr: ['Error: something broke'] });
    renderPane('p1');

    expect(await screen.findByText('The studio failed to start')).toBeDefined();
    expect(await screen.findByText('Error: something broke')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });
});
