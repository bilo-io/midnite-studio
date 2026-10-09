import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  checkMapSpec,
  describeMapIssues,
  failure,
  fillMap,
  MAP_COLLISION_IMAGE,
  MAP_FROM_TERRAIN_TILESET,
  MAP_IMPORTED_NO_LAYOUT,
  MAP_MAX_SIDE,
  MAP_MIN_SIDE,
  MAP_NEEDS_ENGINE,
  MAP_NEEDS_TILESET,
  MAP_PROPS_IMAGE,
  mapCellSize,
  mapRepairPrompt,
  ok,
  parseSpriteSpec,
  propsTileset,
  rgbaFromRaster,
  SPRITE_MAP_MAX_REPAIRS,
  SPRITE_SPEC_FILE,
  spriteMapPrompt,
  stackTiles,
  TILESET_COLUMNS,
  TiledTilesetSchema,
  collisionTilesImage,
  type GitOpResult,
  type MapAssetSpec,
  type MapPromptTerrain,
  type MapSpec,
  type MapSpecIssue,
  type ModelEngine,
  type RgbaImage,
  type SpriteAssetSpec,
  type SpriteGenerateRequest,
  type TiledTileset,
  type TilesetSpec,
} from '@midnite/studio-shared';

import { joinWithin } from '../../fs-scope';
import type { LlmCall } from '../model/model-service';
import { extractJson } from '../model/spec-parse';
import { decodePng } from '../png/png-codec';
import type { SpriteJobContext, SpriteJobRunner } from './sprite-service';
import { encodeImage, reportOf } from './tileset';

/**
 * Phase 106 Theme J: maps as Tiled `.tmj`.
 *
 * 1. **Layout.** The engine (Ollama or a roster agent, as Models uses) writes a small `MapSpec` from the
 *    prompt, limited to the terrains of the chosen tileset. A reply zod or `mapSpecIssues` rejects goes
 *    back with one line per issue for up to {@link SPRITE_MAP_MAX_REPAIRS} rounds. A `layout: 'keep'`
 *    job (and `map_patch`) skips this and refills the stored layout.
 * 2. **Fill.** `fillMap` rasterises, autotiles with the tileset's own rules, scatters the decorations and
 *    derives collision — pure, in shared.
 * 3. **Files.** `map.tmj` (every tileset embedded, since Phaser cannot load an external one), plus the
 *    images it names beside it: a copy of the tileset's `tileset.png` and `tileset.tsj`, `collision.png`
 *    and, with decorations, `props.png`.
 */
export type MapDeps = {
  llmCall: LlmCall;
  now?: () => Date;
};

const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

/** Refuses a map job up front. */
export function mapPreflight(spec: SpriteAssetSpec, req: Pick<SpriteGenerateRequest, 'turnaround' | 'layout'>): string | null {
  if (spec.kind !== 'map' || req.turnaround) return null;
  if (spec.imported) return MAP_IMPORTED_NO_LAYOUT;
  if (!spec.tileset) return MAP_NEEDS_TILESET;
  const keep = req.layout === 'keep' && spec.mapSpec !== undefined;
  if (!keep && !spec.engine) return MAP_NEEDS_ENGINE;
  return null;
}

export type MapTilesetSource = { spec: TilesetSpec; tsj: TiledTileset; png: Buffer };

/** The tileset a map names, read from the sprite root (`<root>/tilesets/<asset>/`). */
export async function readMapTileset(root: string, asset: string): Promise<GitOpResult<MapTilesetSource>> {
  const dir = joinWithin(root, `tilesets/${asset}`);
  if (!dir) return failure(MAP_NEEDS_TILESET);
  let spec: SpriteAssetSpec;
  try {
    spec = parseSpriteSpec(JSON.parse(await readFile(join(dir, SPRITE_SPEC_FILE), 'utf8')));
  } catch {
    return failure(`The tileset ${asset} does not exist any more. Choose another.`);
  }
  if (spec.kind !== 'tileset') return failure(`${asset} is not a tileset.`);
  if (spec.fromTerrain) return failure(MAP_FROM_TERRAIN_TILESET);
  try {
    const tsj = TiledTilesetSchema.parse(JSON.parse(await readFile(join(dir, 'tileset.tsj'), 'utf8')));
    const png = await readFile(join(dir, 'tileset.png'));
    return ok({ spec, tsj, png });
  } catch {
    return failure(`Generate the tileset ${spec.name} first.`);
  }
}

