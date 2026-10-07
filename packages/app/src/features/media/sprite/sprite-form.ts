import {
  imageModelSupportsReference,
  imageModelsFor,
  imageProviderInfo,
  imageReferenceUnsupportedReason,
  defaultSpriteCamera,
  oneShotAspect,
  oneShotBlocker,
  oneShotGrid,
  oneShotRows,
  presetClips,
  recommendSpriteMethod,
  backgroundBlocker,
  BACKGROUND_SCROLL_DEFAULTS,
  SPRITE_NEEDS_MODEL,
  SpriteAssetSpecSchema,
  spriteSlug,
  tilesetBlocker,
  type BackgroundLayer,
  type ImageProviderId,
  type SpriteClip,
  type SpriteMethod,
  type SpritePerspective,
  type SpriteRenderSettings,
  type SpriteProp,
  type SpriteStyle,
  type TilesetCollision,
  type TilesetScheme,
} from '@midnite/studio-shared';

/** The Sheet form's state. Pure data, so the spec it becomes and the reasons it blocks are testable. */
export type SheetForm = {
  name: string;
  category: 'character' | 'object';
  style: SpriteStyle;
  perspective: SpritePerspective;
  frameW: number;
  frameH: number;
  directions: 1 | 4 | 8;
  prompt: string;
  method: SpriteMethod;
  /** Set once the user picks a card themselves, so a later perspective change stops re-recommending. */
  methodChosen: boolean;
  clips: SpriteClip[];
  /** Set once the user edits a clip, so a perspective change asks before replacing them. */
  clipsEdited: boolean;
  provider: ImageProviderId;
  model: string;
  /** A Models design (`<project>`, the design file's path inside it), for rendering from 3D. */
  rig?: { project: string; path: string };
  /** Rendering from 3D: camera, shading, outline and supersampling. `camera` follows the perspective until changed. */
  render: Omit<SpriteRenderSettings, 'fps'>;
  /** Set once the user picks a camera themselves, so a perspective change stops moving it. */
  cameraChosen: boolean;
  /** Hand-drawn: score each frame against the reference with a local vision model. */
  checkConsistency: boolean;
  /** Hand-drawn side sheets: "My character is asymmetric" — draw the west facing instead of mirroring. */
  asymmetric: boolean;
};

/** Hand-drawn frames are drawn against a reference image, so they start on a provider that can take one. */
export const SPRITE_DEFAULT_PROVIDER: ImageProviderId = 'gemini';

/** Whether a provider (and model) can draw reference-locked hand-drawn frames. */
export const referenceCapable = (provider: ImageProviderId, model: string): boolean => imageModelSupportsReference(provider, model);

/**
 * With the hand-drawn method, a provider or model that cannot take a reference is swapped for the
 * first one that can — the picker shows the others disabled with the reason.
 */
export function withReferenceProvider(form: SheetForm): SheetForm {
  if (form.method !== 'hand-drawn' || referenceCapable(form.provider, form.model)) return form;
  if (imageProviderInfo(form.provider).supportsReference) {
    const model = imageModelsFor(form.provider).find((m) => referenceCapable(form.provider, m.id));
    if (model) return { ...form, model: model.id };
  }
  return { ...form, provider: SPRITE_DEFAULT_PROVIDER, model: imageModelsFor(SPRITE_DEFAULT_PROVIDER).find((m) => referenceCapable(SPRITE_DEFAULT_PROVIDER, m.id))?.id ?? '' };
}

/** The picker's reason a provider is disabled for the current method, or `null`. */
export function providerBlockedFor(method: SpriteMethod, provider: ImageProviderId): string | null {
  if (method !== 'hand-drawn' || imageProviderInfo(provider).supportsReference) return null;
  return imageReferenceUnsupportedReason(imageProviderInfo(provider).label);
}

/** A 1-direction side sheet mirrors east into west; the asymmetric toggle only applies there. */
export const mirrorApplies = (form: Pick<SheetForm, 'perspective' | 'directions' | 'method'>): boolean =>
  form.method === 'hand-drawn' && form.perspective === 'side' && form.directions === 1;

export const FRAME_SIZE_PRESETS = [16, 32, 48, 64, 96, 128] as const;

export function initialSheetForm(provider: ImageProviderId, model: string): SheetForm {
  const base = { style: 'pixel', perspective: 'side', directions: 1 } as const;
  return {
    name: '',
    category: 'character',
    ...base,
    frameW: 64,
    frameH: 64,
    prompt: '',
    method: recommendSpriteMethod({ targetPerspective: base.perspective, directions: base.directions, style: base.style }).method,
    methodChosen: false,
    clips: presetClips('side'),
    clipsEdited: false,
    provider,
    model,
    checkConsistency: true,
    asymmetric: false,
    render: { camera: defaultSpriteCamera(base.perspective), elevationDeg: 0, azimuthDeg: 0, shading: 'lit', outline: false, supersample: 4 },
    cameraChosen: false,
  };
}

