import { MapSpecSchema, type MapSpec, type TilesetCollision } from '../media-sprite';

/**
 * The layout prompt for a map (Phase 106 Theme J) and the checks a reply must pass. The LLM writes a
 * small {@link MapSpec}; anything zod or {@link mapSpecIssues} rejects goes back to it as one line per
 * issue for up to `SPRITE_MAP_MAX_REPAIRS` rounds — the loop Models uses to repair designs.
 */
export type MapPromptTerrain = { id: string; label: string; collision: TilesetCollision };

export function spriteMapPrompt(opts: { prompt: string; terrains: readonly MapPromptTerrain[]; width: number; height: number; orientation: 'orthogonal' | 'isometric' }): string {
  const terrains = opts.terrains.map((t) => `- ${t.id} (${t.label}, ${t.collision})`).join('\n');
  return [
    'You lay out a 2D game map as JSON. Answer with ONE JSON object and nothing else.',
    '',
    `The map: ${opts.prompt.trim() || 'a small, varied level'}`,
    `Size: ${opts.width} × ${opts.height} tiles, ${opts.orientation}. Coordinates are tile units, x to the right, y down, from 0.`,
    'Terrains — use ONLY these ids:',
    terrains,
    '',
    'Shape:',
    '{',
    `  "width": ${opts.width}, "height": ${opts.height}, "orientation": "${opts.orientation}",`,
    '  "base": "<terrain id that fills the map>",',
    '  "regions": [{ "terrain": "<id>", "shape": "rect" | "ellipse" | "polygon", "points": [[x, y], ...] }],',
    '  "rooms": [{ "x": 0, "y": 0, "w": 6, "h": 4, "terrain": "<id, optional>" }],',
    '  "corridors": [{ "from": [x, y], "to": [x, y], "width": 1, "terrain": "<id>" }],',
    '  "paths": [{ "points": [[x, y], [x, y], ...], "terrain": "<id>" }],',
    '  "objects": [{ "type": "spawn" | "exit" | "point", "name": "player", "x": 0, "y": 0 }]',
    '}',
    'Rules: rect points are two opposite corners; ellipse points are the centre then the two radii; polygon is 3+ vertices.',
    'Later layers paint over earlier ones (base, regions, rooms, corridors, paths). Rooms and corridors are optional.',
    'Put exactly one "spawn" and at least one "exit" on walkable ground, inside the map. Keep it under 40 shapes.',
  ].join('\n');
}

export type MapSpecIssue = { path: string; message: string };

/** Problems zod cannot see: unknown terrains, shapes with the wrong point count, objects off the map, duplicate object names. */
export function mapSpecIssues(spec: MapSpec, terrains: readonly MapPromptTerrain[]): MapSpecIssue[] {
  const ids = terrains.map((t) => t.id);
  const issues: MapSpecIssue[] = [];
  const known = (path: string, id: string | undefined) => {
    if (id !== undefined && !ids.includes(id)) issues.push({ path, message: `"${id}" is not in this tileset (${ids.join(', ')})` });
  };
  known('base', spec.base);
  spec.regions.forEach((r, i) => {
    known(`regions[${i}].terrain`, r.terrain);
    if ((r.shape === 'rect' || r.shape === 'ellipse') && r.points.length !== 2) issues.push({ path: `regions[${i}].points`, message: `a ${r.shape} takes exactly 2 points` });
    if (r.shape === 'polygon' && r.points.length < 3) issues.push({ path: `regions[${i}].points`, message: 'a polygon takes 3 or more points' });
  });
  spec.rooms?.forEach((r, i) => known(`rooms[${i}].terrain`, r.terrain));
  spec.corridors?.forEach((c, i) => known(`corridors[${i}].terrain`, c.terrain));
  spec.paths?.forEach((p, i) => known(`paths[${i}].terrain`, p.terrain));
  spec.cells?.forEach((c, i) => known(`cells[${i}].terrain`, c.terrain));
  spec.objects.forEach((o, i) => {
    if (o.x < 0 || o.y < 0 || o.x >= spec.width || o.y >= spec.height) issues.push({ path: `objects[${i}]`, message: `(${o.x}, ${o.y}) is outside the ${spec.width} × ${spec.height} map` });
  });
  const names = spec.objects.map((o) => o.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) issues.push({ path: 'objects', message: `two objects are called "${dup}"` });
  return issues;
}

/** One line per issue, as a repair round sends them back. */
export const describeMapIssues = (issues: readonly MapSpecIssue[], limit = 8): string =>
  [...issues.slice(0, limit).map((i) => `- ${i.path}: ${i.message}`), ...(issues.length > limit ? [`- …and ${issues.length - limit} more`] : [])].join('\n');

/** A reply's JSON (already extracted) checked against the schema and the tileset. */
export function checkMapSpec(raw: unknown, terrains: readonly MapPromptTerrain[]): { ok: true; spec: MapSpec } | { ok: false; issues: MapSpecIssue[] } {
  const parsed = MapSpecSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map((p, k) => (typeof p === 'number' ? `[${p}]` : `${k === 0 ? '' : '.'}${p}`)).join(''), message: i.message })) };
  const issues = mapSpecIssues(parsed.data, terrains);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, spec: parsed.data };
}

export const mapRepairPrompt = (original: string, issues: readonly MapSpecIssue[]): string =>
  `${original}\n\nYour last answer had these problems:\n${describeMapIssues(issues)}\nAnswer again with the whole corrected JSON object only.`;