/** A prop sheet's drawn props as one image plus the tileset that names them, or `null` when none are drawn. */
export async function readMapProps(root: string, asset: string): Promise<GitOpResult<{ tsj: TiledTileset; png: Buffer } | null>> {
  const dir = joinWithin(root, `objects/${asset}`);
  if (!dir) return ok(null);
  let spec: SpriteAssetSpec;
  try {
    spec = parseSpriteSpec(JSON.parse(await readFile(join(dir, SPRITE_SPEC_FILE), 'utf8')));
  } catch {
    return failure(`The prop sheet ${asset} does not exist any more.`);
  }
  if (spec.kind !== 'prop-sheet') return failure(`${asset} is not a prop sheet.`);
  const cells: Array<{ name: string; image: RgbaImage }> = [];
  for (const prop of spec.props) {
    const bytes = await readFile(join(dir, `props/${prop.name}/000.png`)).catch(() => null);
    if (!bytes) continue;
    const decoded = decodePng(bytes);
    if (decoded.ok) cells.push({ name: prop.name, image: rgbaFromRaster(decoded.image) });
  }
  if (cells.length === 0) return ok(null);
  const sheet = stackTiles(cells, spec.cell[0], spec.cell[1], TILESET_COLUMNS);
  return ok({
    tsj: propsTileset(
      cells.map((c) => c.name),
      spec.cell,
      sheet.columns,
      sheet.image,
    ),
    png: encodeImage(sheet.image),
  });
}

export const mapTerrains = (spec: Pick<TilesetSpec, 'terrains'>): MapPromptTerrain[] => spec.terrains.map((t) => ({ id: t.id, label: t.label, collision: t.collision }));

const clampSide = (n: number): number => Math.min(MAP_MAX_SIDE, Math.max(MAP_MIN_SIDE, Math.round(n)));

/**
 * Asks the engine for a layout and repairs it. Each call counts one request. Answers the layout and
 * how many repair rounds it took, or why it could not get a valid one.
 */
export async function writeMapLayout(
  deps: Pick<MapDeps, 'llmCall'>,
  opts: {
    engine: ModelEngine;
    repoId: string;
    prompt: string;
    terrains: readonly MapPromptTerrain[];
    size: readonly [number, number];
    orientation: 'orthogonal' | 'isometric';
    signal: AbortSignal;
    onRound?: (round: number) => void;
  },
): Promise<GitOpResult<{ spec: MapSpec; repairs: number }>> {
  const base = spriteMapPrompt({ prompt: opts.prompt, terrains: opts.terrains, width: clampSide(opts.size[0]), height: clampSide(opts.size[1]), orientation: opts.orientation });
  let issues: MapSpecIssue[] = [];
  for (let round = 0; round <= SPRITE_MAP_MAX_REPAIRS; round += 1) {
    if (opts.signal.aborted) return failure('cancelled');
    opts.onRound?.(round);
    const reply = await deps.llmCall({ engine: opts.engine, repoId: opts.repoId, prompt: round === 0 ? base : mapRepairPrompt(base, issues), signal: opts.signal, json: true });
    if (!reply.ok) return reply;
    let raw: unknown;
    try {
      raw = extractJson(reply.value.text);
    } catch (error) {
      issues = [{ path: '(reply)', message: error instanceof Error ? error.message : String(error) }];
      continue;
    }
    const checked = checkMapSpec(raw, opts.terrains);
    if (checked.ok) return ok({ spec: { ...checked.spec, orientation: opts.orientation }, repairs: round });
    issues = checked.issues;
  }
  return failure(`The layout still had problems after ${SPRITE_MAP_MAX_REPAIRS} repairs:\n${describeMapIssues(issues)}`);
}

