import { useEffect } from 'react';

import { setCompanionPorts } from './companion-ports';
import {
  cancelCompanionSpeech,
  greetCompanion,
  repeatCompanionLast,
  setCompanionSpeaker,
  submitCompanionInput,
  watchCompanionHandoff,
} from './runtime';
import { companionTtsSpeaker } from './speaker';
import { useUiStore } from '../../store/ui-store';

/**
 * Plugging Themes D and E into Theme C's panel — the registration half.
 *
 * Theme C shipped `companion-ports.ts` as a merge-in registry with no-op
 * defaults precisely so this file could exist as *one call* rather than an
 * edit to the panel: the panel's internals stay closed, and the flow arrives
 * from outside. This is the one call.
 *
 * At **module scope**, not in an effect. The panel's own "greet once per open"
 * guard fires from its first mount, and the panel can mount before any effect
 * of ours has run — a registration in `useEffect` would lose the very first
 * greeting of a session, silently and only sometimes, which is the worst shape
 * a bug of this kind can take. Registering at import time means the ports are
 * live before React renders anything.
 *
 * `submit` **replaces** Theme C's default rather than wrapping it: that
 * default posts the user's turn itself so the input bar works before this
 * theme exists, and `submitCompanionInput` posts its own. Wrapping would put
 * every typed message in the thread twice — which is exactly what Theme C's
 * own docblock warned about.
 */
setCompanionPorts({
  submit: (text) => void submitCompanionInput(text),
  greet: () => void greetCompanion(),
  interrupt: cancelCompanionSpeech,
  repeat: () => void repeatCompanionLast(),
});

/**
 * The one subscription this feature needs mounted, from the app root.
 *
 * Same shape and same placement rationale as `useAgentActivity()` and
 * `useSessionExits()`: it watches for a hand-off's agent finishing, and that
 * has to keep working while the companion panel is *closed* — a hand-off is
 * meant to run unattended, and an answer that only arrives if you happen to be
 * looking at the thread is not an answer.
 */
export function useCompanionHandoffWatch(): void {
  useEffect(() => watchCompanionHandoff(), []);
}

/**
 * The other half of the registration: giving the flow a voice.
 *
 * **Phase 79's actual bug.** Theme E built `setCompanionSpeaker` and Theme F
 * built `companionTtsSpeaker`, in parallel PRs, and nothing ever called the
 * one with the other — so the shipped app ran its whole flow against
 * `silentSpeaker`, posted every turn `spoken: false`, and said nothing out
 * loud. Two seams that fit perfectly and were never joined, which is the
 * failure mode parallel themes have.
 *
 * A hook rather than the module-scope call above it, and the difference is
 * load-bearing: this is not a one-time registration but a *live* answer to two
 * preferences. Flipping Settings ▸ Companion ▸ "Speak replies aloud" has to
 * take effect on the next sentence, not the next launch, and a store
 * subscription at module scope would have no way to unsubscribe and no
 * lifecycle to hang a `cancel()` off. Mounted from `app.tsx` beside
 * {@link useCompanionHandoffWatch}, for the same reason: it must be live while
 * the panel is closed, because a hand-off's read-back speaks whether or not
 * anyone is looking at the thread.
 *
 * `companionTtsSpeaker.cancel()` on the way down, not just the unregistration:
 * turning the switch off mid-sentence has to stop the sentence. Unregistering
 * alone would leave the utterance `speechSynthesis` has already accepted
 * talking into a room whose owner just asked for quiet.
 */
export function useCompanionSpeakerWiring(): void {
  const enabled = useUiStore((state) => state.companionEnabled);
  const speakAloud = useUiStore((state) => state.companionSpeakAloud);

  useEffect(() => {
    if (!enabled || !speakAloud) {
      companionTtsSpeaker.cancel();
      setCompanionSpeaker(null);
      return undefined;
    }
    setCompanionSpeaker(companionTtsSpeaker);
    return () => {
      companionTtsSpeaker.cancel();
      setCompanionSpeaker(null);
    };
  }, [enabled, speakAloud]);
}
