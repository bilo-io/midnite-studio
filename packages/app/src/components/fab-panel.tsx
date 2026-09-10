import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { LuSquareArrowOutUpRight, LuX } from 'react-icons/lu';

import { BrandMark } from './brand';
import { SwitchRow } from './form/toggle-rows';
import { IconButton } from './icon-button';
import { loopGlowColor } from '../features/loops/loop-glow';
import { loopIcon } from '../features/loops/loop-icons';
import { LoopTab } from '../features/loops/loop-tab';
import { useAllLoopStatuses, type LoopStatus } from '../features/loops/loop-status';
import { useLoopRuns } from '../features/loops/use-loop-runs';
import { fabCompanionState } from '../features/companion/companion-look';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useWindowFocusGate } from '../lib/use-window-focus-gate';
import { bridge } from '../services/bridge';
import { useCompanionStore } from '../store/companion-store';
import { useUiStore, type FabTab } from '../store/ui-store';

interface FabPanelProps {
  isOpen: boolean;
  width: number;
  /**
   * Bumped once the panel's own open/close tween settles — the FAB
   * equivalent of `TerminalPanel`'s `fitSignal` prop (`app.tsx`'s
   * `terminalTween.settleCount`). Every loop tab's `LazyTerminalView` needs
   * this to fit and repaint once the reveal animation finishes; without it
   * xterm can settle at a stale size and paint nothing until an unrelated
   * resize (a window resize, or dragging the panel handle) forces a real
   * `ResizeObserver` tick.
   */
  fitSignal: number;
}

const LOOP_IDS = DEFAULT_LOOPS.map((loop) => loop.id);

/** The four states `styles.css`'s `[data-loop-state]` rules key their pulse cadence off. */
type LoopGlowState = 'idle' | 'running' | 'thinking' | 'waiting';

/** Amber outranks the loop colour (Theme E) — same rule as the tab dot above. */
function loopGlowState(status: LoopStatus | undefined): LoopGlowState {
  if (!status?.running) return 'idle';
  if (status.waiting) return 'waiting';
  if (status.thinking) return 'thinking';
  return 'running';
}

/**
 * The FAB's loop console (Phase 35).
 *
 * The six tabs are data now — `DEFAULT_LOOPS` in `@midnite/studio-shared` —
 * not a sixth hard-coded copy of the prompts that already live in
 * `agentSkills`. Each loop's base prompt is read through its `agentCommandId`,
 * so editing a `/loop …` field in Settings ▸ Agent changes what the tab runs.
 */
