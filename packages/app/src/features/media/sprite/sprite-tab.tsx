import {
  SPRITE_GROUP_IDS,
  spriteDirections,
  spriteFolderLabel,
  type SpriteAssetSpec,
  type SpriteGroupId,
  type SpriteProgressEvent,
} from '@midnite/studio-shared';
import { useMemo, useState } from 'react';

import { EmptyState } from '../../../components/empty-state';
import { Spinner } from '../../../components/skeleton';
import { useUiStore } from '../../../store/ui-store';
import { MediaLayout } from '../media-layout';
import type { MediaSelection } from '../media-projects-accordion';
import { MEDIA_TAB_META } from '../media-tabs';
import { NoRepoMediaState } from '../repo-media-tab';
import { SpriteCreatePanel } from './sprite-create-panel';
import { SpriteExplorer, spriteOfPath } from './sprite-explorer';
import { useSprite, useSpriteActions, useSpriteChangedInvalidation, useSpriteProgress, type SpriteRef } from './use-sprite';

/**
 * Media ▸ Sprites: the library of assets on the left (five fixed groups), the selected asset in the
 * middle, and the create panel on the right. An asset is a folder under
 * `.midnite/media/sprite/<group>/` — its `sprite.json` is the source of truth, and generation runs
 * as a cancellable job in main whose progress arrives on `mediaSpriteProgress`.
 *
 * The animation previewer and frame strip land with Theme G; until then the centre is the asset's
 * spec at a glance and its job.
 */
export function SpriteTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="sprite" />;
  return <SpriteTabBody repoId={repoId} />;
}

const isGroup = (value: string): value is SpriteGroupId => (SPRITE_GROUP_IDS as readonly string[]).includes(value);

function SpriteTabBody({ repoId }: { repoId: string }) {
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const [jobs, setJobs] = useState<Record<string, string>>({});
  useSpriteChangedInvalidation(repoId);
  const progress = useSpriteProgress();
  const actions = useSpriteActions(repoId);

  const ref = useMemo<SpriteRef | null>(
    () => (selection?.path && isGroup(selection.project) ? { group: selection.project, asset: spriteOfPath(selection.path) } : null),
    [selection],
  );
  const refKey = ref ? `${ref.group}/${ref.asset}` : '';
  const sprite = useSprite(repoId, ref);
  const jobId = jobs[refKey];
  const event = jobId ? progress[jobId] : undefined;
  const running = jobId !== undefined && event?.state === undefined;

  const select = (group: SpriteGroupId, asset: string) => setSelection({ project: group, path: `${asset}/sprite.json` });

  const centre = !ref ? (
    <EmptyState icon={MEDIA_TAB_META.sprite.icon} title="Select a sprite" body="Pick one on the left, or create one on the right." />
  ) : sprite.isPending ? (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  ) : sprite.isError ? (
    <EmptyState title="Could not read this sprite" body={sprite.error.message} />
  ) : (
    <SpriteOverview
      spec={sprite.data.spec}
      frameCount={Object.keys(sprite.data.frames.frames).length}
      event={event}
      running={running}
      onGenerate={async () => {
        const result = await actions.generate(ref);
        if (result.ok) setJobs((current) => ({ ...current, [refKey]: result.value.jobId }));
        else return result.kind === 'error' ? result.message : 'Could not start generation.';
        return null;
      }}
      onCancel={() => (jobId ? void actions.cancel(jobId) : undefined)}
    />
  );

  return (
    <MediaLayout
      tab="sprite"
      explorerName="library"
      detailName="create panel"
      explorer={<SpriteExplorer repoId={repoId} selection={selection} onSelect={setSelection} />}
      content={centre}
      detail={
        <SpriteCreatePanel
          repoId={repoId}
          onCreated={select}
          onJob={(created, id) => setJobs((current) => ({ ...current, [`${created.group}/${created.asset}`]: id }))}
        />
      }
    />
  );
}

function SpriteOverview({
  spec,
  frameCount,
  event,
  running,
  onGenerate,
  onCancel,
}: {
  spec: SpriteAssetSpec;
  frameCount: number;
  event: SpriteProgressEvent | undefined;
  running: boolean;
  onGenerate: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const rows = specRows(spec);
  const outcome = event?.state === 'failed' || event?.state === 'cancelled' ? event.message : null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4" data-testid="sprite-overview">
      <div className="flex items-center gap-2">
        <h2 className="truncate text-sm font-semibold">{spriteFolderLabel(spec.name)}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{spec.kind}</span>
        {spec.kind === 'sheet' ? (
          <div className="ml-auto flex items-center gap-2">
            {running ? (
              <>
                <span className="text-[11px] tabular-nums text-muted-foreground" data-testid="sprite-progress">
                  {event ? `${event.stage} ${event.done}/${event.total}` : 'Starting…'}
                </span>
                <button type="button" onClick={onCancel} className="h-7 rounded-md border border-border px-3 text-xs font-medium">
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  void onGenerate().then(setError);
                }}
                className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
              >
                Generate
              </button>
            )}
          </div>
        ) : null}
      </div>
      {error || outcome ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          {error ?? outcome}
        </p>
      ) : null}
      {spec.prompt ? <p className="text-xs text-muted-foreground">{spec.prompt}</p> : null}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Frames</dt>
        <dd className="tabular-nums">
          {frameCount}
          {spec.lastReport ? ` (${spec.lastReport.failing} failing)` : ''}
        </dd>
      </dl>
      {spec.kind === 'sheet' ? (
        <table className="w-full text-left text-xs" aria-label="Clips">
          <thead className="text-[11px] text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Clip</th>
              <th className="py-1 font-medium">Frames</th>
              <th className="py-1 font-medium">FPS</th>
              <th className="py-1 font-medium">Loop</th>
            </tr>
          </thead>
          <tbody>
            {spec.clips.map((clip) => (
              <tr key={clip.name} className="border-t border-border/40">
                <td className="py-1">{clip.name}</td>
                <td className="py-1 tabular-nums">{clip.frames}</td>
                <td className="py-1 tabular-nums">{clip.fps}</td>
                <td className="py-1">{clip.loop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function specRows(spec: SpriteAssetSpec): Array<[string, string]> {
  switch (spec.kind) {
    case 'sheet':
      return [
        ['Style', spec.style],
        ['Perspective', spec.targetPerspective],
        ['Frame size', `${spec.frameSize[0]} × ${spec.frameSize[1]}`],
        ['Directions', spriteDirections(spec).length > 1 ? `${spec.directions} (${spriteDirections(spec).join(' ')})` : `1 (${spriteDirections(spec)[0]})`],
        ['Method', spec.method],
      ];
    case 'tileset':
      return [['Style', spec.style], ['Projection', spec.projection], ['Tile size', String(spec.tileSize)], ['Autotile', spec.autotile]];
    case 'background':
      return [['Style', spec.style], ['Size', `${spec.size[0]} × ${spec.size[1]}`], ['Layers', String(spec.layers)]];
    case 'prop-sheet':
      return [['Style', spec.style], ['Cell', `${spec.cell[0]} × ${spec.cell[1]}`], ['Props', String(spec.props.length)]];
    case 'map':
      return [['Style', spec.style], ['Size', `${spec.size[0]} × ${spec.size[1]} tiles`], ['Tile size', String(spec.tileSize)]];
  }
}
