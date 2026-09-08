import { useEffect } from 'react';

import { setCompanionPorts } from './companion-ports';
import {
  cancelCompanionSpeech,
  greetCompanion,
  repeatCompanionLast,
  submitCompanionInput,
  watchCompanionHandoff,
} from './runtime';

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
