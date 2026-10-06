import {
  imageModelSupportsReference,
  imageModelsFor,
  imageProviderInfo,
  imageReferenceUnsupportedReason,
  presetClips,
  recommendSpriteMethod,
  SPRITE_NEEDS_MODEL,
  type ImageProviderId,
  type SpriteClip,
  type SpriteMethod,
  type SpritePerspective,
  type SpriteStyle,
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
  /** A Models asset (`<project>`, `<path>`), for rendering from 3D. */
  rig?: { project: string; path: string };
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
    consistency: { enabled: form.checkConsistency },
    mirror: !form.asymmetric,
  };
}

/** Why Generate cannot run, or `null`. Rendering from 3D with no model swaps the button instead (see `needsRig`). */
export function sheetBlockedReason(form: SheetForm): string | null {
  if (form.name.trim().length === 0) return 'Name the sprite first.';
  if (form.clips.length === 0) return 'Add at least one clip.';
  if (form.clips.some((c) => !/^[a-z][a-z0-9-]{0,31}$/.test(c.name))) return 'Clip names are lower-case letters, digits and dashes.';
  if (new Set(form.clips.map((c) => c.name)).size !== form.clips.length) return 'Clip names must be unique.';
  if (form.method !== 'rendered' && form.prompt.trim().length === 0) return 'Describe what to draw.';
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

export type EnvForm = { kind: EnvKind; name: string; prompt: string; style: SpriteStyle; tileSize: number };

export const initialEnvForm = (): EnvForm => ({ kind: 'tileset', name: '', prompt: '', style: 'pixel', tileSize: 32 });

export function envFormToSpec(form: EnvForm): Record<string, unknown> {
  const common = { name: form.name.trim(), prompt: form.prompt.trim(), style: form.style };
  switch (form.kind) {
    case 'tileset':
      return { kind: 'tileset', ...common, tileSize: form.tileSize };
    case 'isometric':
      return { kind: 'tileset', ...common, projection: 'isometric', tileSize: form.tileSize };
    case 'background':
      return { kind: 'background', ...common };
    case 'prop-sheet':
      return { kind: 'prop-sheet', ...common };
    case 'map':
      return { kind: 'map', ...common, tileSize: form.tileSize };
  }
}

export const envBlockedReason = (form: EnvForm): string | null => (form.name.trim().length === 0 ? 'Name the asset first.' : null);
