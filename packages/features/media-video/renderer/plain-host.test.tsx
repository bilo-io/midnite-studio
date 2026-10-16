// vitest/jsdom: what an app with an empty host (Creator) gets — plain chrome, no terminal, no agents.
import type { MidniteStudioBridge, VideoProject, VideoStudioStatus, VideoToolchain } from '@midnite/studio-shared';
import { createFrameChrome, FrameChromeProvider, MediaKitProvider, type MediaKit } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VideoHostProvider, type VideoHost } from './host';
import { VideoProjectDetail } from './video-project-detail';
import { VideoStudioPane } from './video-studio-pane';

const PROJECT: VideoProject = {
  valid: true,
  id: 'p1',
  title: 'Showreel',
  composition: 'Main',
  source: 'input/original.mp4',
  brief: 'input/BRIEF.md',
  script: 'EDITORIAL_SCRIPT.md',
};

const TOOLCHAIN: VideoToolchain = {
  node: { found: true, path: '/usr/bin/node' },
  npx: { found: true, path: '/usr/bin/npx' },
  skills: {
    videoWriteScript: { found: true, path: '/x' },
    videoExecuteScript: { found: true, path: '/x' },
  },
};

function installBridge(status: VideoStudioStatus, toolchain: VideoToolchain = TOOLCHAIN) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    video: {
      project: { get: vi.fn().mockResolvedValue({ project: PROJECT }) },
      studio: { start: vi.fn(), stop: vi.fn(), status: vi.fn().mockResolvedValue({ status }) },
      render: { start: vi.fn(), cancel: vi.fn(), list: vi.fn().mockResolvedValue({ renders: [] }) },
      toolchain: vi.fn().mockResolvedValue({ toolchain }),
      files: vi.fn().mockResolvedValue({ entries: [] }),
      readFile: vi.fn().mockResolvedValue({ content: '# The brief' }),
      root: { resolve: vi.fn().mockResolvedValue({ root: '/videos', source: 'global', setupTarget: null }) },
      onStudioChanged: vi.fn(() => () => {}),
      onRenderProgress: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['video'],
  } as Partial<MidniteStudioBridge>;
}

/** Only what these components read from the kit: the repo. */
const kit = { useMediaRepoId: () => 'creator' } as unknown as MediaKit;

function renderPlain(node: ReactNode, host: VideoHost = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <MediaKitProvider kit={kit}>
          <VideoHostProvider host={host}>{node}</VideoHostProvider>
        </MediaKitProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('Video with an empty host', () => {
  it('hosts a running studio in an iframe on its deep-linked URL', async () => {
    installBridge({ state: 'running', url: 'http://localhost:3001' });
    renderPlain(<VideoStudioPane projectId="p1" compositionId="Main" />);
    const frame = (await screen.findByTestId('video-studio-frame')) as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('http://localhost:3001');
    // No browser pane to open it in.
    expect(screen.queryByRole('button', { name: /Open in tab/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined();
  });

  const MISSING_FFMPEG = {
    engine: 'hyperframes',
    node: { found: true, path: '/usr/bin/node' },
    npx: { found: true, path: '/usr/bin/npx' },
    nodeVersion: '22.12.0',
    ffmpeg: { found: false, reason: 'ffmpeg not found' },
  } as unknown as VideoToolchain;

  it('shows the fix for a missing tool as text to copy when there is no terminal to run it in', async () => {
    installBridge({ state: 'stopped' }, MISSING_FFMPEG);
    renderPlain(<VideoStudioPane projectId="p1" />);
    expect(await screen.findByText(/needs a few things/)).toBeDefined();
    expect(screen.getByTestId('video-engine-issues').querySelector('code')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Run / })).toBeNull();
  });

  it('runs the fix in the host terminal when it has one', async () => {
    installBridge({ state: 'stopped' }, MISSING_FFMPEG);
    const runInTerminal = vi.fn();
    renderPlain(<VideoStudioPane projectId="p1" />, { runInTerminal });
    const button = await screen.findByRole('button', { name: /^Run / });
    button.click();
    expect(runInTerminal).toHaveBeenCalledWith(expect.objectContaining({ command: expect.stringContaining('ffmpeg') }));
  });

  it('offers Brief and Versions only — no Edit tab, no skill buttons, no assets sync', async () => {
    installBridge({ state: 'stopped' });
    renderPlain(<VideoProjectDetail projectId="p1" />);
    expect(await screen.findByRole('tab', { name: 'Brief' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Versions' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Edit with AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: /editorial script/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull();
    // The brief still renders, as plain text.
    expect(await screen.findAllByText('# The brief')).not.toHaveLength(0);
  });
});
