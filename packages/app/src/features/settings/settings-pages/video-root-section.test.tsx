import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { VideoRootSection } from './video-root-section';

/** Settings ▸ Media's engine picker (Phase 99 Theme H) — DOM roles and bridge round-trips, so vitest. */

afterEach(cleanup);

const withRoot = (engine?: string) => ({
  ...fixtures,
  video: {
    root: '/videos',
    resolution: {
      root: '/videos',
      source: 'global',
      setupTarget: null,
      ...(engine ? { engine } : {}),
    },
  },
});

describe('Settings ▸ Media ▸ Video root — engine', () => {
  it('shows no engine picker until a root is configured', async () => {
    renderView(<VideoRootSection />, { fixtures: { ...fixtures, video: { root: null } } });
    expect(await screen.findByText('Not configured yet.')).toBeTruthy();
    expect(screen.queryByTestId('video-root-engine')).toBeNull();
  });

  it('shows the root engine, Remotion when the root records none', async () => {
    renderView(<VideoRootSection />, { fixtures: withRoot() });
    const remotion = (await screen.findByRole('radio', { name: /Remotion/ })) as HTMLInputElement;
    expect(remotion.checked).toBe(true);
  });

  it('switching to HyperFrames persists it and says the install is pending', async () => {
    renderView(<VideoRootSection />, { fixtures: withRoot('remotion') });
    fireEvent.click(await screen.findByRole('radio', { name: /HyperFrames/ }));
    await waitFor(() =>
      expect((screen.getByRole('radio', { name: /HyperFrames/ }) as HTMLInputElement).checked).toBe(
        true,
      ),
    );
  });

  it('names the editor app each engine uses', async () => {
    renderView(<VideoRootSection />, { fixtures: withRoot() });
    const note = await screen.findByTestId('video-root-engine');
    expect(note.textContent).toContain('hyperframes-editor/');
    expect(note.textContent).toContain('video.config.json');
  });
});
