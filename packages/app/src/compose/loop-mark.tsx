import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { loopAccentColor, loopIcon, loopLabel } from '@midnite/studio-feature-loops/renderer';
import type { TerminalLoopMarkProps } from '@midnite/studio-feature-terminal/renderer';

import { useUiStore } from '../store/ui-store';

/**
 * A loop session's mark in the terminal list's "Loops" group: the loop's own
 * icon in its own colour, between the agent mark and the session name.
 *
 * The loop is the session's `loopId`; a row persisted before that field
 * existed (a `'fab'`-surface session) is found the old way, through the
 * `fabSessions` map the Loops panel used to keep. A loop that no longer
 * exists (a deleted custom loop) draws nothing rather than a wrong mark.
 */
export function StudioLoopMark({ session }: TerminalLoopMarkProps) {
  const legacyLoopId = useUiStore((s) =>
    session.loopId === undefined
      ? Object.entries(s.fabSessions).find(([, id]) => id === session.id)?.[0]
      : undefined,
  );
  const loopId = session.loopId ?? legacyLoopId;
  const loop = useUiStore(
    (s) =>
      DEFAULT_LOOPS.find((entry) => entry.id === loopId) ??
      s.customLoops.find((entry) => entry.id === loopId),
  );
  if (!loop) return null;
  const Icon = loopIcon(loop.icon);
  return (
    <Icon
      aria-label={loopLabel(loop)}
      data-testid="terminal-session-loop"
      data-loop-id={loop.id}
      className="h-3 w-3 shrink-0"
      style={{ color: loopAccentColor(loop) }}
    />
  );
}
