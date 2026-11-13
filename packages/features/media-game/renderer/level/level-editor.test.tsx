// vitest/jsdom: the editor's tools and keys, Save, the banners and the empty state. Canvas drawing needs a real
// browser and is a human check (Theme H); hit-testing is exercised here through the pointer events jsdom can send.
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LevelEditor } from './level-editor';
import { useLevelStore } from './level-store';
import { blankLevel, installBridge, newClient, removeBridge, stubCanvas } from './test-helpers';

const list = vi.fn();
const get = vi.fn();
const set = vi.fn();

const listed = (over: Record<string, unknown> = {}) => ({ ok: true, value: { scenes: [{ scene: 'level', bytes: 1, dimension: '2d', issue: null }], start: 'level', readsLevels: true, ...over } });

beforeEach(() => {
  stubCanvas();
  for (const m of [list, get, set]) m.mockReset();
  list.mockResolvedValue(listed());
  get.mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [], images: [] } });
  set.mockResolvedValue({ ok: true, value: { sha: 'abc' } });
  installBridge({ list, get, set });
  useLevelStore.setState({ byGame: {}, newSceneFor: null });
});
afterEach(() => {
  cleanup();
  removeBridge();
});

const renderEditor = () => render(<QueryClientProvider client={newClient()}><LevelEditor gameId="g1" /></QueryClientProvider>);
const ready = () => screen.findByTestId('level-editor');

describe('LevelEditor', () => {
  it('opens the start scene without moving the game, with the tools as a radiogroup', async () => {
    renderEditor();
    await ready();
    expect(get).toHaveBeenCalledWith({ gameId: 'g1', scene: 'level' });
    const group = screen.getByRole('radiogroup', { name: 'Tool' });
    const radios = Array.from(group.querySelectorAll('[role=radio]')).map((r) => r.getAttribute('aria-label'));
    expect(radios).toEqual(['Paint', 'Erase', 'Rectangle', 'Pick', 'Entity', 'Select']);
    expect(screen.getByRole('radio', { name: 'Paint' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches tools with B E R I O V while the canvas has focus', async () => {
    renderEditor();
    await ready();
    const canvas = screen.getByTestId('level-canvas-wrap');
    const keys: Array<[string, string]> = [['e', 'Erase'], ['r', 'Rectangle'], ['i', 'Pick'], ['o', 'Entity'], ['v', 'Select'], ['b', 'Paint']];
    for (const [key, label] of keys) {
      fireEvent.keyDown(canvas, { key });
      expect(screen.getByRole('radio', { name: label }).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('does not react to the letter keys anywhere else', async () => {
    renderEditor();
    await ready();
    fireEvent.keyDown(document.body, { key: 'e' });
    expect(screen.getByRole('radio', { name: 'Paint' }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps Save disabled while clean, enables it after an edit and writes the level', async () => {
    renderEditor();
    await ready();
    const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);
    // The Entity tool drops a point at the pointer; the view is fitted, so the middle of the map is near (320, 200).
    const canvas = screen.getByTestId('level-canvas');
    fireEvent.keyDown(screen.getByTestId('level-canvas-wrap'), { key: 'o' });
    fireEvent.pointerDown(canvas, { clientX: 290, clientY: 200, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 290, clientY: 200, button: 0, pointerId: 1 });
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const req = set.mock.calls[0]![0] as { gameId: string; scene: string; level: { layers: Array<{ objects?: unknown[] }> } };
    expect(req).toMatchObject({ gameId: 'g1', scene: 'level' });
    expect(req.level.layers[2]!.objects).toHaveLength(2);
    await waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it('undoes with Mod+Z while the canvas has focus', async () => {
    renderEditor();
    await ready();
    const canvas = screen.getByTestId('level-canvas');
    const wrap = screen.getByTestId('level-canvas-wrap');
    fireEvent.keyDown(wrap, { key: 'o' });
    fireEvent.pointerDown(canvas, { clientX: 290, clientY: 200, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 290, clientY: 200, button: 0, pointerId: 1 });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(wrap, { key: 'z', ctrlKey: true });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('says so when the game does not read level files yet', async () => {
    list.mockResolvedValue(listed({ readsLevels: false }));
    renderEditor();
    await ready();
    expect(screen.getByTestId('level-banner-no-reads').textContent).toContain('This game does not read level files yet.');
  });

  it('omits that banner when it does', async () => {
    renderEditor();
    await ready();
    expect(screen.queryByTestId('level-banner-no-reads')).toBeNull();
  });

  it('opens an invalid level read-only with its first issue', async () => {
    get.mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [{ path: 'layers.0', message: 'Tile layer "x" has no data.' }], images: [] } });
    renderEditor();
    await ready();
    expect(screen.getByTestId('level-banner-readonly').textContent).toContain('layers.0: Tile layer "x" has no data.');
    expect((screen.getByRole('radio', { name: 'Paint' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a missing tileset image from blocking edits', async () => {
    get.mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [{ path: 'tilesets.ground.image', message: '"a.png" is missing or outside the game folder.' }], images: [] } });
    renderEditor();
    await ready();
    expect(screen.queryByTestId('level-banner-readonly')).toBeNull();
    expect(screen.getByTestId('level-banner-images')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Paint' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the empty state with New scene when the game has no levels', async () => {
    list.mockResolvedValue(listed({ scenes: [], start: null }));
    renderEditor();
    expect(await screen.findByText('No levels yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /New scene/ }));
    expect(useLevelStore.getState().newSceneFor).toBe('g1');
  });

  it('shows a failure with Retry', async () => {
    get.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'disk on fire' });
    renderEditor();
    expect(await screen.findByText('disk on fire')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await ready();
  });

  it('lists layers top first and toggles one', async () => {
    renderEditor();
    await ready();
    const layers = screen.getByRole('complementary', { name: 'Layers' });
    const names = Array.from(layers.querySelectorAll('button[aria-label^="Layer "]')).map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Layer objects', 'Layer collision', 'Layer ground']);
    fireEvent.click(screen.getByRole('button', { name: 'Hide layer ground' }));
    expect(screen.getByRole('button', { name: 'Show layer ground' })).toBeTruthy();
  });

  it('inspects the selected entity', async () => {
    renderEditor();
    await ready();
    const canvas = screen.getByTestId('level-canvas');
    fireEvent.keyDown(screen.getByTestId('level-canvas-wrap'), { key: 'v' });
    // The blank level's spawn sits at the middle cell (2, 1) → object (80, 48).
    fireEvent.pointerDown(canvas, { clientX: 198.4 + 80 * 1.9, clientY: 108.8 + 48 * 1.9, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 198.4 + 80 * 1.9, clientY: 108.8 + 48 * 1.9, button: 0, pointerId: 1 });
    const inspector = await screen.findByRole('region', { name: 'Entity inspector' });
    expect((inspector.querySelector('input[aria-label="Type"]') as HTMLInputElement).value).toBe('spawn');
  });
});
