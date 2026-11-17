// vitest/jsdom: the editor's tools and keys, Save, the banners and the empty state. Canvas drawing needs a real
// browser and is a human check (Theme H); hit-testing is exercised here through the pointer events jsdom can send.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { levelEntityToWorld } from '@midnite/studio-shared';

import type { Level3dViewProps } from './3d/level-3d-view';
import { useLevelViewStore } from './3d/level-view-store';
import { DEFAULT_LEVEL_SNAP } from './level-snap';
import { LevelEditor } from './level-editor';
import { useDoctorRequest } from '../game-doctor-store';
import { addObject, selectOnly } from './level-edit-model';
import { useLevelStore } from './level-store';
import { blankLevel, blankLevel3d, installBridge, newClient, removeBridge, stubCanvas, stubPointerEvents } from './test-helpers';

// The 3D view itself needs WebGL (a real browser, the real-run gate); here a stub stands in for the lazy module,
// recording its props and answering the editor's exit handshake at once.
const view3d = vi.hoisted(() => ({ props: null as unknown, exits: 0 }));
vi.mock('./3d/level-3d-view', () => ({
  default: (props: Level3dViewProps) => {
    view3d.props = props;
    props.handle.current = {
      exit: (done) => {
        view3d.exits++;
        done({ target: [8, 0, 8], span: 12, pitch: Math.PI / 2, yaw: 0, fov: 2 });
      },
    };
    return <div data-testid="level-3d-view" data-tool={props.tool} data-enter={props.enterFrom ? 'plan' : 'orbit'} />;
  },
}));

const list = vi.fn();
const get = vi.fn();
const set = vi.fn();
const doctor = vi.fn();
const doctorFix = vi.fn();
const finding = (rule: string, area: string, fixId: string | null = null) => ({ rule, level: 'info', area, message: `${rule} message`, path: null, fixId });
const diagnosed = (...findings: ReturnType<typeof finding>[]) => ({ ok: true, value: { path: '/g', hasManifest: true, findings, counts: { error: 0, warn: 0, info: findings.length }, status: 'ok' } });

const listed = (over: Record<string, unknown> = {}) => ({ ok: true, value: { scenes: [{ scene: 'level', bytes: 1, dimension: '2d', issue: null }], start: 'level', readsLevels: true, ...over } });

beforeEach(() => {
  stubCanvas();
  stubPointerEvents();
  for (const m of [list, get, set, doctor, doctorFix]) m.mockReset();
  doctor.mockResolvedValue(diagnosed());
  list.mockResolvedValue(listed());
  get.mockResolvedValue({ ok: true, value: { level: blankLevel(), issues: [], images: [] } });
  set.mockResolvedValue({ ok: true, value: { sha: 'abc' } });
  installBridge({ list, get, set, doctor, doctorFix });
  useLevelStore.setState({ byGame: {}, newSceneFor: null });
  useLevelViewStore.setState({ modeByGame: {}, optimisation: 3, stats: false, snap: DEFAULT_LEVEL_SNAP });
  view3d.props = null;
  view3d.exits = 0;
});
afterEach(() => {
  cleanup();
  removeBridge();
});

