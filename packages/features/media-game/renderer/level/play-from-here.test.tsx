// vitest/jsdom: Play from here's button, F5 / Shift+F5 and start-point rules. Needs no real browser: the runner is a
// recorded bridge call, and the editor's canvas is the same stub the rest of the editor suite uses.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { LevelEditor } from './level-editor';
import { useLevelStore } from './level-store';
import { playSpawn } from './play-from-here';
import { blankLevel, blankLevel3d, installBridge, newClient, removeBridge, stubCanvas, stubPointerEvents } from './test-helpers';

const list = vi.fn();
const get = vi.fn();
const preview = vi.fn();
const stop = vi.fn();

beforeEach(() => {
  stubCanvas();
  stubPointerEvents();
  for (const m of [list, get, preview, stop]) m.mockReset();
  list.mockResolvedValue({ ok: true, value: { scenes: [{ scene: 'level', bytes: 1, dimension: '2d', issue: null }], start: 'level', readsLevels: true } });
  get.mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [], images: [] } });
  preview.mockResolvedValue({ ok: true, value: { url: 'mstudio-game://g1/index.html', via: 'started' } });
  installBridge({ list, get, preview, stop });
  useLevelStore.setState({ byGame: {}, newSceneFor: null });
});
afterEach(() => {
  cleanup();
  removeBridge();
});

const renderEditor = (onPlayStarted?: (started: Promise<string | null>) => void) =>
  render(
    <FrameChromeProvider chrome={createFrameChrome().chrome}>
      <QueryClientProvider client={newClient()}>
        <LevelEditor gameId="g1" onPlayStarted={onPlayStarted} />
      </QueryClientProvider>
    </FrameChromeProvider>,
  );
const button = () => screen.getByRole('button', { name: 'Play from here' }) as HTMLButtonElement;

describe('Play from here (Phase 140 Theme B)', () => {
  it('B5 shows a spinner while the preview is pending, then asks the host to show Play', async () => {
    let finish: (value: unknown) => void = () => undefined;
    preview.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onStarted = vi.fn();
    renderEditor(onStarted);
    await screen.findByTestId('level-editor');
    fireEvent.click(button());
    await waitFor(() => expect(button().getAttribute('aria-busy')).toBe('true'));
    expect(button().disabled).toBe(true);
    await act(async () => finish({ ok: true, value: { url: 'u', via: 'started' } }));
    await waitFor(() => expect(button().getAttribute('aria-busy')).toBeNull());
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('sends the unsaved level (not the file) and the scene', async () => {
    renderEditor();
    const wrap = await screen.findByTestId('level-canvas-wrap');
    // An edit that is not saved: drop an entity at the pointer, then play.
    fireEvent.keyDown(wrap, { key: 'o' });
    const canvas = screen.getByTestId('level-canvas');
    fireEvent.pointerDown(canvas, { clientX: 290, clientY: 200, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 290, clientY: 200, button: 0, pointerId: 1 });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button());
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const req = preview.mock.calls[0]![0] as { gameId: string; scene: string; level: { layers: Array<{ objects?: unknown[] }> }; spawn: unknown };
    expect(req).toMatchObject({ gameId: 'g1', scene: 'level' });
    expect(req.level.layers[2]!.objects).toHaveLength(2);
    // The new entity is selected, so the start is its position.
    expect(req.spawn).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('B5 is disabled on a read-only level', async () => {
    get.mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [{ path: 'layers.0', message: 'Tile layer "x" has no data.' }], images: [] } });
    renderEditor();
    await screen.findByTestId('level-editor');
    expect(button().disabled).toBe(true);
    fireEvent.keyDown(screen.getByTestId('level-canvas-wrap'), { key: 'F5' });
    expect(preview).not.toHaveBeenCalled();
  });

  it('B6 F5 plays and Shift+F5 stops, only while the canvas has focus', async () => {
    renderEditor();
    const wrap = await screen.findByTestId('level-canvas-wrap');
    fireEvent.keyDown(document.body, { key: 'F5' });
    expect(preview).not.toHaveBeenCalled();
    fireEvent.keyDown(wrap, { key: 'F5' });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(wrap, { key: 'F5', shiftKey: true });
    expect(stop).toHaveBeenCalledWith({ gameId: 'g1' });
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refusal and does not switch to Play', async () => {
    preview.mockResolvedValue({ ok: false, kind: 'error', message: 'That level is too large to preview.' });
    const onStarted = vi.fn();
    renderEditor(onStarted);
    await screen.findByTestId('level-editor');
    fireEvent.click(button());
    await waitFor(() => expect(preview).toHaveBeenCalled());
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe('playSpawn', () => {
  const level2d = blankLevel() as never;
  const level3d = blankLevel3d() as never;

  it('is the selected object centre in 2D, the pointer without a selection, null with neither', () => {
    expect(playSpawn(level2d, { id: 1, name: 'a', x: 10, y: 20, width: 32, height: 16 }, { x: 1, y: 1 })).toEqual({ x: 26, y: 28 });
    expect(playSpawn(level2d, { id: 1, name: 'a', x: 10, y: 20 }, null)).toEqual({ x: 10, y: 20 });
    expect(playSpawn(level2d, null, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 });
    expect(playSpawn(level2d, null, null)).toBeNull();
  });

  it('answers 3D in metres: x,z without an elevation, x,height,z with one', () => {
    const l = level3d as { tilewidth: number; tileheight: number };
    expect(playSpawn(level3d, { id: 1, name: 'a', x: l.tilewidth * 2, y: l.tileheight * 4 }, null)).toEqual({ x: 2, y: 4 });
    expect(
      playSpawn(level3d, { id: 1, name: 'a', x: l.tilewidth * 2, y: l.tileheight * 4, properties: [{ name: 'elevation', type: 'float', value: 1.5 }] }, null),
    ).toEqual({ x: 2, y: 1.5, z: 4 });
    expect(playSpawn(level3d, null, { x: l.tilewidth, y: l.tileheight * 3 })).toEqual({ x: 1, y: 3 });
  });
});
