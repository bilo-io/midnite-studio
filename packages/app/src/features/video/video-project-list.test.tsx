import type { MidniteStudioBridge, VideoProject } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { VideoProjectList } from './video-project-list';

function project(over: Partial<VideoProject> = {}): VideoProject {
  return {
    valid: true,
    id: 'p1',
    title: 'COP31 showreel',
    composition: 'MyComp',
    source: 'input/original.mp4',
    brief: 'input/BRIEF.md',
    script: 'EDITORIAL_SCRIPT.md',
    ...over,
  } as VideoProject;
}

function installBridge(overrides: Partial<MidniteStudioBridge['video']['project']> = {}) {
  const list = vi.fn().mockResolvedValue({ projects: [] });
  const create = vi.fn().mockResolvedValue({ ok: true, value: project() });
  const remove = vi.fn().mockResolvedValue({ ok: true });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    video: {
      project: { list, get: vi.fn(), create, remove, ...overrides },
      studio: { start: vi.fn(), stop: vi.fn(), status: vi.fn() },
      render: { start: vi.fn(), cancel: vi.fn(), list: vi.fn() },
      toolchain: vi.fn(),
      files: vi.fn(),
      readFile: vi.fn(),
      root: { get: vi.fn(), set: vi.fn() },
      onStudioChanged: vi.fn(() => () => {}),
      onRenderProgress: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['video'],
  } as Partial<MidniteStudioBridge>;
  return { list, create, remove };
}

function renderList(onSelect = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <VideoProjectList selectedId={null} onSelect={onSelect} />
      </DialogHost>
    </QueryClientProvider>,
  );
  return { onSelect };
}

describe('VideoProjectList', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows the empty state with no projects', async () => {
    installBridge();
    renderList();
    expect(await screen.findByText('No projects yet')).toBeDefined();
  });

  it('lists projects and selects one on click', async () => {
    installBridge({ list: vi.fn().mockResolvedValue({ projects: [project()] }) });
    const { onSelect } = renderList();

    fireEvent.click(await screen.findByText('COP31 showreel'));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('lists an invalid project greyed and disabled, with its error as the subtitle', async () => {
    installBridge({
      list: vi
        .fn()
        .mockResolvedValue({ projects: [{ valid: false, id: 'broken', error: 'project.json is not valid JSON.' }] }),
    });
    renderList();

    const row = await screen.findByText('broken');
    expect(await screen.findByText('project.json is not valid JSON.')).toBeDefined();
    expect(row.closest('button')).toHaveProperty('disabled', true);
  });

  it('creates a project from a prompted title, deriving a slug id', async () => {
    const { create } = installBridge();
    const { onSelect } = renderList();
    await screen.findByText('No projects yet');

    fireEvent.click(screen.getByLabelText('New project'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'COP31 Showreel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ id: 'cop31-showreel', title: 'COP31 Showreel' }));
    expect(onSelect).toHaveBeenCalledWith('cop31-showreel');
  });

  it('deletes a project after the destructive confirm', async () => {
    const { remove } = installBridge({ list: vi.fn().mockResolvedValue({ projects: [project()] }) });
    renderList();

    fireEvent.contextMenu(await screen.findByText('COP31 showreel'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: 'p1' }));
  });
});

/**
 * The scan of the video root, and its three states — Phase 60 Theme C.
 *
 * The root is a directory the user picks in Settings, so "that path is gone"
 * is a real and recoverable failure; until this ladder existed it rendered as
 * "No projects yet", which is an answer this pane did not have.
 */
describe('VideoProjectList — the three states', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  const showing = (): string[] =>
    Object.entries({
      error: screen.queryByText('Could not read the video root'),
      empty: screen.queryByText('No projects yet'),
      skeleton: screen.queryByText('Looking for video projects…'),
      content: screen.queryByText('COP31 showreel'),
    })
      .filter(([, node]) => node !== null)
      .map(([name]) => name);

  it('shows the skeleton — not the empty state — while the first scan is out', () => {
    installBridge({ list: vi.fn().mockReturnValue(new Promise(() => {})) });
    renderList();
    expect(showing()).toEqual(['skeleton']);
  });

  it('shows the failure, with its own message', async () => {
    installBridge({ list: vi.fn().mockRejectedValue(new Error('ENOENT: /Videos is gone')) });
    renderList();
    await waitFor(() => expect(showing()).toEqual(['error']));
    expect(screen.getByText('ENOENT: /Videos is gone')).toBeTruthy();
  });

  it('shows the empty state once a scan has resolved to nothing', async () => {
    installBridge();
    renderList();
    await waitFor(() => expect(showing()).toEqual(['empty']));
  });

  it('shows the projects once there are some', async () => {
    installBridge({ list: vi.fn().mockResolvedValue({ projects: [project()] }) });
    renderList();
    await waitFor(() => expect(showing()).toEqual(['content']));
  });
});
