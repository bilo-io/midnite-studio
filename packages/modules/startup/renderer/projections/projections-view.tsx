import { LuChartArea } from 'react-icons/lu';

import { EmptyState, ResizeHandle, useResizable } from '@midnite/studio-frame';
import type { FleetProjection } from '@midnite/studio-shared';

import { ControlsPanel } from './controls-panel';
import { ProjectionList, StarterButtons, useCreateProjection } from './projection-list';
import { ResultsPanel } from './results-panel';
import { PANE } from './styles';
import { useFleetDraft } from './use-fleet-draft';
import { CONTROLS_BOUNDS, LIST_BOUNDS, selectedProjection, useProjectionsUi } from './use-projections-ui';

const READ_ONLY_TEXT = 'This workspace was written by a newer Midnite Startup. It is read-only here.';

/** Startup's first view: a saved list on the left, results in the centre, every control on the right. */
export default function ProjectionsView({ projections, readOnly }: { projections: readonly FleetProjection[]; readOnly: boolean }) {
  const ui = useProjectionsUi();
  const source = selectedProjection(projections, ui.selectedId);
  const { draft, result, update, pending, problem } = useFleetDraft(source, readOnly);
  const creator = useCreateProjection(projections, ui.select);
  const list = useResizable({ size: ui.listWidth, onSize: ui.setListWidth, axis: 'x', ...LIST_BOUNDS });
  const controls = useResizable({ size: ui.controlsWidth, onSize: ui.setControlsWidth, axis: 'x', edge: 'end', ...CONTROLS_BOUNDS });

  return (
    <main aria-label="Projections" className="flex h-full min-h-0 gap-0 p-3">
      <div style={{ width: list.current }} className={`shrink-0 ${list.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}`}>
        <ProjectionList projections={projections} selectedId={source?.id ?? null} readOnly={readOnly} onSelect={ui.select} />
      </div>
      <ResizeHandle resizable={list} axis="x" label="Resize projection list" />
      <section aria-label="Results" className="flex min-w-[480px] flex-1 flex-col gap-3 overflow-y-auto px-3">
        {readOnly ? <p className="text-xs text-amber-500">{READ_ONLY_TEXT}</p> : null}
        {draft !== null && result !== null ? (
          <ResultsPanel draft={draft} result={result} update={update} pending={pending} problem={problem} readOnly={readOnly} />
        ) : (
          <EmptyState
            icon={LuChartArea}
            title="No projections yet"
            body="Start from a template to model a compute fleet."
            action={<StarterButtons disabled={readOnly} onPick={creator.create} />}
          />
        )}
        {creator.problem !== null && draft === null ? (
          <p role="alert" className="text-xs text-red-500">
            {creator.problem}
          </p>
        ) : null}
      </section>
      <ResizeHandle resizable={controls} axis="x" label="Resize controls" />
      <div style={{ width: controls.current }} className={`shrink-0 overflow-y-auto ${PANE} ${controls.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}`}>
        {draft !== null ? <ControlsPanel draft={draft} update={update} readOnly={readOnly} /> : <p className="p-3 text-xs text-muted-foreground">Select a projection</p>}
      </div>
    </main>
  );
}
