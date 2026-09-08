import { useEffect, useRef } from 'react';

import { PanelStack } from '../../components/panel-stack/panel-stack';
import { usePanelHistory } from '../../components/panel-stack/use-panel-history';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { CompanionHeader } from './companion-header';
import { CompanionInputBar } from './companion-input-bar';
import { fabCompanionState } from './companion-look';
import { companionPorts } from './companion-ports';
import { CompanionThread } from './companion-thread';

/**
 * Which panel of the companion's own back/forward stack is showing.
 *
 * One entry today, and a `PanelStack` around it anyway, because that is what
 * makes `panel.back`/`panel.forward` (`Mod+[` / `Mod+]`) work the moment a
 * later theme pushes a second panel — a detail view for one hand-off, say.
 * Retro-fitting the stack later means retro-fitting the transition and the
 * history cap too; wrapping one root panel now costs a div.
 */
export type CompanionPanelEntry = { kind: 'thread' };

const ROOT_ENTRY: CompanionPanelEntry = { kind: 'thread' };

/**
 * The companion panel (Phase 79 Theme C) — a second right-docked column, left
 * of the Loops panel.
 *
 * A sibling column rather than a fifth Loops tab (Decision 4): both can be
 * open at once, each keeps its own persisted width and its own splitter, and
 * the Loops panel is untouched beyond sharing an edge.
 *
 * `width` is passed in rather than read from the store because the popout
 * (`detached-root.tsx`) has no splitter — it is the window's own width there,
 * and a component that read `layout.companionPanelWidth` directly would size a
 * detached companion to a docked column's saved pixels.
 */
export function CompanionPanel({
  width,
  reserveFabSpace = false,
}: {
  width?: number;
  /**
   * Whether this column is the rightmost thing on screen, and so has the FAB
   * floating over its bottom-right corner.
   *
   * The FAB is `absolute bottom-4 right-4` inside the whole content row, not
   * inside any one column, so it lands on top of whichever right-docked panel
   * is last. The Loops panel answers that by *hiding* the FAB while it is
   * open (`app.tsx`), and the companion deliberately does not: watching the
   * FAB run listening → thinking → handoff → speaking is Theme H's entire
   * point, and it would be visible only while the panel was shut. So the
   * input bar gives the button its 56px of corner back instead — which is
   * cheaper than a second FAB position and keeps both controls clickable.
   */
  reserveFabSpace?: boolean;
}) {
  const state = useCompanionStore((s) => s.state);
  const transcript = useCompanionStore((s) => s.transcript);
  const history = usePanelHistory<CompanionPanelEntry>(ROOT_ENTRY, {
    isSame: (a, b) => a.kind === b.kind,
  });

  /*
    Theme D's `greet()`, fired once per open rather than on every render or
    every state change.

    The ref, not a `useEffect` dependency on `state`: the greeting *changes*
    the state (to `greeting`, then `speaking`), so an effect keyed on it would
    re-enter the moment it succeeded. Mount is the honest trigger — this panel
    is unmounted while closed (`app.tsx` gates it on the tween), so "mounted"
    and "just opened" are the same event.

    `greet` is a no-op until Theme D registers one, which is why this can ship
    ahead of it.
  */
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    companionPorts().greet();
  }, []);

  return (
    <div
      className="flex h-full w-full min-h-0 flex-col border-l border-border bg-popover"
      style={width === undefined ? undefined : { width }}
      /*
        The same attribute the FAB wears (Theme H), on the panel too — the
        `[data-companion-state]` rules in `styles.css` are written against the
        attribute rather than a selector, so one set of rules serves both
        hosts. `undefined` for `off`/`idle` leaves the panel exactly as it
        looks today, which is what "no rule" has to mean in practice.
      */
      data-companion-state={fabCompanionState(state)}
      data-testid="companion-panel"
    >
      <CompanionHeader state={state} />
      {/*
        `flex-1 min-h-0` on the stack, and the stack's own panes are
        `absolute inset-0` — the thread has to be the only thing that scrolls,
        with the header and the input bar pinned. Without `min-h-0` a flex
        child refuses to shrink below its content and the input bar walks off
        the bottom of a long transcript.
      */}
      <PanelStack
        history={history}
        className="min-h-0 flex-1"
        render={() => <CompanionThread turns={transcript} />}
      />
      <CompanionInputBar
        disabled={state === 'thinking'}
        reserveFabSpace={reserveFabSpace}
        onInterrupt={() => companionPorts().interrupt()}
      />
    </div>
  );
}

/**
 * The panel, but only when the companion is switched on.
 *
 * A separate export so `app.tsx` mounts one thing and the enabled check lives
 * next to the panel it gates rather than in the layout. Returning `null` here
 * rather than never rendering the column keeps the tween in `app.tsx` honest —
 * the frame animates, the contents are simply absent, exactly how
 * `fabDetached` is handled beside it.
 */
export function CompanionPanelSlot({
  width,
  reserveFabSpace,
}: {
  width?: number;
  reserveFabSpace?: boolean;
}) {
  const enabled = useUiStore((s) => s.companionEnabled);
  if (!enabled) return null;
  return <CompanionPanel width={width} reserveFabSpace={reserveFabSpace} />;
}
