// vitest (node): the map MCP tools over stub services — no Electron, no network, no tiles. Covers the
// gate (through the dispatcher), list, measure, goto (place + point) and that map_capture_terrain
// drives the very capture the Maps tab calls.
import { DEFAULT_MAP_PROJECT, MAP_MCP_TOOL_IDS, MAP_MCP_WRITE_TOOL_IDS, MAPS_OFF_MESSAGE, failure, ok, type MapCaptureRequest, type MapOpenEvent } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchMcpCall } from '../../mcp/dispatch';
import { setMapTools } from '../../mcp/map-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowMapsState } from '../../mcp/ui-gate';
import { geocodePlace } from './geocode';
import { createMapTools } from './map-mcp';

const captureJson = (name: string) =>
  JSON.stringify({
    version: 1, name, center: [18.4, -33.9], sideM: 4000, size: 513, mPerPx: 7.8, bbox: [18.3, -34, 18.5, -33.8],
    heightMinM: 0, heightMaxM: 1085, hasSea: true, sources: { dem: 'aws-terrarium' }, demZoom: 12, attributions: [],
    files: ['heightmap.png', 'heightmap.r32', 'roads.png'], missing: [], capturedAt: '2026-10-08T00:00:00Z',
  });

const layer = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { kind: 'pin', name: 'A' }, geometry: { type: 'Point', coordinates: [18.4, -33.9] } }] });

const files: Record<string, string> = {
  'captures/table-mountain/capture.json': captureJson('table-mountain'),
  'captures/.tmp-abc/capture.json': captureJson('tmp'),
  'captures/broken/capture.json': '{nope',
  'layers/drawings.geojson': layer,
};

const events: MapOpenEvent[] = [];
const captured: MapCaptureRequest[] = [];
const setViews: unknown[] = [];

const tools = createMapTools({
  resolveRepo: async (path) => (path === '/repo' ? { ok: true, repoId: 'r1' } : { ok: false, kind: 'not-found', message: `No open repository at ${path}.` }),
  listProjects: async () => ok([{ name: 'maps' }, { name: 'other' }] as never),
  listFiles: async ({ project }) => ok(project === 'maps' ? Object.keys(files).map((path) => ({ path, mtimeMs: 1 })) : []),
  readText: async ({ path }) => (files[path] !== undefined ? ok(files[path]!) : failure('File not found.')),
  setView: async (req) => {
    setViews.push(req);
    return ok({} as never);
  },
  capture: async (req) => {
    captured.push(req);
    if (req.sideM > 60_000) return failure('A capture is already running.');
    return ok({
      captureId: 'c1', name: 'table-mountain', dir: 'captures/table-mountain',
      capture: JSON.parse(captureJson('table-mountain')),
      ...(req.handoff ? { terrain: { project: 'terrains', terrain: 'table-mountain-1' } } : {}),
    });
  },
  geocode: async (q) => (q === 'Cape Town' ? { name: 'Cape Town, Western Cape, South Africa', center: [18.4232, -33.9258] } : null),
  emitOpen: (event) => events.push(event),
});

beforeEach(() => {
  events.length = 0;
  captured.length = 0;
  setViews.length = 0;
  setMapTools(tools);
  setMcpAllowMapsState(true);
});
afterEach(() => {
  resetMcpAllowUiStateForTests();
  setMapTools(null);
});

