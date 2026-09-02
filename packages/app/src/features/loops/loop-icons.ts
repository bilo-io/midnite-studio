import type { IconType } from 'react-icons';
import { FaHeartbeat } from 'react-icons/fa';
import { GiOvermind } from 'react-icons/gi';
import { LuBot, LuCircleDot } from 'react-icons/lu';
import { SiSecurityscorecard } from 'react-icons/si';

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
  brain: GiOvermind,
  bot: LuBot,
  watchdog: SiSecurityscorecard,
  medic: FaHeartbeat,
};

export function loopIcon(token: string): IconType {
  return LOOP_ICONS[token] ?? LuCircleDot;
}
