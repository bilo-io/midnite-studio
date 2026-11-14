import { useFrameChrome } from '@midnite/studio-frame';

import { endSessionsWithConfirm, previousBuildSessions } from './end-sessions';
import { PanelNotice } from './panel-notice';
import { ReattachedNote, useReattachedNoteVisible } from './reattached-note';
import { useTerminalStore } from './terminal-store';
import type { TerminalSession } from '@midnite/studio-shared';

/** Offers to restart sessions that reattached from an older build's broker. */
export function useLegacyNoticeVisible(): boolean {
  const legacy = useTerminalStore((s) => s.legacy);
  const dismissed = useTerminalStore((s) => s.legacyBannerDismissed);
  return Object.values(legacy).some(Boolean) && !dismissed;
}

export function LegacyNotice({ sessions }: { sessions: TerminalSession[] }) {
  const legacy = useTerminalStore((s) => s.legacy);
  const dismissLegacyBanner = useTerminalStore((s) => s.dismissLegacyBanner);
  const visible = useLegacyNoticeVisible();
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();

  if (!visible) return null;

  // Both actions kill processes, so both go through the confirm that lists them (`end-sessions.ts`).
  const restart = () =>
    endSessionsWithConfirm(
      dialogs,
      sessions.filter((session) => legacy[session.id]),
      {
        onEnded: (ended) => {
          const store = useTerminalStore.getState();
          for (const session of ended) {
            store.openSession({
              kind: session.kind,
              agentId: session.agentId,
              title: session.title,
              cwd: session.cwd,
              repoId: session.repoId,
            });
          }
          dismissLegacyBanner();
        },
      },
    );

  return (
    <PanelNotice tone="warning" role="alert" testId="terminal-legacy-notice">
      <p className="font-medium">Sessions from a previous build are still running.</p>
      {/* Dismiss (safe default) first, then the two that end processes. */}
      <div className="mt-1.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={dismissLegacyBanner}
          className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90"
        >
          Dismiss
        </button>
        <button
          type="button"
          data-testid="terminal-end-previous-build"
          onClick={() => endSessionsWithConfirm(dialogs, previousBuildSessions())}
          className="rounded px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground"
        >
          End all…
        </button>
        <button
          type="button"
          onClick={restart}
          className="rounded px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground"
        >
          Restart…
        </button>
      </div>
    </PanelNotice>
  );
}

/** The docked stack under the session list: legacy notice, then the reattached note. */
export function TerminalNotices({ sessions }: { sessions: TerminalSession[] }) {
  const showLegacy = useLegacyNoticeVisible();
  const showReattached = useReattachedNoteVisible();
  if (!showLegacy && !showReattached) return null;

  return (
    <div data-testid="terminal-notices" className="flex shrink-0 flex-col">
      <LegacyNotice sessions={sessions} />
      <ReattachedNote />
    </div>
  );
}
