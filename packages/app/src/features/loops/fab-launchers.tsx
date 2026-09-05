import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { useLayoutEffect, useRef, useState, type Ref } from 'react';

import { BrandMark } from '../../components/brand';
import { Tooltip } from '../../components/tooltip';
import { useWindowFocused } from '../../lib/use-window-focus';
import { useUiStore, type FabTab } from '../../store/ui-store';
import { loopGlowColor, LOOP_WAITING_COLOR } from './loop-glow';
import { loopIcon } from './loop-icons';
import { useAllLoopStatuses, type LoopStatus } from './loop-status';

const LOOP_IDS = DEFAULT_LOOPS.map((loop) => loop.id);

/**
 * The six loop launchers, in the title bar's right cluster.
 *
 * They were a `STATUS_SEGMENTS` entry in the status bar's left zone from
 * Phase 39 Themes E + F until this move, which put them beside the live-agent
 * count in [`title-bar-agents.tsx`](../../components/title-bar-agents.tsx) —
 * the two readouts about *agents* now sit together at the top-right rather than
 * trailing the rail's five unrelated shortcut toggles. Nothing about the
 * control itself changed but the direction its tooltips open.
 *
 * One click puts the FAB console on that loop's tab — `openFabTab` already sets
 * `fabPanelOpen` and `activeFabTab` in a single action, so this needed no new
 * store surface. Clicking the tab that is already open closes the panel, like
 * every other toggle in the app.
 *
 * **Two states, two CSS properties.** A running loop **glows** — full opacity,
 * a `box-shadow` in its own colour, a slow opacity pulse. The **open** tab wears
 * an `outline`. They are different properties on purpose: a loop can be open and
 * idle, running and unopened, or both at once, and stacking two `box-shadow`
 * lists would make every combination a hand-written shadow string. Amber
 * outranks the loop colour when a loop is waiting on you — established by
 * `.loop-run-glow.is-waiting`, the FAB tab dot and `fab-loop-halo.tsx`, and it
 * has to look identical in all four places.
 *
 * `is-thinking` deliberately gets no fourth state here. At 14px, *running* and
 * *waiting* is as much as this control can carry honestly; the FAB button itself
 * is where the breathing distinction between live-and-idle and live-and-working
 * is drawn.
 *
 * **One component, not four.** This began life as a single `STATUS_SEGMENTS`
 * entry because four separate registrations could be split across an overflow
 * boundary and would each take a `gap-3` slot. The overflow mechanism is behind
 * it now, but the reason to keep one component stands: the strip's collapsed
 * form is one glyph standing in for all four, which is not something four
 * independent components could render.
 */
