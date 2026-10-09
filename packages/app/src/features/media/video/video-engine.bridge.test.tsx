import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useTerminalStore } from '../../terminal/terminal-store';
import { VideoEnginePicker, VideoEngineSelect } from './video-engine-picker';
import { VideoRenderDialog } from './video-render-dialog';
import { VideoTab } from './video-tab';

/**
 * The engine choice (Phase 99 Theme H) — vitest/jsdom: it is DOM roles, text
 * and bridge round-trips, none of which needs a real browser. The assembled
 * Video tab goes through the mock bridge, the same posture as
 * `video-tab.bridge.test.tsx`.
 */

const PROJECT = { id: 'showreel', title: 'COP31 showreel', valid: true, composition: 'Main' };
const REPO_ROOT = {
  root: '/r/.midnite/media/video',
  source: 'repo-media',
  setupTarget: '/r/.midnite/media/video',
};

afterEach(cleanup);

describe('VideoEnginePicker', () => {
  function Harness({ initial = 'remotion' as const, onChange = vi.fn() }) {
    const [value, setValue] = useState<'remotion' | 'hyperframes'>(initial);
    return (
      <VideoEnginePicker
        value={value}
        onChange={(engine) => {
          setValue(engine);
          onChange(engine);
        }}
      />
    );
  }

  it('offers Remotion and HyperFrames as a named radio group, Remotion checked by default', () => {
    renderView(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Video engine' })).toBeTruthy();
    const remotion = screen.getByRole('radio', { name: /Remotion/ }) as HTMLInputElement;
    const hyperframes = screen.getByRole('radio', { name: /HyperFrames/ }) as HTMLInputElement;
    expect(remotion.checked).toBe(true);
    expect(hyperframes.checked).toBe(false);
  });

  it('selecting HyperFrames reports it, and says what it needs', () => {
    const onChange = vi.fn();
    renderView(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /HyperFrames/ }));
    expect(onChange).toHaveBeenCalledWith('hyperframes');
    expect((screen.getByRole('radio', { name: /HyperFrames/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByTestId('video-engine-hyperframes').textContent).toContain('Node 22+');
    expect(screen.getByTestId('video-engine-hyperframes').getAttribute('data-selected')).toBe(
      'true',
    );
  });

  it('disables both options while busy', () => {
    renderView(<VideoEnginePicker value="remotion" onChange={vi.fn()} disabled />);
    for (const radio of screen.getAllByRole('radio'))
      expect((radio as HTMLInputElement).disabled).toBe(true);
  });
});

describe('VideoEngineSelect', () => {
  it('is a compact two-option switch reporting the chosen engine', () => {
    const onChange = vi.fn();
    renderView(<VideoEngineSelect value="remotion" onChange={onChange} />);
    const select = screen.getByLabelText('Video engine') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Remotion',
      'HyperFrames',
    ]);
    fireEvent.change(select, { target: { value: 'hyperframes' } });
    expect(onChange).toHaveBeenCalledWith('hyperframes');
  });
});