/** What the form's current answers recommend. */
export const formRecommendation = (form: SheetForm) =>
  recommendSpriteMethod({
    targetPerspective: form.perspective,
    directions: form.directions,
    style: form.style,
    ...(form.rig ? { reference: { kind: 'model' as const, project: form.rig.project, path: form.rig.path } } : {}),
  });

/** The `sprite.json` a form creates. */
export function sheetFormToSpec(form: SheetForm): Record<string, unknown> {
  return {
    kind: 'sheet',
    name: form.name.trim(),
    category: form.category,
    prompt: form.prompt.trim(),
    style: form.style,
    targetPerspective: form.perspective,
    frameSize: [form.frameW, form.frameH],
    directions: form.directions,
    method: form.method,
    clips: form.clips,
    provider: form.provider,
    ...(form.model ? { model: form.model } : {}),
    ...(form.rig ? { reference: { kind: 'model', project: form.rig.project, path: form.rig.path } } : {}),
    ...(form.method === 'rendered' ? { render: form.render } : {}),
    consistency: { enabled: form.checkConsistency },
    mirror: !form.asymmetric,
  };
}

/** One-shot (Theme F): the grid a form would ask for, its aspect, and why it is refused (`null` when it fits). */
export function formOneShot(form: Pick<SheetForm, 'clips' | 'directions' | 'perspective' | 'asymmetric' | 'frameW' | 'frameH'>) {
  const rows = oneShotRows({ clips: form.clips, directions: form.directions, targetPerspective: form.perspective, mirror: !form.asymmetric });
  const grid = oneShotGrid({ frameSize: [form.frameW, form.frameH] }, rows);
  return { rows, grid, aspect: oneShotAspect(grid), blocked: oneShotBlocker(grid) };
}

/** Why Generate cannot run, or `null`. Rendering from 3D with no model swaps the button instead (see `needsRig`). */
export function sheetBlockedReason(form: SheetForm): string | null {
  if (form.name.trim().length === 0) return 'Name the sprite first.';
  if (form.clips.length === 0) return 'Add at least one clip.';
  if (form.clips.some((c) => !/^[a-z][a-z0-9-]{0,31}$/.test(c.name))) return 'Clip names are lower-case letters, digits and dashes.';
  if (new Set(form.clips.map((c) => c.name)).size !== form.clips.length) return 'Clip names must be unique.';
  if (form.method !== 'rendered' && form.prompt.trim().length === 0) return 'Describe what to draw.';
  if (form.method === 'one-shot') {
    const blocked = formOneShot(form).blocked;
    if (blocked) return blocked;
  }
  if (form.method === 'hand-drawn' && !referenceCapable(form.provider, form.model)) {
    return imageReferenceUnsupportedReason(form.provider === 'gemini' ? 'Imagen' : imageProviderInfo(form.provider).label);
  }
  return null;
}

/** Rendering from 3D needs a rigged Models asset; with none, the form offers to attach one. */
export const needsRig = (form: SheetForm): boolean => form.method === 'rendered' && !form.rig;
export const NEEDS_RIG_MESSAGE = SPRITE_NEEDS_MODEL;

export type EnvKind = 'tileset' | 'isometric' | 'background' | 'prop-sheet' | 'map';
export const ENV_KINDS: ReadonlyArray<{ id: EnvKind; label: string }> = [
  { id: 'tileset', label: 'Tileset' },
  { id: 'isometric', label: 'Isometric tiles' },
  { id: 'background', label: 'Parallax background' },
  { id: 'prop-sheet', label: 'Prop sheet' },
  { id: 'map', label: 'Map' },
];

/** One terrain of a tileset form. */
export type EnvTerrainRow = { id: string; label: string; prompt: string; collision: TilesetCollision };

/** Terrains the form offers to add, with the collision each usually wants. */
export const TERRAIN_PRESETS: ReadonlyArray<EnvTerrainRow> = [
  { id: 'grass', label: 'Grass', prompt: 'lush grass', collision: 'walkable' },
  { id: 'dirt', label: 'Dirt', prompt: 'packed dirt', collision: 'walkable' },
  { id: 'sand', label: 'Sand', prompt: 'dry sand', collision: 'walkable' },
  { id: 'water', label: 'Water', prompt: 'shallow water with ripples', collision: 'water' },
  { id: 'stone', label: 'Stone', prompt: 'grey cobblestone', collision: 'solid' },
  { id: 'snow', label: 'Snow', prompt: 'fresh snow', collision: 'walkable' },
  { id: 'lava', label: 'Lava', prompt: 'cooling lava rock', collision: 'solid' },
  { id: 'forest', label: 'Forest floor', prompt: 'leaf litter and moss', collision: 'walkable' },
];