export function FabLaunchers() {
  const statuses = useAllLoopStatuses(LOOP_IDS);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const [reached, setReached] = useState(false);
  const [claimFocus, setClaimFocus] = useState(false);
  const firstLauncher = useRef<HTMLButtonElement | null>(null);

  const anyLive = statuses.some((status) => status.running);
  /*
    The pulse only runs while this window has focus. The strip is mounted for
    the app's whole life, so an ungated always-on animation is exactly what
    Phase 36 Theme E's blurred-idle-CPU number exists to catch. Blurred, a
    running launcher keeps its full opacity and its coloured glow — nothing is
    lost but the motion.
  */
  const pulsing = useWindowFocused();
  /*
    At rest the strip is a single glyph, expanding on hover/focus, while any
    loop is live, or while the FAB panel is open. Kept on the move into the
    title bar: there is more room up here, but four permanently-lit glyphs in
    the window's highest-attention corner is exactly the noise the collapse
    exists to avoid.

    `FabLoopHalo` renders nothing at all when nothing is running, on the
    argument that the FAB is a button people press fifty times a day and should
    look untouched. That argument does not transfer: these launchers are *how
    you start* a loop, so hiding them until one runs is circular. Collapsing
    instead of hiding keeps the resting bar quiet — one glyph, not four — while
    leaving the affordance reachable.

    It is also what keeps the title bar's own width honest: the agent cluster
    sits ahead of the date/weather pill and the repo lifecycle actions, and a
    strip that grew by three glyphs the moment a loop started would shove all
    of them leftward.

    **`fabPanelOpen` belongs in this expression, not just `anyLive`.** Theme F
    needs open-and-idle, running-and-unopened and both-at-once to be three
    distinguishable states; without it the first of those three collapsed the
    strip, so the `is-open` outline existed in CSS and could never be seen.
  */
  const expanded = anyLive || fabPanelOpen || reached;

  /*
    Expanding swaps the collapsed button for four launchers, which UNMOUNTS the
    element that was just focused: focus falls to `document.body`, the next Tab
    restarts from the top of the document, and — because Chromium fires no
    `blur` for a removed node — `reached` would stay stuck true with no pointer
    having gone near it. So a keyboard arrival hands focus forward to the first
    launcher the expansion revealed.
  */
  useLayoutEffect(() => {
    if (!claimFocus || !expanded) return;
    firstLauncher.current?.focus();
    setClaimFocus(false);
  }, [claimFocus, expanded]);

  const strip = {
    onPointerEnter: () => setReached(true),
    onPointerLeave: () => setReached(false),
    onFocusCapture: () => setReached(true),
    onBlurCapture: () => setReached(false),
  };

  if (!expanded) {
    return (
      <div data-testid="fab-launchers" data-expanded="false" {...strip}>
        {/* `side="bottom"`: the strip is at the top edge of the window now, so a
            tooltip above it would be drawn off-screen. */}
        <Tooltip label="Agent loops — Guard, Concepts, Develop, Patrol, Medic, Overhaul" side="bottom">
          <button
            type="button"
            data-testid="fab-launchers-collapsed"
            aria-label="Agent loop launchers"
            /*
              `aria-expanded` is honest because activating this button expands
              the strip and does nothing else. It used to call `openFabTab`,
              which was wrong three ways: unreachable by mouse (`pointerenter`
              fires first and unmounts this button before the click can land),
              unreachable by keyboard (focus is handed forward, above), and
              unable to un-press the way `LoopLauncher` does — clicking it with
              the FAB already open on `activeFabTab` was a silent no-op.
            */
            aria-expanded={false}
            aria-controls="fab-launcher-strip"
            onClick={() => {
              setReached(true);
              setClaimFocus(true);
            }}
            className="flex items-center rounded px-1 opacity-45 transition-opacity hover:opacity-100"
          >
            <BrandMark className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      id="fab-launcher-strip"
      data-testid="fab-launchers"
      data-expanded="true"
      className="flex items-center gap-1"
      {...strip}
    >
      {DEFAULT_LOOPS.map((loop, index) => (
        <LoopLauncher
          key={loop.id}
          buttonRef={index === 0 ? firstLauncher : undefined}
          loopId={loop.id}
          label={loop.label}
          Icon={loopIcon(loop.icon)}
          status={statuses[index]}
          open={fabPanelOpen && activeFabTab === loop.id}
          pulsing={pulsing}
        />
      ))}
    </div>
  );
}

type LoopLauncherProps = {
  /** Set on the first launcher only, so a keyboard arrival has somewhere to go. */
  buttonRef?: Ref<HTMLButtonElement>;
  loopId: string;
  label: string;
  Icon: ReturnType<typeof loopIcon>;
  status: LoopStatus | undefined;
  open: boolean;
  /** Whether the window has focus — see the comment at the call site. */
  pulsing: boolean;
};

function LoopLauncher({
  buttonRef,
  loopId,
  label,
  Icon,
  status,
  open,
  pulsing,
}: LoopLauncherProps) {
  const running = status?.running ?? false;
  const waiting = status?.waiting ?? false;
  const color = waiting ? LOOP_WAITING_COLOR : loopGlowColor(loopId);

  const state = waiting ? 'waiting' : running ? 'running' : 'idle';

  return (
    <Tooltip
      label={`${label}${running ? (waiting ? ' — waiting on you' : ' — running') : ''}`}
      side="bottom"
    >
      <button
        ref={buttonRef}
        type="button"
        data-testid={`loop-launcher-${loopId}`}
        data-loop-state={state}
        data-loop-open={open ? 'true' : undefined}
        /*
          `"<Label> loop"`, deliberately not `"Open <Label>"`: the waiting-notice
          action button in the notification bell is already named
          `Open <Label>`, and Playwright's `getByRole({ name })` matches on
          substring by default — so `Open Ideate loop` made every spec
          reaching for that action a strict-mode violation.
        */
        aria-label={`${label} loop`}
        aria-pressed={open}
        onClick={() => {
          const ui = useUiStore.getState();
          if (open) ui.setFabPanelOpen(false);
          else ui.openFabTab(loopId as FabTab);
        }}
        // `--loop-launcher-color` is what lets one CSS rule serve six loops,
        // the technique `.loop-run-glow` uses for `--loop-glow-angle`.
        style={{ ['--loop-launcher-color' as string]: color }}
        className={`loop-launcher flex items-center rounded px-0.5 ${
          running ? (waiting ? 'is-waiting' : 'is-running') : ''
        } ${running && !waiting && pulsing ? 'is-pulsing' : ''} ${open ? 'is-open' : ''}`}
      >
        <Icon aria-hidden className="h-3.5 w-3.5" style={{ color }} />
      </button>
    </Tooltip>
  );
}
