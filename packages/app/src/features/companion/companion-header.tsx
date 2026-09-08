import type { CompanionState } from '@midnite/studio-shared';
import { LuSquareArrowOutUpRight, LuX } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { COMPANION_LOOK } from './companion-look';

/**
 * The companion panel's header row (Phase 79 Theme C).
 *
 * The glyph and the label both come from `COMPANION_LOOK`, the one table the
 * FAB and the quick-access popover also read — the phase asks three surfaces
 * to show "the same glyph", and a per-surface literal is how that promise
 * quietly stops being true.
 *
 * The detach button follows `fab-panel.tsx`'s exactly: hidden inside a popout,
 * because a control offering to detach a window that already *is* one is a
 * dead end. `surface: 'companion'` is the fifth `PanelWindowRole`.
 */
export function CompanionHeader({ state }: { state: CompanionState }) {
  const isPopout = (bridge()?.windowRole ?? 'main') !== 'main';
  const setOpen = useUiStore((s) => s.setCompanionPanelOpen);
  const look = COMPANION_LOOK[state];
  const Glyph = look.icon;

  return (
    <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-2">
      <Glyph aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span
        data-testid="companion-state-label"
        className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground"
      >
        {look.label}
      </span>
      {!isPopout ? (
        <IconButton
          icon={LuSquareArrowOutUpRight}
          label="Detach the Companion into its own window"
          size="sm"
          onClick={() => bridge()?.window.detach({ role: 'companion' })}
        />
      ) : null}
      {!isPopout ? (
        <IconButton
          icon={LuX}
          label="Close the Companion"
          size="sm"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
