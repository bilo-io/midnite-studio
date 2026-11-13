import { GameSceneNameSchema, GAME_LEVEL_PROPS, TILED_APP_VERSION, TILED_VERSION, type GamePerspective } from '@midnite/studio-shared';

import { cellCentre, type EditLevel } from './level-edit-model';

export type SceneDefaults = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: 'orthogonal' | 'isometric';
  /** `null` for a 3D scene: it has object layers only (Decision 3). */
  baseLayer: 'ground' | 'walls' | null;
};

/** A new scene's size, tile size and orientation by the game's perspective (Phase 132 Themes D and E). A 3D scene is 80 x 80 tiles of 32 px at one metre a tile. */
export function sceneDefaults(perspective: GamePerspective | null | undefined): SceneDefaults {
  switch (perspective) {
    case 'platformer':
      return { width: 50, height: 17, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: 'ground' };
    case 'isometric':
      return { width: 20, height: 20, tilewidth: 64, tileheight: 32, orientation: 'isometric', baseLayer: 'ground' };
    case 'raycaster':
      return { width: 24, height: 12, tilewidth: 64, tileheight: 64, orientation: 'orthogonal', baseLayer: 'walls' };
    case 'first-person':
    case 'third-person':
      return { width: 80, height: 80, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null };
    default:
      return { width: 40, height: 30, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: 'ground' };
  }
}

/** The error under the name field, or `null` when it can be created. */
export function validateSceneName(name: string, existing: readonly string[]): string | null {
  const parsed = GameSceneNameSchema.safeParse(name);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Not a valid scene name.';
  return existing.includes(name) ? `A scene named "${name}" already exists.` : null;
}

/** A blank scene: a base tile layer, a `collision` tile layer and an `objects` layer with one `spawn` (a 3D scene has the objects layer only, plus its dimension and scale). No tileset (the template's palette is Theme F's). */
export function buildBlankLevel(input: { width: number; height: number; tilewidth: number; tileheight: number; orientation: 'orthogonal' | 'isometric'; baseLayer: 'ground' | 'walls' | null }): EditLevel {
  const { width, height, tilewidth, tileheight, orientation } = input;
  const tileLayer = (id: number, name: string) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width, height, opacity: 1, visible: true, data: new Array<number>(width * height).fill(0) });
  const centre = cellCentre({ orientation, height, tilewidth, tileheight }, { x: Math.floor(width / 2), y: Math.floor(height / 2) });
  return {
    type: 'map',
    version: TILED_VERSION,
    tiledversion: TILED_APP_VERSION,
    orientation,
    renderorder: 'right-down',
    infinite: false,
    width,
    height,
    tilewidth,
    tileheight,
    nextlayerid: 4,
    nextobjectid: 2,
    layers: [
      ...(input.baseLayer === null ? [] : [tileLayer(1, input.baseLayer), tileLayer(2, 'collision')]),
      {
        id: 3,
        name: 'objects',
        type: 'objectgroup',
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        draworder: 'topdown',
        objects: [{ id: 1, name: 'spawn', type: 'spawn', x: centre.x, y: centre.y, width: 0, height: 0, rotation: 0, visible: true, point: true }],
      },
    ],
    tilesets: [],
    properties: [
      { name: GAME_LEVEL_PROPS.level, type: 'int', value: 1 },
      ...(input.baseLayer === null
        ? [
            { name: GAME_LEVEL_PROPS.dimension, type: 'string', value: '3d' },
            { name: GAME_LEVEL_PROPS.metresPerTile, type: 'float', value: 1 },
          ]
        : []),
    ],
  } as EditLevel;
}

/**
 * A map imported as an asset, copied into `levels/`: its tileset `image` paths were relative to
 * `assets/map/<name>/`, so they become relative to `levels/`.
 */
export function rewriteTilesetImages(level: EditLevel, assetName: string): EditLevel {
  return {
    ...level,
    tilesets: level.tilesets.map((t) => (typeof t.image === 'string' && !/^(?:[a-z]+:|\/)/i.test(t.image) ? { ...t, image: `../assets/map/${assetName}/${t.image.replace(/^\.\//, '')}` } : t)),
  };
}
