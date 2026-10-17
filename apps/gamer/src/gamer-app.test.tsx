// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
    },
  };
});
afterEach(cleanup);

describe('Midnite Gamer', () => {
  it('is the launcher catalog tile: Games first, with Maps, Terrain and Sprites beside it', () => {
    expect(GAMER_APP.accent).toBe('#10b981');
    expect(GAMER_TABS.map((t) => t.id)).toEqual(['game', 'map', 'terrain', 'sprite']);
    expect(GAMER_TABS.map((t) => t.label)).toEqual(['Games', 'Maps', 'Terrain', 'Sprites']);
  });

  it('composes the four media packages the placement map gives it, and nothing else', () => {
    for (const name of ['media-map', 'media-terrain', 'media-sprite', 'media-game'] as const) {
      expect(FEATURE_PACKAGE_SPLITS[name].placement).toBe('gamer');
    }
    expect(placementOwners(FEATURE_PLACEMENT.media)).toContain('gamer');
  });

  it('scopes the renderer and main to the same single repository id', () => {
    expect(GAMER_REPO_ID).toBe(MAIN_REPO_ID);
  });

  it('opens on the media shell with the four tabs in the strip', async () => {
    render(<GamerApp />);
    expect(screen.getByText('Midnite Gamer')).toBeTruthy();
    await waitFor(() => {
      for (const label of ['Games', 'Maps', 'Terrain', 'Sprites']) expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    });
  });
});