/** Fills `layout` and writes `map.tmj` and the images it names into the map asset. Answers the tile count. */
export async function writeFilledMap(
  ctx: Pick<SpriteJobContext, 'writeAssetFile'>,
  spec: MapAssetSpec,
  layout: MapSpec,
  tileset: MapTilesetSource,
  props: { tsj: TiledTileset; png: Buffer } | null,
): Promise<number> {
  const filled = fillMap(layout, { spec: tileset.spec, tsj: tileset.tsj }, spec.seed, props ? { tsj: props.tsj, density: spec.decorations?.density ?? 0.1 } : undefined);
  const cell = mapCellSize(tileset.spec);
  await ctx.writeAssetFile('tileset.png', tileset.png);
  await ctx.writeAssetFile('tileset.tsj', json(tileset.tsj));
  await ctx.writeAssetFile(MAP_COLLISION_IMAGE, encodeImage(collisionTilesImage(cell.width, cell.height)));
  if (props) await ctx.writeAssetFile(MAP_PROPS_IMAGE, props.png);
  await ctx.writeAssetFile('map.tmj', json(filled.tmj));
  return layout.width * layout.height;
}

export function createMapRunner(deps: MapDeps): SpriteJobRunner {
  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'map') throw new Error('Only a map is built here.');
    const refused = mapPreflight(spec, { layout: ctx.keepLayout ? 'keep' : undefined });
    if (refused) throw new Error(refused);
    const root = dirname(dirname(ctx.dir));
    const total = SPRITE_MAP_MAX_REPAIRS + 3;
    ctx.progress({ done: 0, total, stage: 'processing', frame: 'tileset' });
    const tileset = await readMapTileset(root, spec.tileset!.asset);
    if (!tileset.ok) throw new Error(tileset.kind === 'error' ? tileset.message : 'Could not read the tileset.');
    const props = spec.decorations ? await readMapProps(root, spec.decorations.props.asset) : ok(null);
    if (!props.ok) throw new Error(props.kind === 'error' ? props.message : 'Could not read the prop sheet.');
    if (spec.decorations && !props.value) ctx.note('No props are drawn on that prop sheet yet, so nothing was scattered.');

    const orientation = tileset.value.spec.projection === 'isometric' ? 'isometric' : 'orthogonal';
    let layout: MapSpec;
    if (ctx.keepLayout && spec.mapSpec) {
      layout = { ...spec.mapSpec, orientation };
    } else {
      const written = await writeMapLayout(deps, {
        engine: spec.engine!,
        repoId: ctx.target.repoId,
        prompt: spec.prompt,
        terrains: mapTerrains(tileset.value.spec),
        size: spec.mapSpec ? [spec.mapSpec.width, spec.mapSpec.height] : spec.size,
        orientation,
        signal: ctx.signal,
        onRound: (round) => {
          ctx.countRequest();
          ctx.progress({ done: round, total, stage: 'generating', frame: round === 0 ? 'layout' : `repair ${round}` });
        },
      });
      if (!written.ok) throw new Error(written.kind === 'error' ? written.message : 'The layout failed.');
      layout = written.value.spec;
      if (written.value.repairs > 0) ctx.note(`The layout took ${written.value.repairs} repair ${written.value.repairs === 1 ? 'round' : 'rounds'}.`);
      await ctx.updateAsset((current) => (current.kind === 'map' ? { ...current, mapSpec: layout } : current));
    }
    if (ctx.signal.aborted) throw new Error('cancelled');
    ctx.progress({ done: total - 1, total, stage: 'packing' });
    const tiles = await writeFilledMap(ctx, spec, layout, tileset.value, props.value);
    await reportOf(ctx, deps, tiles, 0);
    ctx.progress({ done: total, total, stage: 'packing' });
  };
}
