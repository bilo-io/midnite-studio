import {
  handDrawnBlocker,
  resolveRenderSettings,
  SPRITE_GROUP_IDS,
  spriteDirections,
  spriteFolderLabel,
  type SpriteAssetSpec,
  type SpriteFramesFile,
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
import { SpriteAnimator } from './sprite-animator';
import { SpriteCreatePanel } from './sprite-create-panel';
import { SpriteEnvironmentPreview } from './sprite-environment-preview';
import { SpriteExplorer, spriteOfPath } from './sprite-explorer';
import { SpriteOneShotPanel } from './sprite-one-shot-panel';
import { SpriteFlaggedFrames, SpriteReferenceCard, type ReferenceChange } from './sprite-reference-card';
import { useSprite, useSpriteActions, useSpriteChangedInvalidation, useSpriteProgress, type SpriteRef } from './use-sprite';

/**
 * Media ▸ Sprites: the library of assets on the left (five fixed groups), the selected asset in the
 * middle, and the create panel on the right. An asset is a folder under
 * `.midnite/media/sprite/<group>/` — its `sprite.json` is the source of truth, and generation runs
 * as a cancellable job in main whose progress arrives on `mediaSpriteProgress`.
 *
 * A sheet's centre is its job, the animation previewer with the frame strip and the pack export
 * (Theme G), then the spec at a glance.
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
      frames={sprite.data.frames}
      event={event}
      running={running}
      onGenerate={async (opts) => {
        const result = await actions.generate(ref, opts);
        if (result.ok) setJobs((current) => ({ ...current, [refKey]: result.value.jobId }));
        else return result.kind === 'error' ? result.message : 'Could not start generation.';
        return null;
      }}
      onCancel={() => (jobId ? void actions.cancel(jobId) : undefined)}
      animator={(spec) => (
        <SpriteAnimator
          repoId={repoId}
          target={ref}
          spec={spec}
          file={sprite.data.frames}
          version={String(sprite.dataUpdatedAt)}
          busy={running}
          progress={running && event ? { done: event.done, total: event.total } : null}
          apply={async (ops) => {
            const result = await actions.patchFrames(ref, ops);
            if (result.ok && result.value.jobId) setJobs((current) => ({ ...current, [refKey]: result.value.jobId! }));
            return result.ok;
          }}
        />
      )}
      environment={(spec) => <SpriteEnvironmentPreview repoId={repoId} target={ref} spec={spec} version={String(sprite.dataUpdatedAt)} busy={running} />}
      oneShot={(spec) => (
        <SpriteOneShotPanel
          repoId={repoId}
          target={ref}
          spec={spec}
          frames={sprite.data.frames}
          busy={running}
          onHandOff={async (row) => {
            const locked = await actions.setReference(ref, { fromFrame: { clip: row.clip, dir: row.dir, n: 0 } });
            if (!locked.ok) return locked.kind === 'error' ? locked.message : 'Could not set the reference.';
            const result = await actions.generate(ref, { clips: [row.clip], method: 'hand-drawn' });
            if (!result.ok) return result.kind === 'error' ? result.message : 'Could not start generation.';
            setJobs((current) => ({ ...current, [refKey]: result.value.jobId }));
            return null;
          }}
        />
      )}
      reference={(spec, generate) => (
        <SpriteReferenceCard
          repoId={repoId}
          target={ref}
          spec={spec}
          frameCount={Object.keys(sprite.data.frames.frames).length}
          busy={running}
          onTurnaround={generate}
          onChange={async (change: ReferenceChange) => {
            const result = await actions.setReference(ref, change);
            return result.ok ? null : result.kind === 'error' ? result.message : 'Could not update the reference.';
          }}
        />
      )}
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
  frames,
  event,
  running,
  onGenerate,
  onCancel,
  reference,
  oneShot,
  animator,
  environment,
}: {
  spec: SpriteAssetSpec;
  frames: SpriteFramesFile;
  event: SpriteProgressEvent | undefined;
  running: boolean;
  onGenerate: (opts?: { turnaround?: true }) => Promise<string | null>;
  onCancel: () => void;
  /** The hand-drawn reference card; given the sheet and a "draw a turnaround" action. */
  reference: (spec: Extract<SpriteAssetSpec, { kind: 'sheet' }>, generateTurnaround: () => void) => React.ReactNode;
  /** The one-shot grid preview and per-row verdict (Theme F). */
  oneShot: (spec: Extract<SpriteAssetSpec, { kind: 'sheet' }>) => React.ReactNode;
  /** The previewer, frame strip and export (Theme G). */
  animator: (spec: Extract<SpriteAssetSpec, { kind: 'sheet' }>) => React.ReactNode;
  /** An environment asset's preview and export (Themes H and I). */
  environment: (spec: Extract<SpriteAssetSpec, { kind: 'tileset' | 'background' | 'prop-sheet' }>) => React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const rows = specRows(spec);
  const frameCount = Object.keys(frames.frames).length;
  const outcome = event?.state === 'failed' || event?.state === 'cancelled' ? event.message : null;
  // A job that ended `done` can still carry a note, e.g. "Consistency not checked: …".
  const note = event?.state === 'done' ? event.message : undefined;
  const handDrawn = spec.kind === 'sheet' && spec.method === 'hand-drawn';
  const blocked = handDrawn ? handDrawnBlocker(spec) : null;
  const start = (opts?: { turnaround?: true }) => {
    setError(null);
    void onGenerate(opts).then(setError);
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4" data-testid="sprite-overview">
      <div className="flex items-center gap-2">
        <h2 className="truncate text-sm font-semibold">{spriteFolderLabel(spec.name)}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{spec.kind}</span>
        {spec.kind !== 'map' ? (
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
                disabled={blocked !== null}
                title={blocked ?? 'Generate'}
                onClick={() => start()}
                className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {handDrawn ? 'Generate frames' : 'Generate'}
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
      {note ? (
        <p role="status" className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
          {note}
        </p>
      ) : null}
      {spec.prompt ? <p className="text-xs text-muted-foreground">{spec.prompt}</p> : null}
      {spec.kind === 'sheet' ? animator(spec) : null}
      {spec.kind === 'tileset' || spec.kind === 'background' || spec.kind === 'prop-sheet' ? environment(spec) : null}
      {spec.kind === 'sheet' && handDrawn ? reference(spec, () => start({ turnaround: true })) : null}
      {spec.kind === 'sheet' && spec.oneShot ? oneShot(spec) : null}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {spec.kind === 'tileset' || spec.kind === 'background' || spec.kind === 'prop-sheet' ? (
          <>
            <dt className="text-muted-foreground">{{ tileset: 'Tiles built', background: 'Layers built', 'prop-sheet': 'Props built' }[spec.kind]}</dt>
            <dd className="tabular-nums">{spec.lastReport ? `${spec.lastReport.frames}${spec.lastReport.failing ? ` (${spec.lastReport.failing} with warnings)` : ''}` : 'not generated yet'}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Frames</dt>
            <dd className="tabular-nums">
              {frameCount}
              {spec.lastReport ? ` (${spec.lastReport.failing} failing)` : ''}
            </dd>
          </>
        )}
      </dl>
      <SpriteFlaggedFrames frames={frames} />
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

/** Rendered from 3D (Theme E): the model and how it is shot. */
function renderRows(spec: Extract<SpriteAssetSpec, { kind: 'sheet' }>): Array<[string, string]> {
  if (spec.method !== 'rendered') return [];
  const r = resolveRenderSettings(spec);
  return [
    ['Model', spec.reference?.kind === 'model' ? `${spec.reference.project}/${spec.reference.path}` : 'none attached'],
    ['Camera', `${r.camera}, ${Math.round(r.elevationDeg * 1000) / 1000}° down${r.azimuthDeg ? `, turned ${r.azimuthDeg}°` : ''}`],
    ['Shading', `${r.shading}${r.outline ? ' + outline' : ''}, ${r.supersample}× supersampled`],
  ];
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
        ...renderRows(spec),
      ];
    case 'tileset':
      return [
        ['Style', spec.style],
        ['Projection', spec.projection],
        ['Tile size', `${spec.tileSize} px`],
        ...(spec.fromTerrain
          ? ([['From terrain', `${spec.fromTerrain.project}/${spec.fromTerrain.terrain}, ${spec.fromTerrain.metresPerTile} m per tile`]] as Array<[string, string]>)
          : ([
              ['Autotiling', spec.scheme === 'blob47' ? '47-tile blob' : '16-tile corner'],
              ['Terrains', spec.terrains.map((t) => `${t.label} (${t.collision})`).join(', ')],
              ['Transitions', spec.transitions.map((t) => `${t.a} → ${t.b}`).join(', ') || 'none'],
            ] as Array<[string, string]>)),
      ];
    case 'background':
      return [['Style', spec.style], ['Size', `${spec.size[0]} × ${spec.size[1]}`], ['Layers', spec.layers.map((l) => `${l.name} ${l.scrollFactor}`).join(', ')]];
    case 'prop-sheet':
      return [['Style', spec.style], ['Cell', `${spec.cell[0]} × ${spec.cell[1]}`], ['Props', spec.props.map((p) => p.name).join(', ') || 'none']];
    case 'map':
      return [['Style', spec.style], ['Size', `${spec.size[0]} × ${spec.size[1]} tiles`], ['Tile size', String(spec.tileSize)]];
  }
}
