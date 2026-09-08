import type { CompanionState } from '@midnite/studio-shared';
import { LuSquareArrowOutUpRight, LuTrash2, LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { bridge } from '../../services/bridge';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { COMPANION_LOOK } from './companion-look';
import { companionPorts } from './companion-ports';

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
  const dialogs = useDialogs();
  /*
    The count, not the array: this header re-renders on every state change
    already, and subscribing to the turns themselves would add a render per
    appended turn for a number that only ever moves the button between
    enabled and disabled.
  */
  const turns = useCompanionStore((s) => s.transcript.length);
  const clearTranscript = useCompanionStore((s) => s.clearTranscript);
  const look = COMPANION_LOOK[state];
  const Glyph = look.icon;

  /*
    The app's shared `dialogs.confirm`, not a two-step inside the header.

    Clearing is the one irreversible thing this panel can do — the transcript
    is the record of what was asked, `clearTranscript` writes `[]` straight
    through the persist middleware, and there is no undo anywhere in the
    companion. That is exactly the class of operation `ConfirmDialog` exists
    for, and both hosts that mount this panel already sit inside a
    `DialogHost` (`app.tsx` and `detached-root.tsx`), so reuse costs nothing.
    The shape follows `sessions-view.tsx`'s "Clear history?" precisely:
    `blastRadius: null` with the count spelled out in the title and in one
    warning line, because `BlastRadius.sample` is `{sha, subject}[]` and a
    conversation turn has nothing shaped like a commit to list.

    `interrupt()` before `clearTranscript()`, in that order. The port is
    `cancelCompanionSpeech` once Theme F/G have registered themselves, and it
    stops the audio *and* aborts the script that was going to queue the next
    four sentences behind it — a companion left mid-sentence about turns that
    no longer exist is the obvious bug in a control like this, and the abort is
    the half that keeps it stopped. It also sends `interrupt` to the machine,
    so the header lands back on "Ready" beside the empty thread.
  */
  const confirmClear = () =>
    dialogs.confirm({
      title: `Clear ${turns} ${turns === 1 ? 'turn' : 'turns'}?`,
      confirmLabel: 'Clear conversation',
      danger: true,
      blastRadius: null,
      warnings: [
        `${turns} ${turns === 1 ? 'turn is' : 'turns are'} deleted from this conversation and from the saved copy. This cannot be undone.`,
      ],
      onConfirm: () => {
        companionPorts().interrupt();
        clearTranscript();
      },
    });

  return (
    <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-2">
      <Glyph aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span
        data-testid="companion-state-label"
        className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground"
      >
        {look.label}
      </span>
      {/*
        Present in a popout too, unlike its two neighbours: a detached
        companion is still a conversation with a record to clear, and the
        reasons detach and close are hidden there ("detach what is already
        detached", "close a column that is a window") do not apply.

        `disabledReason` rather than a bare `disabled`, so the one state that
        most needs explaining can explain itself — a native `disabled`
        suppresses the hover that would raise the tooltip. See `IconButton`.
      */}
      <IconButton
        icon={LuTrash2}
        label="Clear conversation"
        size="sm"
        tone="danger"
        disabled={turns === 0}
        disabledReason={turns === 0 ? 'the conversation is already empty' : undefined}
        onClick={confirmClear}
        data-testid="companion-clear"
      />
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
