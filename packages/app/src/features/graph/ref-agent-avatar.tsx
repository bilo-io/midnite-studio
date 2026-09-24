import type { TerminalSession } from '@midnite/studio-shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuExternalLink } from 'react-icons/lu';

import { resolveAgentIcon } from '../../components/icons';
import { Tooltip } from '../../components/tooltip';
import { useOccluder } from '../../components/use-occluder';
import { revealSession } from '../terminal/reveal-session';
import { useHoverGroup } from './ref-badge';

/**
 * Diameter of the avatar circle — matches `UserAvatar`'s own `size={14}` in
 * `graph-row.tsx`'s author column, the "git contributor" avatar this one is
 * built to sit beside without reading as a different scale of thing.
 */
const AVATAR_SIZE = 14;

/** Gap between the avatar's right edge and the "Reveal session" strip. */
const STRIP_GAP = 3;

/**
 * The agent avatar a ref badge wears when a live agent session is working in
 * its worktree, plus the hover-revealed "Reveal session" button.
 *
 * The circle itself mirrors `UserAvatar`'s own fallback shape (`user-
 * avatar.tsx`: a sized, `rounded-full`, centred-content circle) rather than
 * introducing a second avatar language for the one case a commit's author
 * isn't human — same size, same shape, same "small mark beside a name"
 * grammar, just an agent's resolved icon in the middle instead of initials.
 *
 * The reveal button is a second, independently-hovered element rather than
 * making the avatar itself the button (`activity-badge.tsx`'s
 * `ActivityBadgeIcon` does that, for cards) because this badge already
 * mounts inside a live BRANCH/TAG column: a bare click target with no label
 * reads as "this IS a link", and the point here is the two-step "who is
 * this, then take me there" the hover strip spells out. Portalled to
 * `document.body`, positioned in viewport coordinates and closed on scroll —
 * the exact shape `ref-badge.tsx`'s own `SyncOverlay` already established
 * for the identical "column is `overflow-hidden`, virtualized rows carry a
 * `transform`" constraints.
 */
export function RefAgentAvatar({
  session,
  agentId,
}: {
  session: TerminalSession;
  agentId: string | undefined;
}) {
  const Icon = resolveAgentIcon({ id: agentId ?? 'claude' });
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const { hovered, enter, leave } = useHoverGroup();
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  // Registered for as long as the strip COULD be open, not only once it has
  // measured a position — the same "register unconditionally" rule
  // `SyncOverlay` documents for its own `useOccluder()` call.
  useOccluder(hovered);

  useLayoutEffect(() => {
    if (!hovered) {
      setPlaced(null);
      return;
    }
    const node = anchorRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setPlaced({ x: box.right + STRIP_GAP, y: box.top + box.height / 2 });
  }, [hovered]);

  // Closed by a scroll rather than repositioned — the graph is virtualized,
  // so the row this avatar sits on can be recycled out from under a strip
  // still pointing at it mid-scroll.
  useEffect(() => {
    if (!hovered) return;
    window.addEventListener('scroll', leave, true);
    return () => window.removeEventListener('scroll', leave, true);
  }, [hovered, leave]);

  return (
    <span
      ref={anchorRef}
      onMouseEnter={enter}
      onMouseLeave={leave}
      className="relative inline-flex shrink-0 items-center"
    >
      <Tooltip label={session.title}>
        <span
          data-testid="ref-agent-avatar"
          className="flex shrink-0 select-none items-center justify-center rounded-full text-foreground"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            backgroundColor: 'hsl(var(--muted))',
            boxShadow: '0 0 0 1px hsl(var(--border))',
          }}
        >
          <Icon aria-hidden style={{ width: AVATAR_SIZE * 0.62, height: AVATAR_SIZE * 0.62 }} />
        </span>
      </Tooltip>

      {hovered && placed
        ? createPortal(
            <button
              type="button"
              data-testid="ref-agent-reveal-session"
              onMouseEnter={enter}
              onMouseLeave={leave}
              onClick={(event) => {
                // The avatar sits inside a clickable row; a click here means
                // this button, not the row underneath it.
                event.stopPropagation();
                revealSession(session.id);
              }}
              style={{ left: placed.x, top: placed.y }}
              className="fixed z-popover flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-[3px] border border-border bg-popover px-1.5 py-0.5 text-[11px] text-foreground shadow-md animate-fade-in hover:bg-accent"
            >
              <LuExternalLink aria-hidden className="h-3 w-3 shrink-0" />
              Reveal session
            </button>,
            document.body,
          )
        : null}
    </span>
  );
}
