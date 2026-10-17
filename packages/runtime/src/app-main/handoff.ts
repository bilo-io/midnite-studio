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
