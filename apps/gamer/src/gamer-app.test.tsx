// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { GAMER_REPO_ID as MAIN_REPO_ID } from '../main/context';
import { GAMER_REPO_ID } from './compose/gamer-host';
import { GamerApp } from './gamer-app';
import { GAMER_APP, GAMER_TABS } from './gamer-manifest';

const ok = <T,>(value: T) => ({ ok: true as const, value });
const off = () => () => undefined;

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    games: {
      settings: { get: vi.fn().mockResolvedValue({ root: null, resolvedRoot: '/games', issue: null }), set: vi.fn() },
      list: vi.fn().mockResolvedValue({ games: [] }),
      onChanged: vi.fn(off),
      onOpen: vi.fn(off),
      onRunState: vi.fn(off),
      onConsole: vi.fn(off),
      onPopState: vi.fn(off),
      popped: vi.fn().mockResolvedValue({ popped: [] }),
      setBounds: vi.fn(),
      setVisible: vi.fn(),
    },
    media: {
      project: { list: vi.fn().mockResolvedValue(ok([])), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
      file: { list: vi.fn().mockResolvedValue(ok([])), read: vi.fn(), write: vi.fn(), rename: vi.fn(), remove: vi.fn() },
      ffmpegStatus: vi.fn().mockResolvedValue({ found: false, reason: 'none' }),
      onChanged: vi.fn(off),
      onExportProgress: vi.fn(off),
      map: { onOpen: vi.fn(off), onCaptureProgress: vi.fn(off), sources: vi.fn().mockResolvedValue({ sources: [] }) },
      terrain: { onOpen: vi.fn(off), onProgress: vi.fn(off), onChanged: vi.fn(off), library: vi.fn().mockResolvedValue(ok({})) },
      sprite: { onOpen: vi.fn(off), onProgress: vi.fn(off), onChanged: vi.fn(off), onRenderRequest: vi.fn(off), library: vi.fn().mockResolvedValue(ok({})) },
      model: {
        onOpen: vi.fn(off),
        onProgress: vi.fn(off),
        onChanged: vi.fn(off),
        providers: vi.fn().mockResolvedValue({ providers: { ollama: { available: false, reason: 'Ollama is not running.', models: [] } } }),
        library: { migrate: vi.fn().mockResolvedValue(ok({})), list: vi.fn().mockResolvedValue(ok({ tree: [] })) },
        sf3d: { status: vi.fn().mockResolvedValue(ok({ state: 'unavailable', consent: null, bytesOnDisk: 0, totalBytes: 0, reason: 'No SF3D here.' })), onProgress: vi.fn(off) },
      },
    },
  };
});
afterEach(cleanup);

describe('Midnite Gamer', () => {
  it('is the launcher catalog tile: Games first, with Maps, Terrain, Models and Sprites beside it', () => {
    expect(GAMER_APP.accent).toBe('#10b981');
    expect(GAMER_TABS.map((t) => t.id)).toEqual(['game', 'map', 'terrain', 'model', 'sprite']);
    expect(GAMER_TABS.map((t) => t.label)).toEqual(['Games', 'Maps', 'Terrain', 'Models', 'Sprites']);
  });

  it('composes the five media packages the placement map gives it, and nothing else', () => {
    for (const name of ['media-map', 'media-terrain', 'media-sprite', 'media-model', 'media-game'] as const) {
      expect(FEATURE_PACKAGE_SPLITS[name].placement).toBe('gamer');
    }
    expect(placementOwners(FEATURE_PLACEMENT.media)).toContain('gamer');
  });

  it('scopes the renderer and main to the same single repository id', () => {
    expect(GAMER_REPO_ID).toBe(MAIN_REPO_ID);
  });

  it('opens on the media shell with the five tabs in the strip', async () => {
    render(<GamerApp />);
    expect(screen.getByText('Midnite Gamer')).toBeTruthy();
    await waitFor(() => {
      for (const label of ['Games', 'Maps', 'Terrain', 'Models', 'Sprites']) expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    });
  });

  it('opens the Models tab on the plain host: the explorer and an engine picker with Ollama only, no agent', async () => {
    render(<GamerApp />);
    fireEvent.click((await screen.findAllByLabelText('Models'))[0]!);
    expect(await screen.findByTestId('model-explorer')).toBeTruthy();
    expect(await screen.findByTestId('model-ollama-down')).toBeTruthy();
    const engine = (await screen.findByTestId('model-picker')) as HTMLSelectElement;
    expect([...engine.options].map((o) => o.value)).toEqual(['ollama']);
  });

  it('mounts the sprite render host at its root, so a "render from 3D" job has a window to draw in', async () => {
    render(<GamerApp />);
    const sprite = (window as unknown as { midniteStudio: { media: { sprite: { onRenderRequest: ReturnType<typeof vi.fn> } } } }).midniteStudio.media.sprite;
    await waitFor(() => expect(sprite.onRenderRequest).toHaveBeenCalled());
  });
});
