// vitest/jsdom: tab switching, accordion open/close and thread wiring are DOM roles/text — no real layout.
import type { MidniteStudioBridge, VideoProject } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { VideoEditThread } from './video-edit-thread';
import { VideoProjectDetail } from './video-project-detail';

const PROJECT: VideoProject = {
  valid: true,
  id: 'p1',
  title: 'COP31 showreel',
  composition: 'MyComp',
  source: 'input/original.mp4',
  brief: 'input/BRIEF.md',
  script: 'EDITORIAL_SCRIPT.md',
};

function installBridge() {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    video: {
      project: { get: vi.fn().mockResolvedValue({ project: PROJECT }), list: vi.fn(), create: vi.fn(), remove: vi.fn() },
      studio: { start: vi.fn(), stop: vi.fn(), status: vi.fn() },
      render: { start: vi.fn(), cancel: vi.fn(), list: vi.fn().mockResolvedValue({ renders: [] }) },
      toolchain: vi.fn().mockResolvedValue({ toolchain: { node: { found: true, path: 'n' }, npx: { found: true, path: 'x' } } }),
      files: vi.fn().mockImplementation(({ area }: { area: string }) =>
        Promise.resolve({
          entries:
            area === 'output'
              ? [
                  { name: 'v2.mp4', isDir: false, size: 10, mtimeMs: 2 },
                  { name: 'v1.mp4', isDir: false, size: 10, mtimeMs: 1 },
                ]
              : [],
        }),
      ),
      readFile: vi.fn().mockImplementation(({ relPath }: { relPath: string }) =>
        Promise.resolve({ content: relPath === 'input/BRIEF.md' ? '# The brief' : null }),
      ),
      root: { get: vi.fn().mockResolvedValue({ root: '/videos' }), set: vi.fn(), resolve: vi.fn().mockResolvedValue({ root: '/videos', source: 'global', setupTarget: null }) },
      onStudioChanged: vi.fn(() => () => {}),
      onRenderProgress: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['video'],
    terminal: { save: vi.fn() } as unknown as MidniteStudioBridge['terminal'],
    companion: { ttsCancel: vi.fn() } as unknown as MidniteStudioBridge['companion'],
  } as Partial<MidniteStudioBridge>;
}

const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>
);

describe('Video panel tabs', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useUiStore.setState({ mediaVideoPanelTab: 'brief' });
  });

  it('defaults to Brief with the existing content, and switches tabs', async () => {
    installBridge();
    render(wrap(<VideoProjectDetail projectId="p1" />));
    expect(await screen.findByText('The brief')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Edit', 'Brief', 'Versions']);

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(screen.queryByText('The brief')).toBeNull();
    expect(screen.getByRole('log', { name: 'Video edit thread' })).toBeTruthy();
    expect(useUiStore.getState().mediaVideoPanelTab).toBe('edit');

    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(screen.getByRole('tab', { name: 'Versions' }).getAttribute('aria-selected')).toBe('true');
  });

  it('expands a version to its player, then a nested Brief accordion', async () => {
    installBridge();
    useUiStore.setState({ mediaVideoPanelTab: 'versions' });
    render(wrap(<VideoProjectDetail projectId="p1" />));

    const v2 = await screen.findByRole('button', { name: /v2\.mp4/ });
    expect(document.querySelector('video')).toBeNull();
    fireEvent.click(v2);
    expect(document.querySelector('video')).toBeTruthy();
    expect(screen.queryByText('The brief')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Brief/ }));
    expect(await screen.findByText('The brief')).toBeTruthy();
  });
});

describe('VideoEditThread', () => {
  const props = { projectId: 'p1', title: 'T', cwd: '/x', repoId: 'r', agent: { id: 'claude', command: 'claude' } };

  it('sends a prompt through the handler seam and shows the reply', async () => {
    const handler = vi.fn().mockResolvedValue('On it.');
    render(wrap(<VideoEditThread {...props} handler={handler} />));
    fireEvent.change(screen.getByLabelText('Edit video'), { target: { value: 'trim the intro' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText('On it.')).toBeTruthy();
    expect(screen.getByText('trim the intro')).toBeTruthy();
    await waitFor(() => expect(handler).toHaveBeenCalledWith('trim the intro', expect.objectContaining({ projectId: 'p1' })));
  });
});
