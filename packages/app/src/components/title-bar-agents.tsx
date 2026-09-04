import { useRef } from 'react';

import { LiveAgentCount } from '../features/agent/agent-count';
import { FabLaunchers } from '../features/loops/fab-launchers';
import { useTitleBarDensity } from './use-titlebar-density';

/**
 * The title bar's agent cluster — how many agent sessions are live, then the
 * four loop launchers — mounted at the **head** of `<TitleBar>`'s `right` slot,
 * ahead of the date/weather pill and the theme toggle.
 *
 * Both readouts used to be `STATUS_SEGMENTS` entries in the status bar's left
 * zone, in its `live` group. They are the only two things in this app that
 * answer "what are the agents doing", and the window's top-right corner is
 * where this app already puts the readouts you glance at rather than the
 * controls you drive — so they read as one thing here in a way they never did
 * wedged between five shortcut toggles and a diagnostics count.
 *
 * **The trailing hairline belongs to this component, not to its host.** `chrome`
 * in [`app.tsx`](../app.tsx) is rendered whole in both the frameless and the
 * native-frame path, and the title bar's rule — stated at the head of that same
 * cluster — is that a separator must never be stranded. Owning the rule here
 * makes that automatic: the rule renders exactly when the cluster does, and the
 * cluster always renders, because `FabLaunchers` has a collapsed form and never
 * returns `null`. (`LiveAgentCount` does return `null` at zero agents, which is
 * why the rule cannot be its responsibility.)
 *
 * **It carries its own density, and it has to.** The first version of this
 * component said no density mechanism was needed up here, and that was wrong:
 * `@bilo-io/shell` gives the title bar's two slots `shrink-0`, so a bar over
 * budget pushes its last control off the right edge of the window rather than
 * squeezing. Measured with one live agent, the bar wants 1138px and this
 * cluster is 105px of it — so adding it moved the point at which `ThemeToggle`
 * leaves the viewport from ~1027px to ~1138px. `useTitleBarDensity` measures
 * the header and stamps `data-density` here, which drives the same
 * `.status-label` / `.status-collapsible` rules in
 * [`styles.css`](../styles.css) that the status bar's own `data-density` does:
 *
 * - `full` (105px) — `3 agents`, and the launcher strip.
 * - `compact` (68px) — the number without the word. "agents" is grammar; the
 *   digit is the information.
 * - `collapsed` (35px) — the count drops out entirely and the strip's collapsed
 *   glyph stays, because the strip is how a loop is *started* and the count is
 *   a click-through to the terminal panel, which `Ctrl+`` already opens.
 *
 * That gives back 70 of the 111px, so the cliff sits at ~1055px. The remaining
 * overflow below that is **not** this cluster's: it is the left slot's 532px of
 * wordmark, history, reload, breadcrumbs and sync cluster, which predates this
 * component and needs its own pass.
 */
export function TitleBarAgents() {
  const ref = useRef<HTMLDivElement | null>(null);
  const density = useTitleBarDensity(ref);

  return (
    <>
      {/*
        `gap-3` and `text-xs text-muted-foreground` reproduce the status bar
        `<footer>`'s own typography and the left zone's spacing, which is what
        these two were designed against — the shell's right slot supplies
        `gap-1.5` and inherits a larger size, and both controls read as
        crowded, oversized versions of themselves under it.

        `whitespace-nowrap` + `shrink-0` for the same reason the status bar's
        zones carry them: a flex child that is allowed to shrink wraps its text
        instead, and "2 agents" broken over two lines in a 48px bar is a
        layout fault rather than a graceful degradation. Shedding width is the
        density's job, not the flex algorithm's.
      */}
      <div
        ref={ref}
        data-testid="titlebar-agents"
        data-density={density}
        className="flex shrink-0 items-center gap-3 whitespace-nowrap text-xs text-muted-foreground"
      >
        <LiveAgentCount />
        <FabLaunchers />
      </div>
      <span aria-hidden data-testid="titlebar-agents-sep" className="h-4 w-px shrink-0 bg-border" />
    </>
  );
}
