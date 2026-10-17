import { CHANNELS, parseMidniteLink, schemas } from '@midnite/studio-shared';

import type { FeatureMainContext } from '../feature-main';

/**
 * The main half of a cross-app hand-off (`docs/APPS.md`, "The shared data plane").
 *
 * A renderer that wants the user somewhere another app owns plans the request against the apps
 * its own process hosts (`planHandoff`); anything else becomes a `midnite://open` link, and this is
 * where main opens it. The OS hands the link to the Midnite Apps launcher, whose router opens the
 * installed app, else Studio, else that app's detail sheet.
 *
 * Only a `midnite://open` link is ever opened: the request schema refuses anything else, and the
 * handler parses it again before it reaches `openExternal` — this channel can never be turned into
 * "open this URL".
 */
export function registerHandoffOpener(
  ipc: FeatureMainContext['ipc'],
  deps: { openExternal: (url: string) => Promise<void> },
): void {
  ipc.handle(
    CHANNELS.handoffOpen,
    schemas.HandoffOpenRequest,
    async ({ link }) => {
      if (parseMidniteLink(link) === null) return { ok: false };
      try {
        await deps.openExternal(link);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    () => ({ ok: false }),
  );
}

/**
 * Who on this machine can receive an agent-run hand-off (Phase 113 Theme O) — asked by an app with
 * no terminal (Coder) before it sends one, so it can offer the prompt to copy instead of a link that
 * lands nowhere.
 *
 * Studio is the only receiver today: it is known by the runtime host record naming it (`host:
 * 'studio'`, written by Studio when it runs). Agents joins once it can take a run itself — then the
 * launcher's `installed.json` listing `agents` is what says so. Names only: no path, pid or socket
 * crosses to the renderer.
 */
export function registerRunReceiver(
  ipc: FeatureMainContext['ipc'],
  deps: { hostApp: () => string | null },
): void {
  ipc.handleBare(CHANNELS.handoffRunReceiver, () => {
    let host: string | null = null;
    try {
      host = deps.hostApp();
    } catch {
      host = null;
    }
    return { receiver: host === 'studio' ? ('studio' as const) : null };
  });
}
