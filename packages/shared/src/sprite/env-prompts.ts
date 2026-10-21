import type { BackgroundLayer, BackgroundSpec, PropSheetSpec, SpriteProp, SpriteStyle, TilesetSpec, TilesetTerrain } from '../media-sprite';
import { chromaPromptClause, type SpriteChroma } from './key';

/**
 * The prompts of the environment kinds (Phase 106 Themes H and I). Versioned like the one-shot prompt:
 * bump {@link ENV_PROMPT_VERSION} when any wording changes.
 */
export const ENV_PROMPT_VERSION = 1;

const STYLE: Record<SpriteStyle, string> = {
  pixel: 'crisp pixel art with a limited palette',
  'hand-drawn': 'hand-drawn 2D game art with clean line work',
  painterly: 'painterly 2D game art',
  flat: 'flat-colour vector-style 2D game art',
};

const join = (parts: ReadonlyArray<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

/** A seamless, top-down terrain texture — the base tile of one terrain. Asked at 1:1 and downsampled. */
export function tileablePrompt(spec: Pick<TilesetSpec, 'style' | 'prompt'>, terrain: Pick<TilesetTerrain, 'label' | 'prompt'>): string {
  return join([
    `A seamless, tileable, top-down texture of ${terrain.prompt.trim() || terrain.label}, as ${STYLE[spec.style]}.`,
    'It fills the whole image edge to edge and repeats without a visible seam: the left edge continues into the right edge and the top edge into the bottom.',
    'Straight overhead orthographic view, even flat lighting, no perspective, no shadows cast by anything outside the image, no border, no vignette, no text, no objects that stand out as a single landmark.',
    spec.prompt.trim() && `Overall setting: ${spec.prompt.trim()}.`,
  ]);
}

/** One parallax layer: a horizontally seamless strip. The sky is opaque; the rest sit on a removable background. */
export function backgroundLayerPrompt(spec: Pick<BackgroundSpec, 'style' | 'prompt'>, layer: Pick<BackgroundLayer, 'name' | 'prompt'>, opts: { opaque: boolean; chroma?: SpriteChroma | null }): string {
  return join([
    `A side-view 2D game parallax background layer, ${layer.name}: ${layer.prompt.trim() || layer.name}, as ${STYLE[spec.style]}.`,
    'It repeats horizontally without a visible seam: the left edge continues into the right edge.',
    opts.opaque
      ? 'It fills the whole image.'
      : 'Only this layer\'s own shapes are drawn, anchored along the bottom edge, with empty space above them.',
    'No text, no characters, no UI.',
    !opts.opaque && opts.chroma && chromaPromptClause(opts.chroma),
    spec.prompt.trim() && `Overall setting: ${spec.prompt.trim()}.`,
  ]);
}

/** One prop on a removable background. */
export function propPrompt(spec: Pick<PropSheetSpec, 'style' | 'prompt'>, prop: Pick<SpriteProp, 'name' | 'prompt'>, opts: { chroma?: SpriteChroma | null }): string {
  return join([
    `A single game prop: ${prop.prompt.trim() || prop.name}, as ${STYLE[spec.style]}.`,
    'One object only, centred, fully inside the frame with a margin, seen from a slightly raised three-quarter view, no text.',
    opts.chroma && chromaPromptClause(opts.chroma),
    spec.prompt.trim() && `Overall setting: ${spec.prompt.trim()}.`,
  ]);
}
