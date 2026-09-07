import type { MidniteStudioBridge, VideoProject, VideoRender, VideoToolchain } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTerminalStore } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';
import { VideoProjectDetail } from './video-project-detail';

const VALID_PROJECT: VideoProject = {
  valid: true,
  id: 'p1',
  title: 'COP31 showreel',
  composition: 'MyComp',
  source: 'input/original.mp4',
  brief: 'input/BRIEF.md',
  script: 'EDITORIAL_SCRIPT.md',
};

const TOOLCHAIN_ALL_FOUND: VideoToolchain = {
  node: { found: true, path: '/usr/local/bin/node' },
  npx: { found: true, path: '/usr/local/bin/npx' },
  skills: {
    videoWriteScript: { found: true, path: '/videos/.claude/skills/video-write-editorial-script/SKILL.md' },
    videoExecuteScript: { found: true, path: '/videos/.claude/skills/video-execute-editorial-script/SKILL.md' },
  },
};

function installBridge(overrides: { renders?: VideoRender[]; toolchain?: VideoToolchain } = {}) {
  const cancel = vi.fn().mockResolvedValue({ ok: true });
  const startRender = vi.fn().mockResolvedValue({ ok: true, value: { id: 'r2', projectId: 'p1', compositionId: 'MyComp', status: 'queued', startedAt: 0 } });
  const readFile = vi.fn().mockImplementation(({ relPath }: { relPath: string }) => {
    if (relPath === 'input/BRIEF.md') return Promise.resolve({ content: '# The brief' });
    if (relPath === 'EDITORIAL_SCRIPT.md') return Promise.resolve({ content: '# The script' });
    if (relPath === 'output/CHANGELOG.md') return Promise.resolve({ content: '# The changelog' });
    return Promise.resolve({ content: null });
  });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    video: {
      project: { get: vi.fn().mockResolvedValue({ project: VALID_PROJECT }), list: vi.fn(), create: vi.fn(), remove: vi.fn() },
      studio: { start: vi.fn(), stop: vi.fn(), status: vi.fn() },
      render: { start: startRender, cancel, list: vi.fn().mockResolvedValue({ renders: overrides.renders ?? [] }) },
      toolchain: vi.fn().mockResolvedValue({ toolchain: overrides.toolchain ?? TOOLCHAIN_ALL_FOUND }),
      files: vi.fn().mockResolvedValue({ entries: [] }),
      readFile,
      root: { get: vi.fn().mockResolvedValue({ root: '/videos' }), set: vi.fn() },
      onStudioChanged: vi.fn(() => () => {}),
      onRenderProgress: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['video'],
    // `openSession` fires-and-forgets a `terminal.save` — stubbed so the
    // agent-launch test's real `useTerminalStore.openSession` call doesn't
    // throw on a bridge this suite otherwise has no reason to mock.
    terminal: { save: vi.fn() } as unknown as MidniteStudioBridge['terminal'],
  } as Partial<MidniteStudioBridge>;
  return { cancel, startRender, readFile };
}

function renderDetail(projectId: string | null = 'p1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <VideoProjectDetail projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe('VideoProjectDetail', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useUiStore.setState({ selectedRepoId: null });
    useTerminalStore.setState({ sessions: [], activeId: null, states: {} });
  });

  it('renders the title, composition, and brief/script content', async () => {
    installBridge();
    renderDetail();

    expect(await screen.findByText('COP31 showreel')).toBeDefined();
    expect(screen.getByText('MyComp')).toBeDefined();
    expect(await screen.findByText('The brief')).toBeDefined();
    expect(await screen.findByText('The script')).toBeDefined();
  });

  it('disables the Claude actions and the assets sync when no repo is open', async () => {
    installBridge();
    renderDetail();

    await screen.findByText('COP31 showreel');
    expect(screen.getByRole('button', { name: /Write editorial script/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Execute editorial script/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Sync' })).toHaveProperty('disabled', true);
  });

  it('opens an agent session with the resolved skill when a repo is open', async () => {
    installBridge();
    useUiStore.setState({ selectedRepoId: 'repo1' });
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: /Write editorial script/ }));

    await waitFor(() => expect(useTerminalStore.getState().sessions).toHaveLength(1));
    const session = useTerminalStore.getState().sessions[0]!;
    expect(session.repoId).toBe('repo1');
    expect(session.cwd).toBe('/videos/projects/p1');
  });

  it('disables a Claude action whose skill is missing from the video root, with the reason', async () => {
    installBridge({
      toolchain: {
        ...TOOLCHAIN_ALL_FOUND,
        skills: {
          ...TOOLCHAIN_ALL_FOUND.skills,
          videoWriteScript: {
            found: false,
            reason: 'Not found at .claude/skills/video-write-editorial-script/SKILL.md in this video root.',
          },
        },
      },
    });
    useUiStore.setState({ selectedRepoId: 'repo1' });
    renderDetail();

    await screen.findByText('COP31 showreel');
    const write = await screen.findByRole('button', { name: /Write editorial script/ });
    await waitFor(() => expect(write).toHaveProperty('disabled', true));
    expect(write.title).toContain('Not found at .claude/skills/video-write-editorial-script/SKILL.md');
    // The other action's own skill is still found — not collaterally blocked.
    expect(screen.getByRole('button', { name: /Execute editorial script/ })).toHaveProperty('disabled', false);
  });

  it('lists renders with their status, and cancels an in-flight one', async () => {
    const { cancel } = installBridge({
      renders: [{ id: 'r1', projectId: 'p1', compositionId: 'MyComp', status: 'rendering', startedAt: 0 }],
    });
    renderDetail();

    expect(await screen.findByText('rendering')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Cancel render'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ renderId: 'r1' }));
  });

  it('shows the invalid-project error state without crashing', async () => {
    const invalid = { valid: false as const, id: 'broken', error: 'project.json is not valid JSON.' };
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      video: {
        project: { get: vi.fn().mockResolvedValue({ project: invalid }), list: vi.fn(), create: vi.fn(), remove: vi.fn() },
        studio: { start: vi.fn(), stop: vi.fn(), status: vi.fn() },
        render: { start: vi.fn(), cancel: vi.fn(), list: vi.fn().mockResolvedValue({ renders: [] }) },
        toolchain: vi.fn(),
        files: vi.fn().mockResolvedValue({ entries: [] }),
        readFile: vi.fn(),
        root: { get: vi.fn().mockResolvedValue({ root: null }), set: vi.fn() },
        onStudioChanged: vi.fn(() => () => {}),
        onRenderProgress: vi.fn(() => () => {}),
      } as unknown as MidniteStudioBridge['video'],
    } as Partial<MidniteStudioBridge>;
    renderDetail('broken');

    expect(await screen.findByText("This project's `project.json` is invalid.")).toBeDefined();
    expect(screen.getByText('project.json is not valid JSON.')).toBeDefined();
  });
});
