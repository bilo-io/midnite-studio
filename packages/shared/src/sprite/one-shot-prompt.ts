import type { ImageAspect } from '../media';
import { SPRITE_ONE_SHOT_MAX, SPRITE_ONE_SHOT_TOO_MANY, type OneShotGrid, type SpriteClip, type SpriteSheetSpec } from '../media-sprite';
import { DIRECTION_PHRASES, handDrawnDirections, nearestAspect, PERSPECTIVE_PHRASES, STYLE_PHRASES } from './pose-tables';

/**
 * Phase 106 Theme F: the one-shot sheet — every frame in one image, under a strict, versioned prompt.
 * Image models are bad at exact grids, so nothing here trusts the result: the grid is detected from
 * the pixels (`grid-detect.ts`) and compared before anything is sliced.
 *
 * The layout: one clip × direction per **row** (in clip order, then direction order), one frame per
 * **column**; columns = the longest clip's frames. A 1-direction side sheet draws `e` only and
 * mirrors it, exactly as Hand-drawn does.
 *
 * Bump {@link ONE_SHOT_PROMPT_VERSION} whenever the prompt's text changes: it is recorded on
 * `sprite.json` (`oneShot.promptVersion`) so a sheet says which prompt drew it.
 */
export const ONE_SHOT_PROMPT_VERSION = 1;

export type OneShotRow = { clip: SpriteClip; dir: string };

/** The rows of the sheet, in order. `clips` narrows to a re-generate's clips. */
export function oneShotRows(spec: Pick<SpriteSheetSpec, 'clips' | 'directions' | 'targetPerspective' | 'mirror'>, clips?: readonly string[]): OneShotRow[] {
  const { draw } = handDrawnDirections(spec);
  const rows: OneShotRow[] = [];
  for (const clip of spec.clips) {
    if (clips && !clips.includes(clip.name)) continue;
    for (const dir of draw) rows.push({ clip, dir });
  }
  return rows;
}

/** The grid for these rows: cells at the frame size, a gutter of an eighth of the cell width. */
export function oneShotGrid(spec: Pick<SpriteSheetSpec, 'frameSize'>, rows: readonly OneShotRow[]): OneShotGrid {
  const [w, h] = spec.frameSize;
  return {
    columns: Math.max(1, ...rows.map((r) => r.clip.frames)),
    rows: Math.max(1, rows.length),
    cell: [w, h],
    gutter: Math.round(0.125 * w),
  };
}

/** Refuses a grid past {@link SPRITE_ONE_SHOT_MAX} columns or rows, before any request. */
export function oneShotBlocker(grid: Pick<OneShotGrid, 'columns' | 'rows'>): string | null {
  return grid.columns > SPRITE_ONE_SHOT_MAX || grid.rows > SPRITE_ONE_SHOT_MAX ? SPRITE_ONE_SHOT_TOO_MANY : null;
}

/** The sheet's nominal pixel size: cells plus a gutter between and around them. */
export function oneShotSheetSize(grid: OneShotGrid): [number, number] {
  return [grid.columns * grid.cell[0] + (grid.columns + 1) * grid.gutter, grid.rows * grid.cell[1] + (grid.rows + 1) * grid.gutter];
}

/** The provider takes an aspect, not a size: the supported aspect nearest the sheet's. */
export function oneShotAspect(grid: OneShotGrid): ImageAspect {
  const [w, h] = oneShotSheetSize(grid);
  return nearestAspect(w, h);
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The system prompt for one sheet. `background` is `spriteBackgroundRequest`'s answer: a chroma hex to
 * paint the background with, or `null` when the provider returns real transparency.
 */
export function oneShotPrompt(
  spec: Pick<SpriteSheetSpec, 'style' | 'prompt' | 'targetPerspective'>,
  grid: OneShotGrid,
  rows: readonly OneShotRow[],
  background: { chroma: string } | null,
): string {
  const subject = spec.prompt.trim() || 'a game character';
  const order = rows.map((r, i) => `row ${i + 1}: ${r.clip.name}, ${DIRECTION_PHRASES[r.dir] ?? `facing ${r.dir}`}, ${plural(r.clip.frames, 'frame')} from the left`);
  return [
    `A sprite sheet for a ${STYLE_PHRASES[spec.style]} of ${subject}, ${PERSPECTIVE_PHRASES[spec.targetPerspective]}.`,
    `Lay it out as an exact grid of ${plural(grid.columns, 'column')} and ${plural(grid.rows, 'row')}: every cell is ${grid.cell[0]}×${grid.cell[1]} units, separated by an empty gutter ${grid.gutter} units wide, with the same gutter around the edge.`,
    `Each row is one animation, played left to right, one frame per cell, in this order — ${order.join('; ')}. A row with fewer frames than columns leaves its remaining cells empty.`,
    'The same character in every cell: identical design, colours, proportions and scale, standing on the same baseline at the bottom of each cell, centred horizontally, never crossing into a gutter or a neighbouring cell.',
    background
      ? `The whole background, gutters included, is one perfectly flat, uniform colour ${background.chroma} — no gradient, shadow, floor or texture — and that colour appears nowhere on the character.`
      : 'The background, gutters included, is fully transparent — no floor, shadow or backdrop.',
    'Absolutely no text, numbers, labels, borders, frame lines or grid lines anywhere.',
  ].join(' ');
}
