import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VideoFileList } from './video-file-list';

function entry(over: Partial<{ name: string; isDir: boolean; size: number; mtimeMs: number }> = {}) {
  return { name: 'v1-cut.mp4', isDir: false, size: 2048, mtimeMs: Date.parse('2026-09-04T12:00:00Z'), ...over };
}

function installBridge(files: ReturnType<typeof entry>[]) {
  const revealFile = vi.fn().mockResolvedValue({ ok: true });
  const openFile = vi.fn().mockResolvedValue({ ok: true });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    video: {
      files: vi.fn().mockResolvedValue({ entries: files }),
      revealFile,
      openFile,
    } as unknown as MidniteStudioBridge['video'],
  } as Partial<MidniteStudioBridge>;
  return { revealFile, openFile };
}

function renderList(area: 'assets' | 'input' | 'output' = 'output') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <VideoFileList projectId="p1" area={area} emptyLabel="No output files yet." />
    </QueryClientProvider>,
  );
}

describe('VideoFileList', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows the empty label with no files', async () => {
    installBridge([]);
    renderList();
    expect(await screen.findByText('No output files yet.')).toBeDefined();
  });

  it('lists a file with its size and a formatted mtime', async () => {
    installBridge([entry()]);
    renderList();

    expect(await screen.findByText('v1-cut.mp4')).toBeDefined();
    expect(screen.getByText('2.0 KB')).toBeDefined();
  });

  it('clicking Reveal calls video.revealFile with the exact area/name', async () => {
    const { revealFile } = installBridge([entry()]);
    renderList('output');
    await screen.findByText('v1-cut.mp4');

    fireEvent.click(screen.getByLabelText('Reveal v1-cut.mp4 in Finder'));
    expect(revealFile).toHaveBeenCalledWith({ projectId: 'p1', area: 'output', name: 'v1-cut.mp4' });
  });

  it('offers Play only for files in the output area', async () => {
    const { openFile } = installBridge([entry()]);
    renderList('output');
    await screen.findByText('v1-cut.mp4');

    fireEvent.click(screen.getByLabelText('Play v1-cut.mp4'));
    expect(openFile).toHaveBeenCalledWith({ projectId: 'p1', area: 'output', name: 'v1-cut.mp4' });
  });

  it('offers no Play button for assets or input — only reveal', async () => {
    installBridge([entry({ name: 'logo.png' })]);
    renderList('assets');
    await screen.findByText('logo.png');

    expect(screen.queryByLabelText('Play logo.png')).toBeNull();
    expect(screen.getByLabelText('Reveal logo.png in Finder')).toBeDefined();
  });

  it('offers no Play button for a directory even inside output', async () => {
    installBridge([entry({ name: 'takes', isDir: true })]);
    renderList('output');
    await screen.findByText('takes');

    expect(screen.queryByLabelText('Play takes')).toBeNull();
  });
});
