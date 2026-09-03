import type { SessionActivity } from '../../terminal/terminal-store';
import { ActivityIndicator } from '../../terminal/terminal-session-list';

/**
 * The off-screen/collapsed answer to "what is my card's terminal doing"
 * (Phase 41 Theme E) — free and correct rather than built specially:
 * `useAgentActivity()` (mounted once at `app.tsx`) maps `ptyId → sessionId →
 * activity` in the store regardless of what is mounted, so a card's activity
 * stays live even while its xterm does not exist. Reuses the session list's
 * own `ActivityIndicator` glyph rather than a second one, plus the text a
 * glyph-only row does not have room for.
 */
export function CardActivityLine({ activity }: { activity: SessionActivity | undefined }) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
      <ActivityIndicator activity={activity} />
      <span>{ACTIVITY_LABEL[activity ?? 'unknown']}</span>
    </div>
  );
}

const ACTIVITY_LABEL: Record<SessionActivity | 'unknown', string> = {
  thinking: 'Thinking…',
  waiting: 'Waiting for input',
  idle: 'Running',
  unknown: 'Running',
};
