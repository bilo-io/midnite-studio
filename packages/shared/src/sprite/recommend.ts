import type { SpriteMethod, SpriteSheetSpec } from '../media-sprite';

export type SpriteRecommendation = { method: Exclude<SpriteMethod, 'one-shot'>; reason: string };

/**
 * Which of the two real methods suits a sheet. One-shot is never recommended — it is a checkbox.
 * Pure and in `shared` so the form, MCP and the skill read the same answer. First match wins.
 */
export function recommendSpriteMethod(
  spec: Pick<SpriteSheetSpec, 'reference' | 'targetPerspective' | 'directions' | 'style'>,
): SpriteRecommendation {
  if (spec.reference?.kind === 'model') {
    return { method: 'rendered', reason: 'A rigged model is attached: rendering keeps every direction consistent.' };
  }
  if ((spec.targetPerspective === 'top-down' || spec.targetPerspective === 'isometric') && spec.directions >= 4) {
    return { method: 'rendered', reason: 'Top-down and isometric sheets need 4–8 matching directions; rendering from 3D guarantees it.' };
  }
  if (spec.targetPerspective === 'side') {
    return { method: 'hand-drawn', reason: 'Side-scrollers need one facing; hand-drawn frames look best.' };
  }
  if (spec.style === 'hand-drawn' || spec.style === 'painterly') {
    return { method: 'hand-drawn', reason: 'Painterly styles come out best drawn frame by frame.' };
  }
  return { method: 'hand-drawn', reason: 'Hand-drawn is the general default.' };
}