describe('VideoRenderDialog — engine aware', () => {
  const open = (engine?: 'remotion' | 'hyperframes') => {
    const onRender = vi.fn();
    renderView(
      <VideoRenderDialog
        open
        onClose={vi.fn()}
        onRender={onRender}
        compositionId="Main"
        {...(engine ? { engine } : {})}
      />,
    );
    return onRender;
  };

  it('Remotion (and the default) offers the resolution scale and sends it', () => {
    const onRender = open();
    expect(screen.getByTestId('video-render-engine').textContent).toContain('Remotion');
    fireEvent.change(screen.getByLabelText('Resolution scale'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Render' }));
    expect(onRender).toHaveBeenCalledWith({ codec: 'h264', crf: 18, scale: 0.5 });
  });

  it('HyperFrames hides the scale — it has presets, not a scale — and names the engine', () => {
    const onRender = open('hyperframes');
    expect(screen.getByTestId('video-render-engine').textContent).toContain('HyperFrames');
    expect(screen.queryByLabelText('Resolution scale')).toBeNull();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Render' }));
    expect(onRender).toHaveBeenCalledWith({ codec: 'h264', crf: 18, label: 'first' });
  });
});

describe('Media ▸ Video — engine choice, assembled through the mock bridge', () => {
  it('Setup Video offers the picker, defaulting to Remotion, and scaffolds the chosen engine', async () => {
    renderView(<VideoTab />, {
      fixtures: {
        ...fixtures,
        video: { resolution: { root: null, source: null, setupTarget: REPO_ROOT.setupTarget } },
      },
      uiState: { selectedRepoId: 'repo-1' },
    });
    await screen.findByRole('heading', { name: 'Set up Video' });
    expect((screen.getByRole('radio', { name: /Remotion/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByText(/Scaffold a Remotion workspace/)).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /HyperFrames/ }));
    expect(screen.getByText(/Scaffold a HyperFrames workspace/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Setup Video' }));

    // Adopted: the toolbar's switch now reads HyperFrames, and the install ran in hyperframes-editor/.
    const select = (await screen.findByTestId('video-engine-select')) as HTMLSelectElement;
    expect(select.value).toBe('hyperframes');
    await waitFor(() => {
      const sessions = useTerminalStore.getState().sessions;
      // The mock bridge scaffolds into /repo/.midnite/media/video whatever the fixture said.
      expect(sessions.some((s) => s.cwd === '/repo/.midnite/media/video/hyperframes-editor')).toBe(
        true,
      );
    });
  });

  it('Setup Video without choosing keeps Remotion — the default is unchanged', async () => {
    renderView(<VideoTab />, {
      fixtures: {
        ...fixtures,
        video: { resolution: { root: null, source: null, setupTarget: REPO_ROOT.setupTarget } },
      },
      uiState: { selectedRepoId: 'repo-1' },
    });
    await screen.findByRole('heading', { name: 'Set up Video' });
    fireEvent.click(screen.getByRole('button', { name: 'Setup Video' }));
    const select = (await screen.findByTestId('video-engine-select')) as HTMLSelectElement;
    expect(select.value).toBe('remotion');
  });

  it('an existing root with no engine in its resolution reads as Remotion (migration)', async () => {
    const data: MockFixtures = {
      ...fixtures,
      video: { projects: [PROJECT], resolution: REPO_ROOT },
    };
    renderView(<VideoTab />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
    const select = (await screen.findByLabelText('Video engine')) as HTMLSelectElement;
    expect(select.value).toBe('remotion');
  });

  it('switching engine from the toolbar persists it and offers the first-visit install in a terminal', async () => {
    const data: MockFixtures = {
      ...fixtures,
      video: { projects: [PROJECT], resolution: { ...REPO_ROOT, engine: 'remotion' } },
    };
    renderView(<VideoTab />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
    const select = (await screen.findByLabelText('Video engine')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'hyperframes' } });
    await waitFor(() =>
      expect((screen.getByLabelText('Video engine') as HTMLSelectElement).value).toBe(
        'hyperframes',
      ),
    );
    await waitFor(() => {
      const sessions = useTerminalStore.getState().sessions;
      expect(sessions.some((s) => s.cwd === '/r/.midnite/media/video/hyperframes-editor')).toBe(
        true,
      );
    });
  });

  it('with HyperFrames active, a project missing ffmpeg shows an install hint with the command', async () => {
    const data: MockFixtures = {
      ...fixtures,
      video: {
        projects: [PROJECT],
        resolution: { ...REPO_ROOT, engine: 'hyperframes' },
        toolchain: {
          [PROJECT.id]: {
            node: { found: true, path: '/usr/bin/node' },
            npx: { found: true, path: '/usr/bin/npx' },
            ffmpeg: { found: false, reason: 'ffmpeg was not found on PATH.' },
            engine: 'hyperframes',
            nodeVersion: '22.12.0',
          },
        },
      },
    };
    renderView(<VideoTab />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
    fireEvent.click(await screen.findByRole('button', { name: /COP31 showreel/ }));
    expect(await screen.findByText('HyperFrames needs a few things')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run brew install ffmpeg' })).toBeTruthy();
  });

  it('the same missing ffmpeg is not a blocker under Remotion', async () => {
    const data: MockFixtures = {
      ...fixtures,
      video: {
        projects: [PROJECT],
        resolution: { ...REPO_ROOT, engine: 'remotion' },
        toolchain: {
          [PROJECT.id]: {
            node: { found: true, path: '/usr/bin/node' },
            npx: { found: true, path: '/usr/bin/npx' },
            ffmpeg: { found: false, reason: 'ffmpeg was not found on PATH.' },
          },
        },
      },
    };
    renderView(<VideoTab />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
    fireEvent.click(await screen.findByRole('button', { name: /COP31 showreel/ }));
    expect(await screen.findByText("The studio isn't running.")).toBeTruthy();
  });

  it('the render dialog opened from the toolbar follows the active engine', async () => {
    const data: MockFixtures = {
      ...fixtures,
      video: { projects: [PROJECT], resolution: { ...REPO_ROOT, engine: 'hyperframes' } },
    };
    renderView(<VideoTab />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
    fireEvent.click(await screen.findByRole('button', { name: /COP31 showreel/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Render…/ }));
    expect((await screen.findByTestId('video-render-engine')).textContent).toContain('HyperFrames');
    expect(screen.queryByLabelText('Resolution scale')).toBeNull();
  });
});
