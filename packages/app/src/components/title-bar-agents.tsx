import { LiveAgentCount } from '../features/agent/agent-count';
import { FabLaunchers } from '../features/loops/fab-launchers';

/**
 * The title bar's agent cluster — how many agent sessions are live, then the
 * four loop launchers — mounted at the **head** of `<TitleBar>`'s `right` slot,
 * ahead of the date/weather pill, the repo lifecycle actions and the theme
 * toggle.
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
 * No density mechanism follows them up here. The status bar's `.status-label`
 * hiding is keyed on `data-density` on its own `<footer>`, so neither control
 * loses anything by leaving: `LiveAgentCount` never used those classes, and the
 * launcher strip's own collapse — one glyph until a loop runs or a pointer
 * arrives — is a better fit for a bar this crowded than an overflow popover
 * would be.
 */
export function TitleBarAgents() {
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
        layout fault rather than a graceful degradation.
      */}
      <div
        data-testid="titlebar-agents"
        className="flex shrink-0 items-center gap-3 whitespace-nowrap text-xs text-muted-foreground"
      >
        <LiveAgentCount />
        <FabLaunchers />
      </div>
      <span aria-hidden data-testid="titlebar-agents-sep" className="h-4 w-px shrink-0 bg-border" />
    </>
  );
}
