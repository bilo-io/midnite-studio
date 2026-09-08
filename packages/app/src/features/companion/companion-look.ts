import type { CompanionState } from '@midnite/studio-shared';
import { LuBot, LuEar, LuMessagesSquare, LuMic, LuSparkles, LuVolume2 } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';

/**
 * One table for how each companion state *looks* and *reads*, so the panel
 * header, the quick-access popover and the FAB cannot drift on either.
 *
 * The phase asks for "the current state label with the same glyph the FAB
 * uses" in two places; the only way that stays true is for neither place to
 * own the pairing.
 */
export type CompanionLook = { label: string; icon: IconComponent };

export const COMPANION_LOOK: Record<CompanionState, CompanionLook> = {
  // `off` is what the machine sits in while the master switch is off — the
  // panel is not reachable at all in that state, so this row is only ever
  // read by the popover's own disabled row.
  off: { label: 'Off', icon: LuBot },
  idle: { label: 'Ready', icon: LuBot },
  greeting: { label: 'Saying hello…', icon: LuSparkles },
  listening: { label: 'Listening…', icon: LuEar },
  thinking: { label: 'Thinking…', icon: LuSparkles },
  speaking: { label: 'Speaking…', icon: LuVolume2 },
  // Not "Thinking" a second time: a hand-off is an agent session the user can
  // go and *look at*, which is the distinction `shared/src/companion.ts` gives
  // for the state existing at all.
  handoff: { label: 'Agent working…', icon: LuMessagesSquare },
};

/** The companion's own mark, wherever a surface needs one glyph rather than a per-state one. */
export const CompanionGlyph = LuBot;

/** The mic glyph pair, named here so the input bar and Settings agree. */
export const CompanionMicGlyph = LuMic;

/**
 * The value of the FAB's `data-companion-state` attribute, or `undefined` when
 * the companion has nothing to say and today's look should win untouched.
 *
 * Two states resolve to nothing: `off` (the feature is switched off) and
 * `idle` (on, but quiet). The phase names `idle` explicitly as "no rule —
 * today's look wins", and the cheapest way to guarantee that is to not set the
 * attribute at all rather than to write a CSS rule that carefully changes
 * nothing.
 *
 * `greeting` maps to `speaking`: it *is* speaking, and a fifth keyframe set
 * for the first sentence of a session would be a look nobody could learn.
 */
export function fabCompanionState(state: CompanionState): string | undefined {
  switch (state) {
    case 'off':
    case 'idle':
      return undefined;
    case 'greeting':
      return 'speaking';
    default:
      return state;
  }
}
