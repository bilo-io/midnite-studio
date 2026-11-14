import { PanelNotice } from './panel-notice';
import { ReattachedNote, noteText } from './reattached-note';
import { useTerminalStore } from './terminal-store';
import type { TerminalSession } from '@midnite/studio-shared';

/** Offers to restart sessions that reattached from an older build's broker. */
export function LegacyNotice({ sessions }: { sessions: TerminalSession[] }) {
  const legacy = useTerminalStore((s) => s.legacy);
  const legacyBannerDismissed = useTerminalStore((s) => s.legacyBannerDismissed);
  const dismissLegacyBanner = useTerminalStore((s) => s.dismissLegacyBanner);

  if (!Object.values(legacy).some(Boolean) || legacyBannerDismissed) return null;

  return (
    <PanelNotice tone="warning" role="alert">
      <p className="font-medium">From a previous version — restart sessions?</p>
      {/* Dismiss (safe default) first, Restart second. */}
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={dismissLegacyBanner}
          className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => {
            const store = useTerminalStore.getState();
            for (const session of sessions) {
              if (legacy[session.id]) {
                store.closeSession(session.id);
                store.openSession({
                  kind: session.kind,
                  agentId: session.agentId,
                  title: session.title,
                  cwd: session.cwd,
                  repoId: session.repoId,
                });
              }
            }
            dismissLegacyBanner();
          }}
          className="rounded px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground"
        >
          Restart
        </button>
      </div>
    </PanelNotice>
  );
}

/** The docked stack under the session list: legacy notice, then the reattached note. */
export function TerminalNotices({ sessions }: { sessions: TerminalSession[] }) {
  const legacy = useTerminalStore((s) => s.legacy);
  const legacyBannerDismissed = useTerminalStore((s) => s.legacyBannerDismissed);
  const reattachedCount = useTerminalStore((s) => s.reattachedCount);
  const reattachedDismissed = useTerminalStore((s) => s.reattachedDismissed);

  const showLegacy = Object.values(legacy).some(Boolean) && !legacyBannerDismissed;
  const showReattached = noteText(reattachedCount) !== null && !reattachedDismissed;
  if (!showLegacy && !showReattached) return null;

  return (
    <div data-testid="terminal-notices" className="flex shrink-0 flex-col">
      <LegacyNotice sessions={sessions} />
      <ReattachedNote />
    </div>
  );
}
