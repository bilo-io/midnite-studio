// vitest/jsdom: the editor's Live toggle and View menu (Phase 140 Themes E and F). Ghost drawing is canvas and covered by
// level-overlay-draw.test.ts; here E4 (disabled while stopped), the chip, and the toggles reaching the view store.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { useGameRunStore } from '../game-run-store';
import { useLevelViewStore } from './3d/level-view-store';
import { LevelEditor } from './level-editor';
import { useLevelStore } from './level-store';
import { blankLevel, installBridge, newClient, removeBridge, stubCanvas, stubPointerEvents } from './test-helpers';

const watch = vi.fn();
let push: ((e: unknown) => void) | null = null;

beforeEach(() => {
  stubCanvas();
  stubPointerEvents();
  const stop = vi.fn();
  watch.mockReset().mockReturnValue(stop);
  installBridge({
    list: vi.fn().mockResolvedValue({ ok: true, value: { scenes: [{ scene: 'level', bytes: 1, dimension: '2d', issue: null }], start: 'level', readsLevels: true } }),
    get: vi.fn().mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [], images: [] } }),
    set: vi.fn(),
    doctor: vi.fn().mockResolvedValue({ ok: true, value: { path: '/g', hasManifest: true, findings: [], counts: { error: 0, warn: 0, info: 0 }, status: 'ok' } }),
  });
  const games = (window as unknown as { midniteStudio: { games: Record<string, unknown> } }).midniteStudio.games;
  games.entities = { get: vi.fn().mockResolvedValue({ ok: true, value: { scene: 'level', frame: 1, entities: [], truncated: false } }), watch };
  games.onEntityState = vi.fn((h: (e: unknown) => void) => {
    push = h;
    return () => undefined;
  });
  useLevelStore.setState({ byGame: {}, newSceneFor: null });
  useLevelViewStore.setState({ overlays: { colliders: false, triggers: false, nav: false } });
  useGameRunStore.setState({ runs: {} });
});
afterEach(() => {
  cleanup();
  removeBridge();
});

const renderEditor = () => render(<FrameChromeProvider chrome={createFrameChrome().chrome}><QueryClientProvider client={newClient()}><LevelEditor gameId="g1" /></QueryClientProvider></FrameChromeProvider>);
const toggle = async () => (await screen.findByTestId('level-live-toggle')) as HTMLButtonElement;

describe('Live toggle', () => {
  it('E4 is disabled while the game is stopped and never subscribes', async () => {
    renderEditor();
    const t = await toggle();
    expect(t.getAttribute('aria-disabled') === 'true' || t.disabled).toBe(true);
    fireEvent.click(t);
    expect(watch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('level-live-chip')).toBeNull();
  });

  it('turns on while the game runs, shows the count and turns itself off when the game stops', async () => {
    renderEditor();
    await toggle();
    act(() => useGameRunStore.getState().applyRunState({ gameId: 'g1', runId: 'r1', state: 'running' }));
    const t = await toggle();
    fireEvent.click(t);
    expect(watch).toHaveBeenCalledWith({ gameId: 'g1' });
    expect((await screen.findByTestId('level-live-chip')).textContent).toBe('Live · 0 entities');
    act(() => push?.({ gameId: 'g1', result: { scene: 'level', frame: 3, entities: [{ id: 1, type: 'enemy', x: 1, y: 1, alive: true }, { id: null, type: 'bullet', x: 2, y: 2, alive: true }], truncated: false } }));
    expect(screen.getByTestId('level-live-chip').textContent).toBe('Live · 2 entities');
    act(() => useGameRunStore.getState().applyRunState({ gameId: 'g1', runId: 'r1', state: 'stopped' }));
    expect(screen.queryByTestId('level-live-chip')).toBeNull();
  });
});

describe('View menu', () => {
  it('F2 switches write through to the persisted view store', async () => {
    renderEditor();
    fireEvent.click(await screen.findByTestId('level-view-trigger'));
    fireEvent.click(await screen.findByRole('switch', { name: 'Colliders' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Triggers' }));
    expect(useLevelViewStore.getState().overlays).toEqual({ colliders: true, triggers: true, nav: false });
  });
});
