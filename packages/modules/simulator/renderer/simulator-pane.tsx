import { FrameChromeProvider } from '@midnite/studio-frame';

import { SIMULATOR_CHROME, SimulatorDialogHost } from './compose/simulator-chrome';
import { AgentsView } from './views/agents-view';
import { AutomataView } from './views/automata-view';
import { WorldsView } from './views/worlds-view';

/**
 * Simulator as a pane inside a host's shell (Phase 127 Theme A.2): its own chrome, no `ReportIssueHost` —
 * the host owns the one entry. `onView` is part of the pane contract; the sandboxes do not navigate yet.
 */
export function SimulatorPane({ view }: { view: string; onView: (view: string) => void }) {
  return (
    <FrameChromeProvider chrome={SIMULATOR_CHROME}>
      {view === 'sim-worlds' ? <WorldsView /> : view === 'sim-agents' ? <AgentsView /> : <AutomataView />}
      <SimulatorDialogHost />
    </FrameChromeProvider>
  );
}
