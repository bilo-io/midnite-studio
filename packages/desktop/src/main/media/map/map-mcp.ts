import {
  DEFAULT_MAP_PROJECT,
  MapCaptureFileSchema,
  map,
  parseLayer,
  type GitOpResult,
  type MapCaptureRequest,
  type MapCaptureResult,
  type MapOpenEvent,
  type McpToolInput,
  type McpToolOutput,
  type MediaProject,
  type MapProjectGetResult,
  type MapProjectPatch,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';

/**
 * The `map_*` MCP tools' implementations (Media ▸ Maps, Phase 108 Theme I).
 *
 * Deliberately **ungated**: the app's global MCP server wraps `map_goto` and `map_capture_terrain` in
 * the `allowMaps` switch (`main/mcp/map-tools.ts`). Every tool is a thin adapter over the services the
 * Maps tab itself calls — `map_capture_terrain` runs the identical `captureService.capture` (and its
 * Terrain hand-off), so it never drifts from the button. What is added here is what an agent needs and
 * a window does not: addressing by `repoPath` and a place name instead of a click.
 *
 * Every dependency is injected, so the whole surface is tested without Electron or the network.
 */
type Scope = { repoId: string; tab: 'map'; project: string };

export type MapMcpDeps = {
  /** `repoPath` → the open repository's id, or the refusal to answer with. */
  resolveRepo: (repoPath: string) => Promise<{ ok: true; repoId: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  listProjects: (repoId: string) => Promise<GitOpResult<MediaProject[]>>;
  listFiles: (scope: Scope) => Promise<GitOpResult<{ path: string; mtimeMs: number }[]>>;
  readText: (req: { repoId: string; project: string; path: string }) => Promise<GitOpResult<string>>;
  /** Persists the view, so a Maps tab opened later starts there. */
  setView: (req: { repoId: string; project: string; patch: MapProjectPatch }) => Promise<GitOpResult<MapProjectGetResult>>;
  /** The Maps tab's capture, hand-off included. */
  capture: (req: MapCaptureRequest) => Promise<GitOpResult<MapCaptureResult>>;
  /** A place name → `[lon, lat]` (the geocoder the search box uses), or null when nothing matched. */
  geocode: (query: string) => Promise<{ name: string; center: [number, number] } | null>;
  /** Asks every window to show the new view. */
  emitOpen: (event: MapOpenEvent) => void;
};

/** Per project, so a repo with thousands of captures or layers is still one prompt-sized answer. */
const LIST_LIMIT = 100;
const GOTO_DEFAULT_ZOOM = { place: 11, point: 12 } as const;
const CAPTURE_JSON = /^captures\/([^/.][^/]*)\/capture\.json$/;
const LAYER_FILE = /^layers\/([^/]+)\.geojson$/;

const message = (r: { ok: false; kind: string } & Partial<{ message: string }>, fallback: string): string => r.message ?? fallback;

export function createMapTools(deps: MapMcpDeps) {
  async function repoFor(repoPath: string): Promise<string> {
    const resolved = await deps.resolveRepo(repoPath);
    if (!resolved.ok) throw new McpToolError(resolved.kind, resolved.message);
    return resolved.repoId;
  }

  async function map_list(input: McpToolInput<'map_list'>): Promise<McpToolOutput<'map_list'>> {
    const repoId = await repoFor(input.repoPath);
    const listed = await deps.listProjects(repoId);
    if (!listed.ok) throw new McpToolError('error', message(listed, 'Could not list projects.'));
    const names = listed.value.map((p) => p.name).filter((name) => input.project === undefined || name === input.project);
    const projects: McpToolOutput<'map_list'>['projects'] = [];
    for (const name of names) {
      const files = await deps.listFiles({ repoId, tab: 'map', project: name });
      const entries = files.ok ? files.value : [];
      const captures: McpToolOutput<'map_list'>['projects'][number]['captures'] = [];
      for (const file of entries.filter((f) => CAPTURE_JSON.test(f.path)).slice(0, LIST_LIMIT)) {
        const text = await deps.readText({ repoId, project: name, path: file.path });
        if (!text.ok) continue;
        let json: unknown;
        try {
          json = JSON.parse(text.value);
        } catch {
          continue;
        }
        const parsed = MapCaptureFileSchema.safeParse(json);
        if (!parsed.success) continue;
        const c = parsed.data;
        const layers = (['heightmap', 'satellite', 'roads'] as const).filter((slot) => c.files.some((f) => f.includes(slot)));
        captures.push({
          name: CAPTURE_JSON.exec(file.path)![1]!,
          center: c.center,
          sideM: c.sideM,
          size: c.size,
          heightMinM: c.heightMinM,
          heightMaxM: c.heightMaxM,
          capturedAt: c.capturedAt,
          layers,
        });
      }
      const layers: McpToolOutput<'map_list'>['projects'][number]['layers'] = [];
      for (const file of entries.filter((f) => LAYER_FILE.test(f.path)).slice(0, LIST_LIMIT)) {
        const text = await deps.readText({ repoId, project: name, path: file.path });
        const parsed = text.ok ? parseLayer(text.value) : null;
        layers.push({ name: LAYER_FILE.exec(file.path)![1]!, features: parsed?.features.length ?? 0 });
      }
      projects.push({ name, captures, layers });
    }
    return { projects };
  }

  async function map_measure(input: McpToolInput<'map_measure'>): Promise<McpToolOutput<'map_measure'>> {
    const wantsCircle = input.center !== undefined || input.radiusM !== undefined;
    if (input.points && wantsCircle) throw new McpToolError('error', 'Give either points (a path) or center and radiusM (a circle), not both.');
    if (input.points) {
      const legsM = map.pathLegsM(input.points);
      return { legsM, totalM: legsM.reduce((sum, leg) => sum + leg, 0) };
    }
    if (input.center && input.radiusM !== undefined) {
      const ring = map.geodesicCircle(input.center, input.radiusM);
      const area = map.polygonMeasure(ring);
      return {
        ring,
        circumferenceM: map.pathLegsM(ring).reduce((sum, leg) => sum + leg, 0),
        ...(area ? { areaM2: area.areaM2 } : {}),
      };
    }
    throw new McpToolError('error', 'Give points (a path of at least two) or center and radiusM (a circle).');
  }

  async function map_goto(input: McpToolInput<'map_goto'>): Promise<McpToolOutput<'map_goto'>> {
    const repoId = await repoFor(input.repoPath);
    if (input.place === undefined && input.center === undefined) throw new McpToolError('error', 'Give a place name or a center [lon, lat].');
    let center = input.center;
    let place: string | undefined;
    if (!center) {
      const found = await deps.geocode(input.place!);
      if (!found) throw new McpToolError('not-found', `No place matched "${input.place}". Try a more specific name or pass center.`);
      center = found.center;
      place = found.name;
    }
    const zoom = input.zoom ?? (place ? GOTO_DEFAULT_ZOOM.place : GOTO_DEFAULT_ZOOM.point);
    const project = input.project ?? DEFAULT_MAP_PROJECT;
    const saved = await deps.setView({ repoId, project, patch: { view: { center, zoom, bearing: 0, pitch: 0 } } });
    if (!saved.ok) throw new McpToolError('error', message(saved, 'Could not save the map view.'));
    deps.emitOpen({ repoId, project, center, zoom, ...(place ? { place } : {}) });
    return { opened: true, center, zoom, ...(place ? { place } : {}) };
  }

  async function map_capture_terrain(input: McpToolInput<'map_capture_terrain'>): Promise<McpToolOutput<'map_capture_terrain'>> {
    const repoId = await repoFor(input.repoPath);
    const result = await deps.capture({
      repoId,
      project: input.project ?? DEFAULT_MAP_PROJECT,
      center: input.center,
      sideM: input.sideM,
      size: input.size,
      ...(input.place !== undefined ? { place: input.place } : {}),
      handoff: input.handoff ?? true,
      build: input.build ?? false,
    });
    if (!result.ok) throw new McpToolError('error', message(result, 'The capture failed.'));
    const { captureId, name, capture, terrain } = result.value;
    return { captureId, name, capture, ...(terrain ? { terrain } : {}), missing: capture.missing };
  }

  return { map_list, map_measure, map_goto, map_capture_terrain };
}

export type MapTools = ReturnType<typeof createMapTools>;
