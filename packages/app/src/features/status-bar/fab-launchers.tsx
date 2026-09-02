import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { useState } from 'react';

import { Tooltip } from '../../components/tooltip';
import { useWindowFocused } from '../../lib/use-window-focus';
import { useUiStore, type FabTab } from '../../store/ui-store';
import { loopGlowColor, LOOP_WAITING_COLOR } from '../loops/loop-glow';
import { loopIcon } from '../loops/loop-icons';
import { useAllLoopStatuses, type LoopStatus } from '../loops/loop-status';

import { BrandMark } from '../../components/brand';

const LOOP_IDS = DEFAULT_LOOPS.map((loop) => loop.id);

/**
 * The four loop launchers, on the rail (Phase 39 Themes E + F).
 *
 * One click puts the FAB console on that loop's tab — `openFabTab` already sets
 * `fabPanelOpen` and `activeFabTab` in a single action, so this needed no new
 * store surface. Clicking the tab that is already open closes the panel, like
 * every other toggle in the rail.
 *
 * **Two states, two CSS properties.** A running loop **glows** — full opacity,
 * a `box-shadow` in its own colour, a slow opacity pulse. The **open** tab wears
 * an `outline`. They are different properties on purpose: a loop can be open and
 * idle, running and unopened, or both at once, and stacking two `box-shadow`
 * lists would make every combination a hand-written shadow string. Amber
 * outranks the loop colour when a loop is waiting on you — established by
 * `.loop-run-glow.is-waiting`, the FAB tab dot and `fab-loop-dots.tsx`, and it
 * has to look identical in all four places.
 *
 * `is-thinking` deliberately gets no fourth state here. At 14px, *running* and
 * *waiting* is as much as this control can carry honestly; the FAB button itself
 * is where the breathing distinction between live-and-idle and live-and-working
 * is drawn.
 *
 * **One segment, not four.** Four separate registrations could be split across
 * an overflow boundary and would each take a `gap-3` slot; as one segment the
 * strip is indivisible and can use its own tighter `gap-1`.
 */
export function FabLaunchers() {
  const statuses = useAllLoopStatuses(LOOP_IDS);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const [hovered, setHovered] = useState(false);

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
    At rest the strip is a single glyph, expanding to four on hover, focus, or
    the moment any loop goes live.

    `FabLoopDots` renders nothing at all when nothing is running, on the
    argument that the FAB is a button people press fifty times a day and should
    look untouched. That argument does not transfer: these launchers are *how
    you start* a loop, so hiding them until one runs is circular. Collapsing
    instead of hiding keeps the resting bar quiet — one glyph, not four — while
    leaving the affordance reachable.
  */
  const expanded = anyLive || hovered;

  const handlers = {
    onPointerEnter: () => setHovered(true),
    onPointerLeave: () => setHovered(false),
    onFocusCapture: () => setHovered(true),
    onBlurCapture: () => setHovered(false),
  };

  if (!expanded) {
    return (
      <div data-testid="fab-launchers" data-expanded="false" {...handlers}>
        <Tooltip label="Agent loops — Innovate, Automate, Watchdog, Medic" side="top">
          <button
            type="button"
            data-testid="fab-launchers-collapsed"
            aria-label="Agent loop launchers"
            aria-expanded={false}
            onClick={() => useUiStore.getState().openFabTab(activeFabTab)}
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
      data-testid="fab-launchers"
      data-expanded="true"
      className="flex items-center gap-1"
      {...handlers}
    >
      {DEFAULT_LOOPS.map((loop, index) => (
        <LoopLauncher
          key={loop.id}
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
  loopId: string;
  label: string;
  Icon: ReturnType<typeof loopIcon>;
  status: LoopStatus | undefined;
  open: boolean;
  /** Whether the window has focus — see the comment at the call site. */
  pulsing: boolean;
};

function LoopLauncher({ loopId, label, Icon, status, open, pulsing }: LoopLauncherProps) {
  const running = status?.running ?? false;
  const waiting = status?.waiting ?? false;
  const color = waiting ? LOOP_WAITING_COLOR : loopGlowColor(loopId);

  const state = waiting ? 'waiting' : running ? 'running' : 'idle';

  return (
    <Tooltip label={`${label}${running ? (waiting ? ' — waiting on you' : ' — running') : ''}`} side="top">
      <button
        type="button"
        data-testid={`loop-launcher-${loopId}`}
        data-loop-state={state}
        data-loop-open={open ? 'true' : undefined}
        /*
          `"<Label> loop"`, deliberately not `"Open <Label>"`: the waiting-notice
          action button in the notification bell is already named
          `Open <Label>`, and Playwright's `getByRole({ name })` matches on
          substring by default — so `Open Innovate loop` made every spec
          reaching for that action a strict-mode violation.
        */
        aria-label={`${label} loop`}
        aria-pressed={open}
        onClick={() => {
          const ui = useUiStore.getState();
          if (open) ui.setFabPanelOpen(false);
          else ui.openFabTab(loopId as FabTab);
        }}
        // `--loop-launcher-color` is what lets one CSS rule serve four loops,
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