export type EnvForm = {
  kind: EnvKind;
  name: string;
  prompt: string;
  style: SpriteStyle;
  provider: ImageProviderId;
  model: string;
  tileSize: number;
  scheme: TilesetScheme;
  terrains: EnvTerrainRow[];
  transitions: Array<{ a: string; b: string }>;
  /** Tileset only: render a Phase 105 terrain into a tile grid instead of generating terrain tiles. */
  fromTerrain: { project: string; terrain: string; metresPerTile: number } | null;
  bgSize: [number, number];
  layers: BackgroundLayer[];
  cell: [number, number];
  /** Prop sheet: one prop per line, `name: description` or just a description. */
  propsText: string;
};

export function initialEnvForm(provider: ImageProviderId = SPRITE_DEFAULT_PROVIDER, model?: string): EnvForm {
  return {
    kind: 'tileset',
    name: '',
    prompt: '',
    style: 'pixel',
    provider,
    model: model ?? imageModelsFor(provider)[0]?.id ?? '',
    tileSize: 32,
    scheme: 'blob47',
    terrains: TERRAIN_PRESETS.slice(0, 2).map((t) => ({ ...t })),
    transitions: [{ a: 'grass', b: 'dirt' }],
    fromTerrain: null,
    bgSize: [1920, 1080],
    layers: BACKGROUND_SCROLL_DEFAULTS.map((l) => ({ ...l })),
    cell: [64, 64],
    propsText: 'crate: a wooden crate\nbarrel: an oak barrel\nsign: a wooden signpost',
  };
}

/** `crate: a wooden crate` → `{ name: 'crate', prompt: 'a wooden crate' }`; a bare line names itself. */
export function parsePropLines(text: string): SpriteProp[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      const head = colon > 0 ? line.slice(0, colon) : line;
      const prompt = (colon > 0 ? line.slice(colon + 1) : line).trim() || head;
      const slug = spriteSlug(head);
      return { name: /^[a-z]/.test(slug) ? slug : `prop-${slug}`, prompt };
    });
}

export function envFormToSpec(form: EnvForm): Record<string, unknown> {
  const common = { name: form.name.trim(), prompt: form.prompt.trim(), style: form.style, provider: form.provider, ...(form.model ? { model: form.model } : {}) };
  switch (form.kind) {
    case 'tileset':
    case 'isometric':
      return {
        kind: 'tileset',
        ...common,
        projection: form.kind === 'isometric' ? 'isometric' : 'orthogonal',
        tileSize: form.tileSize,
        scheme: form.scheme,
        terrains: form.terrains,
        transitions: form.transitions,
        ...(form.fromTerrain ? { fromTerrain: form.fromTerrain } : {}),
      };
    case 'background':
      return { kind: 'background', ...common, size: form.bgSize, layers: form.layers };
    case 'prop-sheet':
      return { kind: 'prop-sheet', ...common, cell: form.cell, props: parsePropLines(form.propsText) };
    case 'map':
      return { kind: 'map', ...common, tileSize: form.tileSize };
  }
}

/** Why the environment form cannot create yet, or `null`. */
export function envBlockedReason(form: EnvForm): string | null {
  if (form.name.trim().length === 0) return 'Name the asset first.';
  const spec = envFormToSpec(form);
  if (form.kind === 'tileset' || form.kind === 'isometric') {
    if (form.fromTerrain && (!form.fromTerrain.project || !form.fromTerrain.terrain)) return 'Pick a terrain to render.';
    const blocked = tilesetBlocker({ terrains: form.terrains, transitions: form.transitions, ...(form.fromTerrain ? { fromTerrain: form.fromTerrain } : {}) });
    if (blocked) return blocked;
  }
  if (form.kind === 'background') {
    const blocked = backgroundBlocker({ layers: form.layers });
    if (blocked) return blocked;
  }
  if (form.kind === 'prop-sheet') {
    const props = parsePropLines(form.propsText);
    if (props.length === 0) return 'Add at least one prop.';
    const dup = props.map((p) => p.name).find((n, i, all) => all.indexOf(n) !== i);
    if (dup) return `Two props are called ${dup}.`;
  }
  const parsed = SpriteAssetSpecSchema.safeParse(spec);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the form.');
}

/** Kinds whose Generate runs a job (a map is created only, until Theme J). */
export const envGenerates = (kind: EnvKind): boolean => kind !== 'map';
