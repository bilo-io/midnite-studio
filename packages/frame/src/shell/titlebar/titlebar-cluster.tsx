import { TitleBarBattery } from './battery/battery-titlebar';
import { TitleBarStatus } from './status/titlebar-status';
import { ThemeToggle } from './theme-toggle';

/**
 * The title bar's suite-wide right cluster (Phase 123 Theme J.4, decision 10): the date/time/weather pill,
 * the battery (absent on a machine without one) and the theme toggle, in Studio's order. `AppShell` renders
 * it after `titleBarEnd`.
 */
export function TitleBarCluster() {
  return (
    <>
      <TitleBarStatus />
      <TitleBarBattery />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <span data-testid="app-shell-theme-toggle" className="flex">
        <ThemeToggle />
      </span>
    </>
  );
}
