import type { IconType } from 'react-icons';
import { LuBrain, LuBot, LuCircleDot, LuHeartHandshake, LuRadar } from 'react-icons/lu';

/**
 * `LoopDefinition.icon` is a *token*, not a component — `packages/shared` is
 * the wire contract and imports zod and nothing else, so the glyph a loop
 * wears has to be resolved on this side of the boundary. This map is that
 * resolution, and the only place a loop's icon token becomes a component.
 *
 * An unknown token (a loop from a newer store, or a hand-edited one) draws the
 * neutral dot rather than throwing — a wrong glyph is a cosmetic problem, a
 * crashed panel is not.
 */
const LOOP_ICONS: Record<string, IconType> = {
  brain: LuBrain,
  bot: LuBot,
  watchdog: LuRadar,
  medic: LuHeartHandshake,
};

export function loopIcon(token: string): IconType {
  return LOOP_ICONS[token] ?? LuCircleDot;
}