const renderEditor = () => render(<FrameChromeProvider chrome={createFrameChrome().chrome}><QueryClientProvider client={newClient()}><LevelEditor gameId="g1" /></QueryClientProvider></FrameChromeProvider>);
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

  it('says the levels are in code, with Open Doctor, when the doctor reports levels.none and an outdated kit', async () => {
    list.mockResolvedValue(listed({ scenes: [], start: null }));
    doctor.mockResolvedValue(diagnosed(finding('levels.none', 'levels'), finding('kit.outdated', 'kit', 'upgrade-kit')));
    useDoctorRequest.setState({ requested: null });
    renderEditor();
    expect(await screen.findByText('This game builds its levels in code')).toBeTruthy();
    expect(screen.queryByText('No levels yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Open Doctor/ }));
    expect(useDoctorRequest.getState().requested).toBe('g1');
  });

  it('offers Declare levels when level files exist but the manifest does not declare them', async () => {
    doctor.mockResolvedValue(diagnosed(finding('levels.not-declared', 'levels', 'declare-levels')));
    doctorFix.mockResolvedValue({ ok: true, value: { commit: 'abc1234', diagnosis: { path: '/g', hasManifest: true, findings: [], counts: { error: 0, warn: 0, info: 0 }, status: 'ok' } } });
    renderEditor();
    expect((await screen.findByTestId('level-not-declared')).textContent).toContain('Levels found but not declared');
    fireEvent.click(screen.getByRole('button', { name: 'Declare levels' }));
    await waitFor(() => expect(doctorFix).toHaveBeenCalledWith({ fixId: 'declare-levels', gameId: 'g1' }));
    await waitFor(() => expect(screen.queryByTestId('level-not-declared')).toBeNull());
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

// A 20 x 20 m plan in a 640 x 400 canvas: the view fits at zoom 0.59375 with its origin at (130, 10), so map (x, y)
// px sits at screen (130 + 0.59375 x, 10 + 0.59375 y), and one metre is 32 px. jsdom has no layout, so
// `getBoundingClientRect` is all zeros and `clientX/Y` are canvas coordinates.
const at = (mx: number, my: number) => ({ clientX: 130 + 0.59375 * mx, clientY: 10 + 0.59375 * my, button: 0, pointerId: 1 });

describe('LevelEditor, 3D plan view (Phase 132 Theme E)', () => {
  // Half a tile is the half metre these tests were written against.
  beforeEach(() => useLevelViewStore.setState({ snap: { ...DEFAULT_LEVEL_SNAP, planStep: 0.5 } }));
  const lastObject = () => {
    const entry = useLevelStore.getState().byGame.g1!;
    return entry.edit.level.layers.find((l) => l.type === 'objectgroup')!.objects!.at(-1)!;
  };
  const open3d = async (extra: Record<string, unknown> = {}) => {
    get.mockResolvedValue({ ok: true, value: { level: blankLevel3d(), issues: [], images: [], ...extra } });
    list.mockResolvedValue(listed({ scenes: [{ scene: 'level', bytes: 1, dimension: '3d', issue: null }] }));
    renderEditor();
    await ready();
    return { canvas: screen.getByTestId('level-canvas'), wrap: screen.getByTestId('level-canvas-wrap') };
  };

  it('opens editable, with the 3D tools and no tile tools, palette or layer button', async () => {
    await open3d();
    const labels = Array.from(screen.getByRole('radiogroup', { name: 'Tool' }).querySelectorAll('[role=radio]')).map((r) => r.getAttribute('aria-label'));
    expect(labels).toEqual(['Select / Move', 'Place', 'Volume', 'Path', 'Rotate']);
    expect(screen.getByRole('radio', { name: 'Select / Move' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('radio', { name: 'Place' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('radio', { name: 'Paint' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Tiles' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tile layer/ })).toBeNull();
    expect(screen.queryByTestId('level-banner-readonly')).toBeNull();
  });

  it('switches tools with V O R P Y', async () => {
    const { wrap } = await open3d();
    for (const [key, label] of [['o', 'Place'], ['r', 'Volume'], ['p', 'Path'], ['y', 'Rotate'], ['v', 'Select / Move']] as const) {
      fireEvent.keyDown(wrap, { key });
      expect(screen.getByRole('radio', { name: label }).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('places a point entity on the half-metre grid, from the 3D palette without path', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'o' });
    const types = Array.from(screen.getByRole('radiogroup', { name: 'Entity type' }).querySelectorAll('[role=radio]')).map((r) => r.textContent);
    expect(types).toContain('prop');
    expect(types).toContain('light');
    expect(types).not.toContain('path');
    fireEvent.click(screen.getByRole('radio', { name: 'prop' }));
    fireEvent.pointerDown(canvas, at(100, 150));
    fireEvent.pointerUp(canvas, at(100, 150));
    // 100 px is 3.125 m, 150 px is 4.6875 m: both snap to the half metre.
    expect(lastObject()).toMatchObject({ type: 'prop', x: 96, y: 144 });
  });

  it('F5 places on whole tiles by default, on half tiles at 0.5, and freely with Alt', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'o' });
    fireEvent.click(screen.getByRole('radio', { name: 'prop' }));
    act(() => useLevelViewStore.setState({ snap: DEFAULT_LEVEL_SNAP }));
    fireEvent.pointerDown(canvas, at(100, 150));
    fireEvent.pointerUp(canvas, at(100, 150));
    expect(lastObject()).toMatchObject({ x: 96, y: 160 });
    act(() => useLevelViewStore.setState({ snap: { ...DEFAULT_LEVEL_SNAP, planStep: 0.5 } }));
    fireEvent.pointerDown(canvas, at(100, 150));
    fireEvent.pointerUp(canvas, at(100, 150));
    expect(lastObject()).toMatchObject({ x: 96, y: 144 });
    fireEvent.pointerDown(canvas, { ...at(100, 150), altKey: true });
    fireEvent.pointerUp(canvas, { ...at(100, 150), altKey: true });
    expect(lastObject().x).not.toBe(96);
  });

  it('F: an arrow key nudges a 3D level by the snap step (half a tile here)', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'v' });
    fireEvent.pointerDown(canvas, at(336, 336));
    fireEvent.pointerUp(canvas, at(336, 336));
    fireEvent.keyDown(wrap, { key: 'ArrowRight' });
    expect(lastObject().x).toBe(352);
  });

  it('drags a volume into a prop box with sizeY 3', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'r' });
    fireEvent.pointerDown(canvas, at(64, 64));
    fireEvent.pointerMove(canvas, at(192, 128));
    fireEvent.pointerUp(canvas, at(192, 128));
    expect(lastObject()).toMatchObject({ type: 'prop', x: 64, y: 64, width: 128, height: 64 });
    expect(lastObject().properties).toEqual([{ name: 'sizeY', type: 'float', value: 3 }]);
  });

  it('draws a path with clicks and Enter finishes it; Escape cancels a draft', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'p' });
    for (const [x, y] of [[64, 64], [160, 64], [160, 160]] as const) {
      fireEvent.pointerDown(canvas, at(x, y));
      fireEvent.pointerUp(canvas, at(x, y));
    }
    expect(screen.getByTestId('plan-hint').textContent).toContain('3 points');
    fireEvent.keyDown(wrap, { key: 'Enter' });
    expect(lastObject()).toMatchObject({ type: 'path', x: 64, y: 64, polyline: [{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 96, y: 96 }] });
    fireEvent.pointerDown(canvas, at(64, 64));
    fireEvent.pointerUp(canvas, at(64, 64));
    fireEvent.keyDown(wrap, { key: 'Escape' });
    fireEvent.keyDown(wrap, { key: 'Enter' });
    expect(useLevelStore.getState().byGame.g1!.edit.level.layers[0]!.objects!.filter((o) => o.type === 'path')).toHaveLength(1);
  });

  it('moves an object by drag, keeping where it was grabbed', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'v' });
    // The spawn is at (336, 336); grab it 3 px off and drag 64 px right.
    fireEvent.pointerDown(canvas, at(339, 336));
    fireEvent.pointerMove(canvas, at(403, 336));
    fireEvent.pointerUp(canvas, at(403, 336));
    expect(lastObject()).toMatchObject({ type: 'spawn', x: 400, y: 336 });
    expect(useLevelStore.getState().byGame.g1!.edit.past).toHaveLength(1);
  });

  it('rotates by dragging around the object, with Shift snapping to 15 degrees', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'y' });
    fireEvent.pointerDown(canvas, at(336, 336));
    fireEvent.pointerMove(canvas, at(436, 336));
    expect(lastObject().rotation).toBe(90);
    fireEvent.pointerMove(canvas, { ...at(436, 300), shiftKey: true });
    // atan2(100, 36) is about 70.2 degrees from up, which snaps to 75.
    expect(lastObject().rotation).toBe(75);
    fireEvent.pointerUp(canvas, at(436, 300));
    expect(useLevelStore.getState().byGame.g1!.edit.past).toHaveLength(1);
  });

  it('shows the world position from levelEntityToWorld and edits elevation, which clears back to ground', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'v' });
    fireEvent.pointerDown(canvas, at(336, 336));
    fireEvent.pointerUp(canvas, at(336, 336));
    const inspector = await screen.findByRole('region', { name: 'Entity inspector' });
    const level = useLevelStore.getState().byGame.g1!.edit.level;
    const world = () => levelEntityToWorld(lastObject() as never, useLevelStore.getState().byGame.g1!.edit.level as never).position;
    expect(world()).toEqual([10.5, null, 10.5]);
    expect(screen.getByTestId('inspector-world').textContent).toBe('World: 10.5, ground, 10.5 m');
    expect(level.layers[0]!.objects).toHaveLength(1);
    const elevation = inspector.querySelector('input[aria-label="Elevation (m)"]') as HTMLInputElement;
    fireEvent.blur(elevation, { target: { value: '2' } });
    expect(world()).toEqual([10.5, 2, 10.5]);
    expect(screen.getByTestId('inspector-world').textContent).toBe('World: 10.5, 2, 10.5 m');
    fireEvent.blur(inspector.querySelector('input[aria-label="Elevation (m)"]')!, { target: { value: '' } });
    expect(screen.getByTestId('inspector-world').textContent).toBe('World: 10.5, ground, 10.5 m');
  });

  it('edits model from this game\'s model assets, collider, scale and a light\'s colour', async () => {
    (window as unknown as { midniteStudio: { games: { manifest: { get: unknown } } } }).midniteStudio.games.manifest.get = vi.fn().mockResolvedValue({ manifest: { assets: [{ name: 'crate', kind: 'model' }, { name: 'tree', kind: 'model' }, { name: 'boom', kind: 'audio' }] }, issues: [] });
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'v' });
    fireEvent.pointerDown(canvas, at(336, 336));
    fireEvent.pointerUp(canvas, at(336, 336));
    await screen.findByRole('region', { name: 'Entity inspector' });
    const model = screen.getByLabelText('Model') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(model.options).map((o) => o.value)).toEqual(['', 'crate', 'tree']));
    fireEvent.change(model, { target: { value: 'tree' } });
    fireEvent.change(screen.getByLabelText('Collider'), { target: { value: 'none' } });
    fireEvent.blur(screen.getByLabelText('Scale'), { target: { value: '2' } });
    expect(lastObject().properties).toEqual([{ name: 'model', type: 'string', value: 'tree' }, { name: 'collider', type: 'string', value: 'none' }, { name: 'scale', type: 'float', value: 2 }]);
    expect(screen.queryByLabelText('Colour')).toBeNull();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'light' } });
    fireEvent.blur(screen.getByLabelText('Type'), { target: { value: 'light' } });
    fireEvent.change(await screen.findByLabelText('Colour'), { target: { value: '#ff0000' } });
    expect(lastObject().properties).toEqual(expect.arrayContaining([{ name: 'color', type: 'string', value: '#ff0000' }]));
  });

  it('carries the terrain extent the level read returned, and none without one', async () => {
    const terrain = { name: 'world', minX: 0, minZ: 0, maxX: 100, maxZ: 100, preview: null };
    await open3d({ terrain });
    expect(useLevelStore.getState().byGame.g1!.terrain).toEqual(terrain);
    cleanup();
    useLevelStore.setState({ byGame: {}, newSceneFor: null });
    await open3d();
    expect(useLevelStore.getState().byGame.g1!.terrain).toBeNull();
  });

  it('saves a 3D edit as one level-set', async () => {
    const { canvas, wrap } = await open3d();
    fireEvent.keyDown(wrap, { key: 'r' });
    fireEvent.pointerDown(canvas, at(64, 64));
    fireEvent.pointerUp(canvas, at(192, 128));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(set.mock.calls[0]![0]).toMatchObject({ gameId: 'g1', scene: 'level' });
  });

  it('opens a 3D level that is not an orthogonal map read-only', async () => {
    get.mockResolvedValue({ ok: true, value: { level: { ...blankLevel3d(), orientation: 'isometric' }, issues: [], images: [] } });
    renderEditor();
    await ready();
    expect(screen.getByTestId('level-banner-readonly').textContent).toContain('orthogonal');
    expect((screen.getByRole('radio', { name: 'Place' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('fits and edits a level whose objects sit at negative pixels', async () => {
    const level = blankLevel3d();
    level.layers[0]!.objects![0] = { ...level.layers[0]!.objects![0]!, x: -480, y: -320 };
    const { planBounds } = await import('./level-plan');
    const { fitView } = await import('./level-view');
    const b = planBounds(level);
    expect([b.minX, b.minY]).toEqual([-480, -320]);
    const v = fitView({ width: 640, height: 400 }, b.maxX - b.minX, b.maxY - b.minY);
    const view = { zoom: v.zoom, x: v.x - b.minX * v.zoom, y: v.y - b.minY * v.zoom };
    const atMap = (mx: number, my: number) => ({ clientX: view.x + view.zoom * mx, clientY: view.y + view.zoom * my, button: 0, pointerId: 1 });
    get.mockResolvedValue({ ok: true, value: { level, issues: [], images: [] } });
    list.mockResolvedValue(listed({ scenes: [{ scene: 'level', bytes: 1, dimension: '3d', issue: null }] }));
    renderEditor();
    await ready();
    const canvas = screen.getByTestId('level-canvas');
    const wrap = screen.getByTestId('level-canvas-wrap');
    // The fitted view is only measured when a real resize happens, so drive the first-fit view through the same maths
    // the canvas uses: initial state fits a 640 x 400 box.
    fireEvent.pointerDown(canvas, atMap(-480, -320));
    fireEvent.pointerUp(canvas, atMap(-480, -320));
    expect(useLevelStore.getState().byGame.g1!.edit.selection).not.toBeNull();
    fireEvent.keyDown(wrap, { key: 'o' });
    fireEvent.pointerDown(canvas, atMap(-200.4, -100.2));
    fireEvent.pointerUp(canvas, atMap(-200.4, -100.2));
    const placed = useLevelStore.getState().byGame.g1!.edit.level.layers[0]!.objects!.at(-1)!;
    expect(placed.x).toBeCloseTo(-208, 5);
    expect(placed.y).toBeCloseTo(-96, 5);
  });
});

describe('LevelEditor, Floorplan | 3D switch (Phase 136 Theme E)', () => {
  const open3d = async (level = blankLevel3d()) => {
    get.mockResolvedValue({ ok: true, value: { level, issues: [], images: [] } });
    list.mockResolvedValue(listed({ scenes: [{ scene: 'level', bytes: 1, dimension: '3d', issue: null }] }));
    renderEditor();
    await ready();
  };
  const viewRadio = (name: string) => screen.getByRole('radio', { name });

  it('a 2D level has no view switch', async () => {
    renderEditor();
    await ready();
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull();
  });

  it('opens on Floorplan, switches to 3D from the plan framing, and keeps only the tools the 3D view has', async () => {
    await open3d();
    expect(viewRadio('Floorplan').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('level-3d-view')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('level-canvas-wrap'), { key: 'r' });
    fireEvent.click(viewRadio('3D'));
    const view = await screen.findByTestId('level-3d-view');
    expect(view.dataset.enter).toBe('plan');
    // Volume has no 3D form: the switch drops back to Select.
    expect(view.dataset.tool).toBe('select');
    const labels = Array.from(screen.getByRole('radiogroup', { name: 'Tool' }).querySelectorAll('[role=radio]')).map((r) => r.getAttribute('aria-label'));
    expect(labels).toEqual(['Select / Move', 'Place']);
    expect(useLevelViewStore.getState().modeByGame).toEqual({ g1: '3d' });
  });

  it('switching back eases out through the 3D view, then shows the plan', async () => {
    await open3d();
    fireEvent.click(viewRadio('3D'));
    await screen.findByTestId('level-3d-view');
    fireEvent.click(viewRadio('Floorplan'));
    expect(view3d.exits).toBe(1);
    await waitFor(() => expect(screen.queryByTestId('level-3d-view')).toBeNull());
    expect(useLevelViewStore.getState().modeByGame).toEqual({ g1: 'plan' });
    expect(screen.getAllByRole('radio', { name: 'Volume' })).toHaveLength(1);
  });

  it('reopens a game in the view it was left in, straight into orbit', async () => {
    useLevelViewStore.setState({ modeByGame: { g1: '3d' } });
    await open3d();
    const view = await screen.findByTestId('level-3d-view');
    expect(view.dataset.enter).toBe('orbit');
    expect(viewRadio('3D').getAttribute('aria-checked')).toBe('true');
  });

  it('edits made through the 3D view land in the same undo stack and Save', async () => {
    await open3d();
    fireEvent.click(viewRadio('3D'));
    await screen.findByTestId('level-3d-view');
    const props = view3d.props as Level3dViewProps;
    const { gizmoEdit, levelWorldItems } = await import('./3d/level-world');
    const item = levelWorldItems(props.level)[0]!;
    props.update((st) => gizmoEdit(st, item.sel, { centre: [5, 5] }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
  });

  it('a read-only 3D level (not orthogonal) offers no 3D view', async () => {
    useLevelViewStore.setState({ modeByGame: { g1: '3d' } });
    await open3d({ ...blankLevel3d(), orientation: 'isometric' });
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull();
    expect(screen.queryByTestId('level-3d-view')).toBeNull();
  });
});

// Phase 137 Themes B, C and E on the plan view: multi-select, the clipboard keys and the align bar. The 3D plan is used
// because its map pixels equal object coordinates; the 2D canvas shares every code path.
describe('LevelEditor, multi-select, clipboard and align (Phase 137 B, C, E)', () => {
  const entry = () => useLevelStore.getState().byGame.g1!;
  const objects = () => entry().edit.level.layers[0]!.objects!;
  const xs = (ids: number[]) => ids.map((id) => objects().find((o) => o.id === id)!.x);
  const open = async () => {
    get.mockResolvedValue({ ok: true, value: { level: blankLevel3d(), issues: [], images: [] } });
    list.mockResolvedValue(listed({ scenes: [{ scene: 'level', bytes: 1, dimension: '3d', issue: null }] }));
    renderEditor();
    await ready();
    const layerId = entry().edit.level.layers[0]!.id!;
    // Three props at (100,100) (200,100) (400,300), after the template's spawn at (336,336).
    for (const [x, y] of [[100, 100], [200, 100], [400, 300]] as const) useLevelStore.getState().update('g1', (s) => addObject(s, layerId, { type: 'prop', x, y }));
    const ids = objects().filter((o) => o.type === 'prop').map((o) => o.id);
    useLevelStore.getState().update('g1', (s) => selectOnly(s, null));
    return { canvas: screen.getByTestId('level-canvas'), wrap: screen.getByTestId('level-canvas-wrap'), layerId, ids };
  };
  const click = (canvas: HTMLElement, mx: number, my: number, mods: Record<string, boolean> = {}) => {
    fireEvent.pointerDown(canvas, { ...at(mx, my), ...mods });
    fireEvent.pointerUp(canvas, { ...at(mx, my), ...mods });
  };
  const selectedIds = () => entry().edit.selected.map((r) => r.objectId);

  it('C1: clicking empty ground with Select clears the selection', async () => {
    const { canvas, ids } = await open();
    click(canvas, 100, 100);
    expect(selectedIds()).toEqual([ids[0]]);
    click(canvas, 500, 500);
    expect(selectedIds()).toEqual([]);
  });

  it('C2: a marquee selects exactly the objects it fully encloses', async () => {
    const { canvas, ids } = await open();
    fireEvent.pointerDown(canvas, at(50, 50));
    fireEvent.pointerMove(canvas, at(250, 150));
    fireEvent.pointerUp(canvas, at(250, 150));
    expect(selectedIds()).toEqual([ids[0], ids[1]]);
  });

  it('C3: Shift-click adds and Mod-click toggles', async () => {
    const { canvas, ids } = await open();
    click(canvas, 100, 100);
    click(canvas, 200, 100, { shiftKey: true });
    expect(selectedIds()).toEqual([ids[0], ids[1]]);
    click(canvas, 400, 300, { metaKey: true });
    expect(selectedIds()).toEqual([ids[0], ids[1], ids[2]]);
    click(canvas, 100, 100, { metaKey: true });
    expect(selectedIds()).toEqual([ids[1], ids[2]]);
    expect(entry().edit.past).toHaveLength(3);
  });

  it('C4: dragging one of a selected group moves them all, as one undo step', async () => {
    const { canvas, ids } = await open();
    fireEvent.pointerDown(canvas, at(50, 50));
    fireEvent.pointerMove(canvas, at(250, 150));
    fireEvent.pointerUp(canvas, at(250, 150));
    const before = entry().edit.past.length;
    fireEvent.pointerDown(canvas, at(100, 100));
    // The primary snaps to the half-metre grid (16 px), so a 32 px pointer move lands the group 28 px along.
    fireEvent.pointerMove(canvas, at(132, 100));
    fireEvent.pointerUp(canvas, at(132, 100));
    expect(xs([ids[0]!, ids[1]!, ids[2]!])).toEqual([128, 228, 400]);
    expect(entry().edit.past).toHaveLength(before + 1);
    expect(selectedIds()).toEqual([ids[0], ids[1]]);
  });

  it('C5: Mod+A selects the layer, arrows nudge one tile, Shift+arrow ten, Escape clears, Delete removes', async () => {
    const { wrap, ids } = await open();
    fireEvent.keyDown(wrap, { key: 'a', metaKey: true });
    expect(selectedIds()).toHaveLength(objects().length);
    fireEvent.keyDown(wrap, { key: 'ArrowRight' });
    expect(xs([ids[0]!])).toEqual([132]);
    fireEvent.keyDown(wrap, { key: 'ArrowRight', shiftKey: true });
    expect(xs([ids[0]!])).toEqual([452]);
    fireEvent.keyDown(wrap, { key: 'ArrowDown' });
    expect(objects().find((o) => o.id === ids[0])!.y).toBe(132);
    fireEvent.keyDown(wrap, { key: 'Delete' });
    expect(objects()).toHaveLength(0);
    fireEvent.keyDown(wrap, { key: 'z', metaKey: true });
    expect(objects()).toHaveLength(4);
    fireEvent.keyDown(wrap, { key: 'Escape' });
    expect(selectedIds()).toEqual([]);
  });

  it('B6: Mod+D duplicates the selection and Mod+Z removes the copies', async () => {
    const { canvas, wrap, ids } = await open();
    click(canvas, 100, 100);
    const count = objects().length;
    fireEvent.keyDown(wrap, { key: 'd', metaKey: true });
    expect(objects()).toHaveLength(count + 1);
    expect(selectedIds()).not.toContain(ids[0]);
    fireEvent.keyDown(wrap, { key: 'z', metaKey: true });
    expect(objects()).toHaveLength(count);
  });

  it('B: Mod+C then Mod+V pastes at the pointer; Mod+X cuts', async () => {
    const { canvas, wrap, ids } = await open();
    click(canvas, 100, 100);
    fireEvent.keyDown(wrap, { key: 'c', metaKey: true });
    fireEvent.pointerMove(canvas, at(300, 200));
    const count = objects().length;
    fireEvent.keyDown(wrap, { key: 'v', metaKey: true });
    await waitFor(() => expect(objects()).toHaveLength(count + 1));
    expect(objects().at(-1)).toMatchObject({ type: 'prop', x: 304, y: 208 });
    expect(selectedIds()).toEqual([objects().at(-1)!.id]);
    click(canvas, 200, 100);
    fireEvent.keyDown(wrap, { key: 'x', metaKey: true });
    expect(objects().some((o) => o.id === ids[1])).toBe(false);
    fireEvent.keyDown(wrap, { key: 'v', metaKey: true });
    await waitFor(() => expect(objects().at(-1)).toMatchObject({ type: 'prop' }));
  });

  it('B: a clipboard from the other dimension pastes nothing', async () => {
    const { wrap } = await open();
    const clip = { ...(await import('./level-clipboard')).copySelection(entry().edit) ?? { kind: 'midnite-level-clipboard', version: 1, origin: { x: 0, y: 0 }, objects: [{ id: 0, name: 'p', x: 0, y: 0 }] }, dimension: '2d' as const };
    await (await import('./level-clipboard')).writeClipboard(clip as never);
    const count = objects().length;
    fireEvent.keyDown(wrap, { key: 'v', metaKey: true });
    await new Promise((r) => setTimeout(r, 0)); // allow-timeout: let the async clipboard read settle
    expect(objects()).toHaveLength(count);
  });

  it('E4: the align bar shows at two selected objects, distribute waits for three, and aligning is one step', async () => {
    const { canvas, wrap, ids } = await open();
    expect(screen.queryByTestId('level-align-bar')).toBeNull();
    click(canvas, 100, 100);
    expect(screen.queryByTestId('level-align-bar')).toBeNull();
    click(canvas, 200, 100, { shiftKey: true });
    expect(screen.getByTestId('level-align-bar')).toBeTruthy();
    const few = screen.getAllByRole('button', { name: 'Select three or more to distribute' }) as HTMLButtonElement[];
    expect(few).toHaveLength(2);
    expect(few.every((b) => b.disabled)).toBe(true);
    const before = entry().edit.past.length;
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(xs([ids[0]!, ids[1]!])).toEqual([200, 200]);
    expect(entry().edit.past).toHaveLength(before + 1);
    click(canvas, 400, 300, { shiftKey: true });
    expect((screen.getByRole('button', { name: 'Distribute horizontally' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(wrap, { key: 'Escape' });
    expect(screen.queryByTestId('level-align-bar')).toBeNull();
  });
});