export function FabPanel({ isOpen, width, fitSignal }: FabPanelProps) {
  // This exact panel renders inside the Loops popout too (`DetachedRoot`
  // reuses it verbatim) — the detach button would otherwise advertise
  // "detach me into a window" while already being one.
  const isPopout = (bridge()?.windowRole ?? 'main') !== 'main';
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const onTabClick = useUiStore((s) => s.onFabTabClick);
  const setFabPanelOpen = useUiStore((s) => s.setFabPanelOpen);
  const loopEnabled = useUiStore((s) => s.loopEnabled);
  const setLoopEnabled = useUiStore((s) => s.setLoopEnabled);
  const statuses = useAllLoopStatuses(LOOP_IDS);
  const companionState = useCompanionStore((s) => s.state);
  const runs = useLoopRuns();

  usePruneSupersededSessions(activeFabTab);
  useHydrateOnOpen(isOpen);
  useWindowFocusGate(isOpen);

  if (!isOpen) return null;

  const activeIndex = LOOP_IDS.indexOf(activeFabTab);
  const loopState = loopGlowState(statuses[activeIndex]);
  const anyRunning = statuses.some((s) => s.running);

  return (
    <div className="h-full w-full flex flex-col" style={{ width }}>
      <div
        className="companion-face gradient-frame fab-panel-gradient relative h-full w-full border border-border bg-popover flex flex-col"
        data-fab-tab={activeFabTab}
        data-loop-state={loopState}
        data-loops-running={anyRunning ? 'true' : 'false'}
        /*
          Phase 79 Theme H. The companion's four looks ride the SAME
          `.gradient-frame` host the loop cadence rules key off, so this panel
          picks up the companion's state alongside its own — one attribute,
          one set of rules in `styles.css`, whichever host sets it.
        */
        data-companion-state={fabCompanionState(companionState)}
      >
        {/*
          Tab Bar — the detach control rides in the SAME row as the loop tabs
          (a leading brand-mark/button slot, exactly `terminal-header.tsx`'s
          `HeaderMark` hover-morph) rather than a header row of its own.

          A dedicated header cost real `shrink-0` height that this panel does
          not have to spare: the loop tabs' terminal pane already lives on
          whatever the composer above it leaves behind (`flex-1 min-h-0`), and
          a 28px header pushed that remainder low enough that xterm's own
          `clientHeight === 0` open-guard (`terminal-view.tsx`) started
          rejecting it — the pane never rendered `.xterm-screen` at all. This
          row was already there, so folding the button into it costs nothing.

          The tabs themselves match `tab-strip.tsx` (the workbench's own tab
          row): icon left, label beside it, `flex-row` rather than the taller
          icon-over-label stack this used to be — one shorter control that
          reads the same way in both places.
        */}
        <div data-testid="fab-panel-tabbar" className="group flex border-b border-border shrink-0">
          <div className="relative flex w-8 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className="pointer-events-none absolute flex items-center justify-center transition-opacity group-hover:opacity-0"
            >
              <BrandMark className="h-4 w-4" />
            </span>
            {!isPopout && (
              <IconButton
                icon={LuSquareArrowOutUpRight}
                label="Detach Loops Panel into its own window"
                size="sm"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => bridge()?.window.detach({ role: 'fab' })}
              />
            )}
          </div>
          {DEFAULT_LOOPS.map((loop, index) => {
            const Icon = loopIcon(loop.icon);
            const status = statuses[index];
            const isSelected = activeFabTab === loop.id;
            /*
              The "Loop" switch (directly under the tab bar) is per-loop and
              persists across tab switches — so a tab you toggled on stays
              recoloured even while another tab is the one showing.
            */
            const isLoopOn = loopEnabled[loop.id] ?? false;
            return (
              <button
                key={loop.id}
                data-fab-tab={loop.id}
                data-selected={isSelected ? 'true' : 'false'}
                onClick={() => onTabClick(loop.id as FabTab)}
                className={`tab-loop-button relative flex-1 flex min-w-0 flex-row items-center justify-start gap-1 overflow-hidden px-1.5 py-1.5 ${
                  isSelected ? 'is-selected' : ''
                }`}
                style={isLoopOn ? { backgroundColor: 'rgb(var(--fab-spec-3))' } : undefined}
                title={loop.label}
              >
                {/*
                  When a loop is running on this tab: rotating inner gradient arc
                  with glow, constrained to this mode's sub-spectrum. Left alone
                  by the "Loop" switch below — that recolours the idle icon,
                  label and shimmer, not this glow.
                */}
                {status?.running ? (
                  <span
                    aria-hidden
                    data-testid={`loop-active-arc-${loop.id}`}
                    data-fab-tab={loop.id}
                    className="tab-loop-active-arc pointer-events-none absolute inset-0"
                  />
                ) : null}
                {/*
                  Tabs without a loop running carry the gentle shimmer sweep,
                  half as frequent and moving half as fast. White instead of
                  the loop's own colour once its "Loop" switch is on — the
                  same contrast call as the icon and label below.
                */}
                {!status?.running ? (
                  <span
                    aria-hidden
                    data-testid={`loop-shimmer-${loop.id}`}
                    className="tab-loop-shimmer pointer-events-none absolute inset-0"
                    style={
                      {
                        background: `linear-gradient(100deg, transparent 43%, ${isLoopOn ? '#ffffff' : loopGlowColor(loop.id)} 50%, transparent 57%)`,
                        '--tab-i': index,
                      } as CSSProperties
                    }
                  />
                ) : null}
                <Icon className={`relative h-3.5 w-3.5 shrink-0 ${isLoopOn ? 'text-white' : loop.color}`} />
                <span
                  className={`relative min-w-0 truncate text-xs ${isSelected ? 'font-semibold' : 'font-medium'} ${isLoopOn ? 'text-white' : loop.color}`}
                >
                  {loop.label}
                </span>
                {/* The active tab's title carries its own underline sliver, in the loop's colour — white on top of the same solid colour once "Loop" is on. */}
                {isSelected ? (
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-current ${isLoopOn ? 'text-white' : loop.color}`}
                  />
                ) : null}
                {/*
                  The live dot, so four unattended loops are legible without
                  visiting each tab. Amber outranks the loop colour: a loop
                  with a question on screen is the one you need.
                */}
                {status?.running ? (
                  <span
                    aria-hidden
                    data-testid={`loop-dot-${loop.id}`}
                    className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
                      status.waiting ? 'bg-amber-500' : 'bg-current'
                    } ${status.waiting ? '' : loop.color}`}
                  />
                ) : null}
              </button>
            );
          })}
          {/*
            Close, at the far end of the row rather than beside the detach
            slot — `companion-header.tsx`'s own close button is the last
            control in its row, and this follows that placement idiom rather
            than Detach's.

            Hidden in a popout, exactly like Detach, and for a sibling reason
            rather than the same one: `DetachedContent` (`detached-root.tsx`)
            passes this panel a hardcoded `isOpen`, not the store's
            `fabPanelOpen` — so `setFabPanelOpen(false)` here would flip a
            flag nothing downstream in THIS window reads, an inert click
            rather than a close. (`companion-header.tsx`'s own close button is
            hidden in its popout for the identical reason — its neighbouring
            comment there is about the Clear button being the one exception,
            not about Close being one.)
          */}
          {!isPopout && (
            <div className="flex w-8 shrink-0 items-center justify-center">
              <IconButton
                icon={LuX}
                label="Close the Loops Panel"
                size="sm"
                onClick={() => setFabPanelOpen(false)}
              />
            </div>
          )}
        </div>

        {/*
          The active tab's own "Loop" switch — off by default. Flipping it
          paints this row AND the active tab above with the loop's own
          sub-spectrum centre (`--fab-spec-3`), and turns that tab's icon,
          label and idle shimmer white so they still read against the now
          solid-coloured background. The state is per loop id (`loopEnabled`),
          not per row instance, so switching tabs shows whichever loop you
          land on already at its own remembered setting.
        */}
        <div
          data-testid="fab-panel-loop-row"
          className="flex shrink-0 items-center border-b border-border px-2 py-1.5"
          style={
            (loopEnabled[activeFabTab] ?? false)
              ? { backgroundColor: 'rgb(var(--fab-spec-3))' }
              : undefined
          }
        >
          <SwitchRow
            id={`loop-enabled-${activeFabTab}`}
            label="Loop"
            on={loopEnabled[activeFabTab] ?? false}
            onToggle={(_id, on) => setLoopEnabled(activeFabTab, on)}
            className={(loopEnabled[activeFabTab] ?? false) ? '!text-white' : ''}
          />
        </div>

        {/*
          One pane per loop; only the active one is visible. All four stay
          mounted — a tab's terminal is its whole point and remounting one
          would throw the session away — so the three behind it are stacked
          under the active one at `inset-0`.

          `inert` alongside `invisible`, because `visibility: hidden` is not
          the guarantee it looks like: it inherits, but a descendant that sets
          `visibility: visible` climbs back out of it, and `react-select`'s
          input does exactly that. The composer's four selects in each hidden
          pane were therefore live, focusable and — being at identical
          coordinates to the visible pane's own — intercepting clicks aimed at
          the tab you are actually looking at. `inert` takes the whole subtree
          out of hit-testing and out of the tab order in one attribute,
          whatever any descendant says about its own visibility.
        */}
        <div className="flex-1 min-h-0 relative">
          {DEFAULT_LOOPS.map((loop) => (
            <div
              key={loop.id}
              data-fab-tab={loop.id}
              inert={activeFabTab !== loop.id}
              className={`absolute inset-0 ${activeFabTab === loop.id ? 'visible' : 'invisible'}`}
            >
              <LoopTab
                loop={loop}
                active={activeFabTab === loop.id}
                runs={runs.data.filter((run) => run.loopId === loop.id)}
                fitSignal={fitSignal}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Restore saved sessions when the console is first opened.
 *
 * `hydrate()` is what turns `terminals.json` back into rows, and until
 * Phase 35's Theme I nothing but `TerminalPanel` ever called it — so a loop
 * that was running when the app quit came back only if you happened to open
 * the *main* terminal panel first, and the FAB tab that owned it showed
 * "Press Start" over a session that was sitting on disk the whole time.
 *
 * On open rather than on mount, and never at boot: the read pulls every
 * session's scrollback with it, which is the wrong thing to put on the
 * startup path for a panel most launches never open. `hydrate()` returns
 * immediately once `hydrated` is set, so opening the FAB after the terminal
 * panel (or the other way round) costs nothing the second time.
 */
function useHydrateOnOpen(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    void useTerminalStore.getState().hydrate();
  }, [isOpen]);
}

/**
 * Close the session a tab superseded, once the user has left that tab.
 *
 * Start begins a fresh run but parks its predecessor rather than killing it
 * mid-read (`fabPrevSessions`). "You have navigated away" is the honest
 * moment to collect it: the transcript is no longer on screen, and holding it
 * any longer would leave dead sessions in `terminals.json` for a relaunch to
 * rehydrate.
 */
function usePruneSupersededSessions(activeFabTab: FabTab): void {
  useEffect(() => {
    const ui = useUiStore.getState();
    for (const [tab, sessionId] of Object.entries(ui.fabPrevSessions)) {
      if (tab === activeFabTab) continue;
      // `'superseded'` rather than a plain close: history should be able to say
      // this one was collected by a newer run, not chosen by the user.
      useTerminalStore.getState().closeSession(sessionId, 'superseded');
      ui.setFabPrevSession(tab as FabTab, undefined);
    }
  }, [activeFabTab]);
}
