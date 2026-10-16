import { LuChevronLeft, LuUsers } from 'react-icons/lu';

import { CouncilConfigPanel } from './council-config-panel';
import { CouncilList } from './council-list';
import { CouncilRunList } from './council-run-list';
import { CouncilRunView } from './council-run-view';
import { councilIdOf, useCouncilsHistory, type CouncilEntry } from './councils-history-store';
import { useCouncil, useCouncils } from './use-council';
import { useCouncilRuns } from './use-council-run';
import { EmptyState, PanelHeader, PanelStack, ResizeHandle, useRegisterActivePanel, useResizable } from '@midnite/studio-frame';
import { useCouncilsHost } from './host';
import { PageDetachMark } from './ui';

const COLLAPSED_WIDTH = 'w-9';

/**
 * Agent councils (Phase 34), rearranged into three panes (Phase 42): a
 * navigation rail left, the run output centre — the widest region, and the
 * one that grows — and configuration right.
 *
 * The responsive floor below 900px is the honest fallback the phase doc's
 * own Decisions recommend over a drawer/overlay with no precedent anywhere
 * in this app: the centre region carries a hard `min-w`, so a narrow window
 * scrolls rather than squeezing the output to nothing. Cut deliberately —
 * see the phase doc.
 *
 * **The navigation stack itself lives in `councils-history-store.ts`, not a
 * local `usePanelHistory` call (Phase 42 Theme E).** Councils is lazy and
 * unmounts on view switch, so a component-local stack would reset to the
 * list every time you left and came back within a session.
 */
export function CouncilsView() {
  const history = useCouncilsHistory();
  // Always true while this component is mounted — there is only ever one
  // Councils panel, so "is the Councils view active" and "is this the panel
  // on screen" are the same question here.
  useRegisterActivePanel(history, true);

  const layout = useCouncilsHost().useLayout();
  const { configCollapsed, setConfigCollapsed } = layout;

  const nav = useResizable({
    size: layout.nav.size,
    onSize: layout.nav.setSize,
    initial: layout.nav.initial,
    axis: 'x',
    min: layout.nav.min,
    max: layout.nav.max,
  });

  // The splitter sits on the panel's LEFT edge (`config` is docked to the
  // window's right), so dragging left must grow it — `edge: 'end'`, the same
  // inversion `app.tsx` calls out for the terminal and the detail pane.
  const config = useResizable({
    size: layout.config.size,
    onSize: layout.config.setSize,
    initial: layout.config.initial,
    axis: 'x',
    edge: 'end',
    min: layout.config.min,
    max: layout.config.max,
    // Collapsing must not overwrite the stored width — a separate boolean,
    // restored to the width it had rather than the default on expand.
    onCollapse: () => setConfigCollapsed(true),
  });

  const { data: councils } = useCouncils();
  const currentCouncilId = councilIdOf(history.current);

  const label = (entry: CouncilEntry): string => {
    switch (entry.kind) {
      case 'list':
        return 'Councils';
      case 'council':
        return councils?.find((c) => c.id === entry.id)?.name ?? 'Council';
      case 'run':
        // A specific run's own label (its prompt) belongs to whichever
        // council's runs are currently loaded, which an ancestor breadcrumb
        // may not be — kept generic rather than fetching every stack
        // entry's council just to name one crumb.
        return 'Run';
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex shrink-0 flex-col border-r border-border" style={{ width: nav.current }}>
        <div className="flex shrink-0 items-center gap-1 border-b border-border pl-1.5">
          <PageDetachMark role="councils" />
          <PanelHeader history={history} label={label} className="min-w-0 flex-1 px-1 py-1.5" />
        </div>
        {/*
          The rail's own PanelStack (Phase 42 Theme E) — sharing the same
          `history` the centre pane does, so a run picked here and a council
          picked here both drive one back/forward motion. Swaps between the
          council list (`'list'` entries) and this council's run list
          (`'council'`/`'run'` entries) — the run-tab strip that used to sit
          above `CouncilRunView` lives here now instead.
        */}
        <PanelStack
          history={history}
          className="min-h-0 flex-1"
          render={(entry) => {
            const entryCouncilId = councilIdOf(entry);
            return entryCouncilId === null ? (
              <CouncilList selectedId={null} onSelect={(id) => history.push({ kind: 'council', id })} />
            ) : (
              <CouncilRunList
                councilId={entryCouncilId}
                councilName={councils?.find((c) => c.id === entryCouncilId)?.name ?? 'Council'}
                activeRunId={entry.kind === 'run' ? entry.id : null}
                onSelectRun={(runId) => history.push({ kind: 'run', id: runId, councilId: entryCouncilId })}
                onBack={() => history.push({ kind: 'list' })}
              />
            );
          }}
        />
      </div>
      <ResizeHandle resizable={nav} axis="x" label="Resize councils navigation" />

      <PanelStack
        history={history}
        className="min-w-[320px] flex-1"
        render={(entry) => {
          const entryCouncilId = councilIdOf(entry);
          return entryCouncilId === null ? (
            <EmptyState
              icon={LuUsers}
              title="Select a council"
              body="Pick a council on the left, or create a new one to get started."
            />
          ) : (
            <CouncilOutput councilId={entryCouncilId} requestedRunId={entry.kind === 'run' ? entry.id : null} />
          );
        }}
      />

      {currentCouncilId !== null ? (
        configCollapsed ? (
          <button
            type="button"
            onClick={() => setConfigCollapsed(false)}
            aria-label="Expand configuration"
            className={`flex shrink-0 flex-col items-center justify-center border-l border-border text-muted-foreground hover:bg-accent ${COLLAPSED_WIDTH}`}
          >
            <LuChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <>
            <ResizeHandle resizable={config} axis="x" label="Resize council configuration" />
            <div className="shrink-0" style={{ width: config.current }}>
              <CouncilConfigWrapper
                councilId={currentCouncilId}
                onDeleted={() => history.reset()}
                onRunStarted={(runId) =>
                  history.push({ kind: 'run', id: runId, councilId: currentCouncilId })
                }
              />
            </div>
          </>
        )
      ) : null}
    </div>
  );
}

/** Resolves `requestedRunId` against the council's live run list, falling back to the latest. */
function CouncilOutput({
  councilId,
  requestedRunId,
}: {
  councilId: string;
  requestedRunId: string | null;
}) {
  const runs = useCouncilRuns(councilId);
  const runsData = runs.data ?? [];
  const activeRunId =
    (requestedRunId !== null && runsData.some((r) => r.id === requestedRunId) ? requestedRunId : null) ??
    runsData[runsData.length - 1]?.id ??
    null;

  return <CouncilRunView activeRunId={activeRunId} />;
}

function CouncilConfigWrapper({
  councilId,
  onDeleted,
  onRunStarted,
}: {
  councilId: string;
  onDeleted: () => void;
  onRunStarted: (runId: string) => void;
}) {
  const { data: council } = useCouncil(councilId);
  if (!council) return <EmptyState icon={LuUsers} title="Loading council…" />;
  return <CouncilConfigPanel council={council} onDeleted={onDeleted} onRunStarted={onRunStarted} />;
}
