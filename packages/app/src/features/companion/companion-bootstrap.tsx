import { useCompanionHandoffWatch, useCompanionSpeakerWiring } from './register-flow-ports';
// Side-effect import: claims `voice-ports.ts`'s four `companion-ports.ts`
// members (`interrupt`, the two mic gestures, `micAvailable`) at module
// scope, and applies the persisted companion volume — see that file's own
// doc for why this has to happen at import time rather than in an effect.
import './voice-ports';

/**
 * The companion's voice/audio bootstrap, as its own chunk (Phase 84 Theme H).
 *
 * `app.tsx` imports `voice-ports.ts` and mounts the two hooks below directly,
 * eagerly, because the main window's companion can appear at any moment via
 * the FAB — there is no "role" to gate it on. A popout is different: it
 * renders exactly one panel, known up front from `windowRole`, so only the
 * companion popout (`detached-root.tsx`, `role === 'companion'`) has any use
 * for this at all. The other seven roles — terminal, repos, browser, the
 * three apps-rail panels, a detached page — can never show a mic button, and
 * before this file existed they paid for `voice-ports.ts`'s recorder/WAV-
 * encoding/speaker machinery anyway, as a side effect of `app.tsx` being a
 * static import in `main.tsx` regardless of `role`.
 *
 * Its own module, loaded behind `React.lazy`, so a non-companion popout's
 * bundle never evaluates it — same reason `main.tsx` itself now branches on
 * `role` before importing `App` or `DetachedRoot`.
 */
export function CompanionBootstrap(): null {
  useCompanionHandoffWatch();
  useCompanionSpeakerWiring();
  return null;
}
