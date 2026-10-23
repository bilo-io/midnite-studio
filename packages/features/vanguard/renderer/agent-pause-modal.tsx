import { bridge, FrameModal } from '@midnite/studio-frame';
import type { AgentPausePrompt } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuOctagonAlert } from 'react-icons/lu';

/**
 * The auto-pause modal (Phase 120 Theme G), mounted once from the app root so it appears whichever view is up.
 * Main has already interrupted the session by the time this shows; the user picks **Resume** (carry on) or
 * **Kill session**. Main sends it to every window, so the first answer wins and the rest see it go (a stale
 * answer resolves `false` and the modal closes anyway: it would only lie).
 */
export function AgentPauseModal() {
  const [queue, setQueue] = useState<AgentPausePrompt[]>([]);
  useEffect(() => {
    const api = bridge();
    if (!api?.vanguard?.onAgentPaused) return undefined;
    return api.vanguard.onAgentPaused((prompt) => setQueue((current) => [...current, prompt]));
  }, []);

  const prompt = queue[0];
  const answer = (action: 'resume' | 'kill'): void => {
    if (!prompt) return;
    setQueue((current) => current.filter((p) => p.id !== prompt.id));
    void bridge()
      ?.vanguard.resolveAgentPause({ id: prompt.id, action })
      .catch(() => undefined);
  };

  return (
    <FrameModal open={prompt !== undefined} onClose={() => answer('resume')} title="An agent was paused" size="sm" role="alertdialog" scope="window" testId="agent-pause-modal">
      {prompt ? (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LuOctagonAlert aria-hidden className="h-4 w-4 text-destructive" />
            An agent was paused
          </div>
          <p className="text-xs font-medium">{prompt.title}</p>
          <p className="text-xs text-muted-foreground">{prompt.detail}</p>
          <p className="text-[11px] text-muted-foreground">
            Session {prompt.sessionId} was interrupted with Ctrl+C. Resume lets it carry on; kill ends it.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => answer('kill')}
              className="rounded-md border border-border px-3 py-1 text-xs text-destructive hover:bg-accent"
            >
              Kill session
            </button>
            <button type="button" onClick={() => answer('resume')} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">
              Resume
            </button>
          </div>
        </div>
      ) : null}
    </FrameModal>
  );
}
