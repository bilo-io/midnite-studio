import { Suspense, lazy } from 'react';

import { DelayedFallback } from '../../components/delayed-fallback';

/**
 * `TerminalView`, out of the entry chunk — Phase 36 Theme C.
 *
 * `@xterm/xterm` plus the webgl addon is one of the biggest single things the
 * renderer loads, and until this split it was loaded during boot by a window that
 * opens with the terminal closed. Both of its consumers — the terminal panel and
 * the FAB's loop tabs — go through this one module, because a second static
 * import anywhere would put xterm straight back in the entry and nothing would
 * say so.
 *
 * The loader is exported so `app.tsx` can hand it to `idlePreload` after first
 * paint. `Ctrl+`` is meant to feel instant and it is a single keystroke away at
 * all times; warming the chunk at idle means the split costs boot bytes and, in
 * practice, no visible wait at all. The `DelayedFallback` behind it is the
 * safety net for the case where someone hits the chord inside the first frames.
 */
export const loadTerminalView = (): Promise<unknown> => import('./terminal-view');

const TerminalViewLazy = lazy(() =>
  import('./terminal-view').then((m) => ({ default: m.TerminalView })),
);

export type LazyTerminalViewProps = React.ComponentProps<typeof TerminalViewLazy>;

export function LazyTerminalView(props: LazyTerminalViewProps) {
  /*
    The fallback takes the same box as the view it stands in for.
    `terminal-panel.tsx` stacks every open session with `absolute inset-0` and
    shows one; a normal-flow fallback there would put one unpositioned spinner per
    session into the flow, all visible at once. The FAB pane passes its own
    classes for the same reason the view does.
  */
  const layoutClassName = props.layoutClassName ?? 'absolute inset-0';
  return (
    <Suspense
      fallback={
        <div className={layoutClassName}>
          <DelayedFallback />
        </div>
      }
    >
      <TerminalViewLazy {...props} />
    </Suspense>
  );
}
