import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { useEffect } from 'react';

import { loopIcon } from '../features/loops/loop-icons';
import { LoopTab } from '../features/loops/loop-tab';
import { useAllLoopStatuses, type LoopStatus } from '../features/loops/loop-status';
import { useLoopRuns } from '../features/loops/use-loop-runs';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useUiStore, type FabTab } from '../store/ui-store';

interface FabPanelProps {
  isOpen: boolean;
  width: number;
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
 * The four tabs are data now — `DEFAULT_LOOPS` in `@midnite/studio-shared` —
 * not a fourth hard-coded copy of the prompts that already live in
 * `agentSkills`. Each loop's base prompt is read through its `agentCommandId`,
 * so editing a `/loop …` field in Settings ▸ Agent changes what the tab runs.
 */
export function FabPanel({ isOpen, width }: FabPanelProps) {
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const onTabClick = useUiStore((s) => s.onFabTabClick);
  const statuses = useAllLoopStatuses(LOOP_IDS);
  const runs = useLoopRuns();

  usePruneSupersededSessions(activeFabTab);
  useHydrateOnOpen(isOpen);
  useWindowFocusGate(isOpen);

  if (!isOpen) return null;

  const activeIndex = LOOP_IDS.indexOf(activeFabTab);
  const loopState = loopGlowState(statuses[activeIndex]);

  return (
    <div className="h-full w-full flex flex-col" style={{ width }}>
      <div
        className="fab-panel-gradient relative h-full w-full border border-border bg-popover flex flex-col"
        data-fab-tab={activeFabTab}
        data-loop-state={loopState}
      >
        {/* Tab Bar */}
        <div className="flex border-b border-border shrink-0">
          {DEFAULT_LOOPS.map((loop, index) => {
            const Icon = loopIcon(loop.icon);
            const status = statuses[index];
            return (
              <button
                key={loop.id}
                onClick={() => onTabClick(loop.id as FabTab)}
                className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                  activeFabTab === loop.id
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={loop.label}
              >
                <Icon className={`h-4 w-4 ${loop.color}`} />
                <span className="text-xs font-medium">{loop.label}</span>
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
        </div>

        {/* One pane per loop; only the active one is visible. */}
        <div className="flex-1 min-h-0 relative">
          {DEFAULT_LOOPS.map((loop) => (
            <div
              key={loop.id}
              data-fab-tab={loop.id}
              className={`absolute inset-0 ${activeFabTab === loop.id ? 'visible' : 'invisible'}`}
            >
              <LoopTab
                loop={loop}
                active={activeFabTab === loop.id}
                runs={runs.data.filter((run) => run.loopId === loop.id)}
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
 * Freezes the panel's rainbow glow (Phase 37 Theme B) the instant the OS
 * takes focus elsewhere, and lets it run again on return.
 *
 * `document.visibilityState` (what `use-now.ts` gates on) answers a
 * different question — hidden vs. visible, i.e. minimised or on another
 * space — and stays `'visible'` for a window that is merely blurred behind
 * another app, which is exactly the state Phase 36's `idle-cpu.mjs
 * --blurred` measures and the state a permanently-mounted rotating,
 * pulsing panel should not keep animating through. `window.hasFocus()` /
 * `focus` / `blur` are the only signal for that.
 *
 * Scoped to while the panel is open — nothing needs this attribute set
 * before the glow exists to gate, and cleanup on close avoids leaving a
 * stale `false` behind for whatever mounts next.
 */
function useWindowFocusGate(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    const setFocused = (focused: boolean): void => {
      document.documentElement.dataset['windowFocused'] = focused ? 'true' : 'false';
    };
    setFocused(document.hasFocus());
    const onFocus = (): void => setFocused(true);
    const onBlur = (): void => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      delete document.documentElement.dataset['windowFocused'];
    };
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
      useTerminalStore.getState().closeSession(sessionId);
      ui.setFabPrevSession(tab as FabTab, undefined);
    }
  }, [activeFabTab]);
}