describe('the map MCP tools', () => {
  it('refuses the two write tools with the switch off, and still answers the reads', async () => {
    setMcpAllowMapsState(false);
    const inputs: Record<string, unknown> = {
      map_goto: { repoPath: '/repo', center: [0, 0] },
      map_capture_terrain: { repoPath: '/repo', center: [18.4, -33.9], sideM: 4000, size: 513 },
    };
    for (const tool of MAP_MCP_WRITE_TOOL_IDS) expect(await dispatchMcpCall(tool, inputs[tool]), tool).toEqual({ ok: false, kind: 'refused', message: MAPS_OFF_MESSAGE });
    expect(captured).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(await dispatchMcpCall('map_list', { repoPath: '/repo' })).toMatchObject({ ok: true });
    expect(await dispatchMcpCall('map_measure', { points: [[0, 0], [0, 1]] })).toMatchObject({ ok: true });
  });

  it('answers before the services are bound, not with a throw', async () => {
    setMapTools(null);
    expect(await dispatchMcpCall('map_list', { repoPath: '/repo' })).toMatchObject({ ok: false, kind: 'error' });
  });

  it('lists captures and layers, skipping temp and unreadable ones', async () => {
    const res = await dispatchMcpCall('map_list', { repoPath: '/repo' });
    expect(res).toMatchObject({ ok: true });
    const value = (res as { value: { projects: { name: string; captures: { name: string; layers: string[] }[]; layers: { name: string; features: number }[] }[] } }).value;
    expect(value.projects.map((p) => p.name)).toEqual(['maps', 'other']);
    expect(value.projects[0]!.captures).toEqual([expect.objectContaining({ name: 'table-mountain', sideM: 4000, layers: ['heightmap', 'roads'] })]);
    expect(value.projects[0]!.layers).toEqual([{ name: 'drawings', features: 1 }]);
    const one = await dispatchMcpCall('map_list', { repoPath: '/repo', project: 'other' });
    expect((one as { value: { projects: unknown[] } }).value.projects).toHaveLength(1);
  });

  it('is not-found for an unknown repository', async () => {
    expect(await dispatchMcpCall('map_list', { repoPath: '/nope' })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('measures a path leg by leg and a circle with its ring', async () => {
    const path = await tools.map_measure({ points: [[0, 0], [0, 1], [1, 1]] });
    expect(path.legsM).toHaveLength(2);
    expect(path.legsM![0]).toBeGreaterThan(110_000);
    expect(path.legsM![0]).toBeLessThan(112_000);
    expect(path.totalM).toBeCloseTo(path.legsM![0]! + path.legsM![1]!, 6);
    const circle = await tools.map_measure({ center: [18.4, -33.9], radiusM: 1000 });
    expect(circle.ring).toHaveLength(129);
    expect(circle.ring![0]).toEqual(circle.ring![128]);
    expect(circle.circumferenceM).toBeGreaterThan(6200);
    expect(circle.circumferenceM).toBeLessThan(6400);
    expect(circle.areaM2).toBeGreaterThan(3.1e6);
    expect(circle.areaM2).toBeLessThan(3.2e6);
  });

  it('refuses a measure with no shape or two shapes', async () => {
    await expect(tools.map_measure({})).rejects.toThrow(/points/);
    await expect(tools.map_measure({ points: [[0, 0], [1, 1]], center: [0, 0], radiusM: 5 })).rejects.toThrow(/not both/);
    await expect(tools.map_measure({ center: [0, 0] })).rejects.toThrow(/radiusM/);
  });

  it('goes to a place: saves the view, then tells the windows', async () => {
    const res = await tools.map_goto({ repoPath: '/repo', place: 'Cape Town' });
    expect(res).toEqual({ opened: true, center: [18.4232, -33.9258], zoom: 11, place: 'Cape Town, Western Cape, South Africa' });
    expect(setViews).toEqual([{ repoId: 'r1', project: DEFAULT_MAP_PROJECT, patch: { view: { center: [18.4232, -33.9258], zoom: 11, bearing: 0, pitch: 0 } } }]);
    expect(events).toEqual([expect.objectContaining({ repoId: 'r1', project: DEFAULT_MAP_PROJECT, zoom: 11 })]);
  });

  it('goes to a point at the asked zoom, and says so when a place matches nothing', async () => {
    expect(await tools.map_goto({ repoPath: '/repo', center: [10, 20], zoom: 5, project: 'other' })).toEqual({ opened: true, center: [10, 20], zoom: 5 });
    await expect(tools.map_goto({ repoPath: '/repo', place: 'Atlantis' })).rejects.toThrow(/No place matched/);
    await expect(tools.map_goto({ repoPath: '/repo' })).rejects.toThrow(/place name or a center/);
    expect(events).toHaveLength(1);
  });

  it('captures through the same capture call, handing off by default and not building', async () => {
    const res = await tools.map_capture_terrain({ repoPath: '/repo', center: [18.4, -33.9], sideM: 4000, size: 513, place: 'Table Mountain' });
    expect(captured).toEqual([{ repoId: 'r1', project: DEFAULT_MAP_PROJECT, center: [18.4, -33.9], sideM: 4000, size: 513, place: 'Table Mountain', handoff: true, build: false }]);
    expect(res).toMatchObject({ captureId: 'c1', name: 'table-mountain', terrain: { project: 'terrains', terrain: 'table-mountain-1' }, missing: [] });
    const built = await tools.map_capture_terrain({ repoPath: '/repo', center: [0, 0], sideM: 100, size: 129, handoff: false, build: true });
    expect(captured[1]).toMatchObject({ handoff: false, build: true });
    expect(built.terrain).toBeUndefined();
  });

  it('surfaces a failed capture as an error', async () => {
    await expect(tools.map_capture_terrain({ repoPath: '/repo', center: [0, 0], sideM: 65_000, size: 129 })).rejects.toThrow(/already running/);
  });

  it('lists exactly the four tool ids the dispatcher knows', () => {
    expect(MAP_MCP_TOOL_IDS).toHaveLength(4);
  });
});

describe('geocodePlace', () => {
  const reply = (json: unknown, status = 200) => vi.fn(async (_url: string) => ({ ok: status === 200, status, json: async () => json }));

  it('joins the name, region and country, longitude first', async () => {
    const f = reply({ results: [{ name: 'Cape Town', latitude: -33.9258, longitude: 18.4232, admin1: 'Western Cape', country: 'South Africa' }] });
    expect(await geocodePlace('Cape Town', f)).toEqual({ name: 'Cape Town, Western Cape, South Africa', center: [18.4232, -33.9258] });
    expect(f.mock.calls[0]![0]).toContain('count=1');
  });

  it('is null with no match and throws on a failed lookup', async () => {
    expect(await geocodePlace('zzz', reply({}))).toBeNull();
    await expect(geocodePlace('x', reply({}, 500))).rejects.toThrow(/500/);
  });
});
